import type {
  AdditionalAuthenticationProvider,
  ApiKey,
  DataSource,
  CreateFunctionRequest,
  CreateResolverRequest,
  FunctionConfiguration,
  GraphqlApi,
  Resolver,
  UpdateGraphqlApiRequest,
} from "@aws-sdk/client-appsync";
import { Kind, buildSchema, isObjectType, parse } from "graphql";
import { MILLISECONDS_PER_SECOND, NOT_AVAILABLE, SECONDS_PER_DAY } from "#shared/constants.ts";
import { jsonObjectError } from "#shared/utils/json.ts";
import { decodeJwt, isExpired } from "#services/cognito/auth.ts";
import {
  AUTH_LABELS,
  AUTH_TYPES,
  COGNITO_DEFAULT_ACTION,
  EDITABLE_AUTH_TYPES,
  JS_RUNTIME,
  QUERY_ALERTS,
  RESOLVER_KINDS,
  ROOT_TYPES,
  RUNTIME_LABELS,
  RUNTIMES,
  VTL_VERSION,
  type AuthType,
} from "./constants.ts";
import type { FunctionForm, ResolverForm } from "./schemas.ts";

// Hàm thuần của trang AppSync: endpoint, đọc SDL, operation, lỗi schema, "đang dùng", auth

// ---------- Endpoint ----------

// Floci trả host FLOCI_HOSTNAME (localhost.floci.io); app trên máy dev dùng địa chỉ Floci đã cấu hình
export const localEndpoint = (flociPublicUrl: string, graphqlUri: string) =>
  new URL(new URL(graphqlUri).pathname, flociPublicUrl).toString();

// Trình duyệt gửi query qua proxy của console: cùng origin, không CORS (spec 7 #16)
export const proxyGraphqlUrl = (proxyBase: string, graphqlUri: string) =>
  `${proxyBase}${new URL(graphqlUri).pathname}`;

// ---------- Đọc schema ----------

// Scalar và directive riêng của AppSync: graphql-js không biết, SDL dùng chúng sẽ không đọc được
const APPSYNC_PRELUDE = `
scalar AWSDate
scalar AWSTime
scalar AWSDateTime
scalar AWSTimestamp
scalar AWSEmail
scalar AWSJSON
scalar AWSURL
scalar AWSPhone
scalar AWSIPAddress
directive @aws_api_key on OBJECT | FIELD_DEFINITION
directive @aws_iam on OBJECT | FIELD_DEFINITION
directive @aws_oidc on OBJECT | FIELD_DEFINITION
directive @aws_lambda on OBJECT | FIELD_DEFINITION
directive @aws_cognito_user_pools(cognito_groups: [String]) on OBJECT | FIELD_DEFINITION
directive @aws_auth(cognito_groups: [String]) on OBJECT | FIELD_DEFINITION
directive @aws_subscribe(mutations: [String]) on FIELD_DEFINITION
`;

export interface SchemaType {
  name: string;
  fields: string[];
}

const rootOrder = (name: string) => {
  const index = ROOT_TYPES.indexOf(name);
  return index < 0 ? ROOT_TYPES.length : index;
};

// ListTypes của Floci luôn rỗng (spec 7 #2): đọc type / field từ SDL. null = SDL không đọc được
export function readSchema(sdl: string): SchemaType[] | null {
  try {
    const schema = buildSchema(`${APPSYNC_PRELUDE}\n${sdl}`);
    return Object.values(schema.getTypeMap())
      .filter(isObjectType)
      .filter((type) => !type.name.startsWith("__"))
      .map((type) => ({ name: type.name, fields: Object.keys(type.getFields()) }))
      .sort((a, b) => rootOrder(a.name) - rootOrder(b.name));
  } catch {
    return null;
  }
}

interface WrappedSchema {
  schema?: { definition?: unknown };
}

// AWS trả SDL trơn; Floci bọc trong JSON {"schema":{"definition":"…"}} nên SDK nhận cả chuỗi JSON
export function sdlOfIntrospection(text: string): string {
  try {
    const parsed: WrappedSchema = JSON.parse(text);
    const definition = parsed.schema?.definition;
    return typeof definition === "string" ? definition : text;
  } catch {
    return text;
  }
}

export interface Operation {
  name?: string;
  kind: "query" | "mutation" | "subscription";
}

// Operation trong editor Queries; cú pháp sai → [] (Floci báo lỗi cụ thể khi chạy)
export function operationsOf(document: string): Operation[] {
  try {
    return parse(document).definitions.flatMap((definition) =>
      definition.kind === Kind.OPERATION_DEFINITION
        ? [{ name: definition.name?.value, kind: definition.operation }]
        : [],
    );
  } catch {
    return [];
  }
}

export function parseVariables(text: string): { value?: Record<string, unknown>; error?: string } {
  const error = jsonObjectError(text, "Variables must be a JSON object.");
  return error ? { error } : { value: JSON.parse(text.trim() || "{}") };
}

// ---------- Lỗi lưu schema ----------

// "Unknown type Foo [@28:1]": số dòng của Floci lệch ~27 dòng (spec 7 #3) nên bỏ
const LOCATION_SUFFIX = /\s*\[@\d+:\d+\]/g;

interface SchemaErrorDetails {
  detail?: { codeErrors?: { value?: string }[] };
}

// details là chuỗi JSON có codeErrors; chuỗi khác hiện nguyên văn
export function schemaErrors(details?: string): string[] {
  if (!details) return [];

  try {
    const parsed: SchemaErrorDetails = JSON.parse(details);
    const messages = (parsed.detail?.codeErrors ?? []).flatMap(({ value }) =>
      value ? [value.replace(LOCATION_SUFFIX, "")] : [],
    );
    return messages.length ? messages : [details];
  } catch {
    return [details];
  }
}

// ---------- Bảng Resolvers ----------

export interface ResolverRow {
  typeName: string;
  fieldName: string;
  resolver?: Resolver;
  notInSchema: boolean;
}

// Field của Query / Mutation / Subscription luôn có dòng (để gắn resolver); type khác chỉ dòng có
// resolver. Resolver trên field không còn trong schema (Floci nhận, spec 7 #7) vẫn hiện
export function resolverRows(
  types: readonly SchemaType[],
  resolvers: readonly Resolver[],
): ResolverRow[] {
  const byType = (typeName: string) =>
    resolvers.filter((resolver) => resolver.typeName === typeName);

  // Resolver chỉ được tra theo type có trong schema nên không có resolver của type đã xóa
  const rows = types.flatMap(({ name, fields }) => {
    const own = byType(name);
    const find = (field: string) => own.find((resolver) => resolver.fieldName === field);
    const listed = ROOT_TYPES.includes(name) ? fields : fields.filter((field) => find(field));
    const gone = own.filter((resolver) => !fields.includes(resolver.fieldName ?? ""));

    return [
      ...listed.map((fieldName) => ({
        typeName: name,
        fieldName,
        resolver: find(fieldName),
        notInSchema: false,
      })),
      ...gone.map((resolver) => ({
        typeName: name,
        fieldName: resolver.fieldName ?? "",
        resolver,
        notInSchema: true,
      })),
    ];
  });
  return rows;
}

// ---------- Form resolver / function ↔ request ----------

type CodeForm = Pick<ResolverForm, "runtime" | "code" | "request" | "response">;

// JS: runtime + code; VTL: hai template (response trống thì không gửi)
const codeInput = ({ runtime, code, request, response }: CodeForm) =>
  runtime === RUNTIMES.js
    ? { runtime: { ...JS_RUNTIME }, code }
    : { requestMappingTemplate: request, responseMappingTemplate: response || undefined };

const codeForm = (source: Resolver | FunctionConfiguration): CodeForm => ({
  runtime: source.runtime?.name === JS_RUNTIME.name ? RUNTIMES.js : RUNTIMES.vtl,
  code: source.code ?? "",
  request: source.requestMappingTemplate ?? "",
  response: source.responseMappingTemplate ?? "",
});

export function resolverInput(
  form: ResolverForm,
  typeName: string,
  fieldName: string,
): Omit<CreateResolverRequest, "apiId"> {
  const pipeline = form.kind === RESOLVER_KINDS.pipeline;
  return {
    typeName,
    fieldName,
    kind: form.kind,
    // Thứ tự dòng = thứ tự chạy; dòng chưa chọn function thì bỏ
    ...(pipeline
      ? { pipelineConfig: { functions: form.functionIds.filter(Boolean) } }
      : { dataSourceName: form.dataSourceName }),
    ...codeInput(form),
  };
}

export const formOfResolver = (resolver: Resolver): ResolverForm => ({
  kind: resolver.kind === RESOLVER_KINDS.pipeline ? RESOLVER_KINDS.pipeline : RESOLVER_KINDS.unit,
  dataSourceName: resolver.dataSourceName ?? "",
  functionIds: resolver.pipelineConfig?.functions ?? [],
  ...codeForm(resolver),
});

export const functionInput = (form: FunctionForm): Omit<CreateFunctionRequest, "apiId"> => ({
  name: form.name.trim(),
  dataSourceName: form.dataSourceName,
  ...(form.runtime === RUNTIMES.vtl ? { functionVersion: VTL_VERSION } : {}),
  ...codeInput(form),
});

export const formOfFunction = (fn: FunctionConfiguration): FunctionForm => ({
  name: fn.name ?? "",
  dataSourceName: fn.dataSourceName ?? "",
  ...codeForm(fn),
});

// ---------- "Đang dùng" ----------

export const fieldLabel = (resolver: Pick<Resolver, "typeName" | "fieldName">) =>
  `${resolver.typeName}.${resolver.fieldName}`;

const add = (map: Map<string, string[]>, key: string | undefined, label: string) => {
  if (key) map.set(key, [...(map.get(key) ?? []), label]);
};

// Floci cho xóa data source / function đang dùng và ListResolversByFunction luôn rỗng (spec 7 #8):
// console tự dò để chặn xóa
export function usageOf(
  resolvers: readonly Resolver[],
  functions: readonly FunctionConfiguration[],
) {
  const dataSources = new Map<string, string[]>();
  const functionUsers = new Map<string, string[]>();

  for (const resolver of resolvers) add(dataSources, resolver.dataSourceName, fieldLabel(resolver));

  const pipelineSteps = resolvers.flatMap((resolver) =>
    (resolver.pipelineConfig?.functions ?? []).map((id) => [id, fieldLabel(resolver)] as const),
  );
  for (const [functionId, label] of pipelineSteps) add(functionUsers, functionId, label);
  for (const fn of functions) add(dataSources, fn.dataSourceName, `function ${fn.name}`);

  return { dataSources, functions: functionUsers };
}

// ---------- Sửa API ----------

// UpdateGraphqlApi ghi đè cả cấu hình: gửi lại mọi field đang có để không mất thứ console không sửa
export const baseUpdate = (api: GraphqlApi): UpdateGraphqlApiRequest => ({
  apiId: api.apiId,
  name: api.name,
  authenticationType: api.authenticationType,
  userPoolConfig: api.userPoolConfig,
  openIDConnectConfig: api.openIDConnectConfig,
  lambdaAuthorizerConfig: api.lambdaAuthorizerConfig,
  additionalAuthenticationProviders: api.additionalAuthenticationProviders,
  logConfig: api.logConfig,
  xrayEnabled: api.xrayEnabled,
  introspectionConfig: api.introspectionConfig,
  queryDepthLimit: api.queryDepthLimit,
  resolverCountLimit: api.resolverCountLimit,
});

export interface AuthorizationChange {
  defaultType: AuthType;
  additional: AuthType[];
  userPoolId?: string;
  region: string;
}

// Pool Cognito console quản lý: của auth mặc định, không thì auth phụ Cognito đầu tiên
export const managedPoolOf = (api: GraphqlApi) =>
  api.userPoolConfig?.userPoolId ??
  api.additionalAuthenticationProviders?.find(
    (provider) => provider.authenticationType === AUTH_TYPES.cognito,
  )?.userPoolConfig?.userPoolId;

// Giữ nguyên auth phụ console không sửa: OIDC, Lambda authorizer, pool Cognito thứ hai trở đi
export function withAuthorization(
  api: GraphqlApi,
  { defaultType, additional, userPoolId, region }: AuthorizationChange,
): UpdateGraphqlApiRequest {
  const managedPool = managedPoolOf(api);
  const kept = (api.additionalAuthenticationProviders ?? []).filter(
    ({ authenticationType, userPoolConfig }) =>
      !EDITABLE_AUTH_TYPES.includes(authenticationType ?? "") ||
      (authenticationType === AUTH_TYPES.cognito && userPoolConfig?.userPoolId !== managedPool),
  );
  const pool = userPoolId ? { userPoolId, awsRegion: region } : undefined;
  // Cùng pool thì giữ cấu hình CDK đặt (defaultAction DENY, appIdClientRegex…)
  const samePool = <T extends { userPoolId?: string }>(config?: T) =>
    config?.userPoolId === userPoolId ? config : undefined;
  const currentAdditional = api.additionalAuthenticationProviders?.find(
    (provider) =>
      provider.authenticationType === AUTH_TYPES.cognito &&
      provider.userPoolConfig?.userPoolId === managedPool,
  )?.userPoolConfig;
  const added = additional.map((authenticationType): AdditionalAuthenticationProvider =>
    authenticationType === AUTH_TYPES.cognito
      ? { authenticationType, userPoolConfig: samePool(currentAdditional) ?? pool }
      : { authenticationType },
  );

  return {
    ...baseUpdate(api),
    authenticationType: defaultType,
    userPoolConfig:
      defaultType === AUTH_TYPES.cognito && pool
        ? (samePool(api.userPoolConfig) ?? { ...pool, defaultAction: COGNITO_DEFAULT_ACTION })
        : undefined,
    additionalAuthenticationProviders: [...added, ...kept],
  };
}

// Kiểu auth console gọi được mà API bật, mặc định trước (Queries, Connect, Settings)
export function authTypesOf(api: GraphqlApi): AuthType[] {
  const types = [
    api.authenticationType,
    ...(api.additionalAuthenticationProviders ?? []).map((provider) => provider.authenticationType),
  ];
  return Object.values(AUTH_TYPES)
    .filter((type) => types.includes(type))
    .sort((a, b) => types.indexOf(a) - types.indexOf(b));
}

// ---------- API key ----------

// Hạn API key theo giây epoch, tính từ bây giờ
export const apiKeyExpires = (days: number, nowMs: number) =>
  Math.floor(nowMs / MILLISECONDS_PER_SECOND) + days * SECONDS_PER_DAY;

// ---------- Nhãn ----------

export const authLabel = (type?: string) => (type ? (AUTH_LABELS[type] ?? type) : NOT_AVAILABLE);

export const runtimeLabel = (source?: Pick<Resolver, "runtime">) => {
  if (!source) return NOT_AVAILABLE;
  return source.runtime?.name === JS_RUNTIME.name ? RUNTIME_LABELS.js : RUNTIME_LABELS.vtl;
};

export const dataSourceOptions = (dataSources: readonly DataSource[]) =>
  dataSources.flatMap(({ name }) => (name ? [{ value: name, label: name }] : []));

// ---------- Kết quả query ----------

const HTTP_UNAUTHORIZED = 401;
const HTTP_BAD_GATEWAY = 502;
// Floci trả 502 + lỗi này khi API chưa có schema (spec 7 #5)
const NO_SCHEMA_ERROR = "GraphQLSchemaException";

export function queryAlert(status: number, body: string): string | undefined {
  if (status === HTTP_UNAUTHORIZED) return QUERY_ALERTS.unauthorized;
  if (status === HTTP_BAD_GATEWAY && body.includes(NO_SCHEMA_ERROR)) return QUERY_ALERTS.noSchema;
  return undefined;
}

// Đổi chỗ function trong pipeline (thứ tự = thứ tự chạy); ra ngoài danh sách thì giữ nguyên
export function moveAt<T>(items: readonly T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset;
  if (target < 0 || target >= items.length) return [...items];
  return items.with(index, items[target]).with(target, items[index]);
}

// Token Cognito trong tab Queries hết hạn (khoảng 1 giờ) hoặc hỏng: phải đăng nhập lại
export function tokenExpired(idToken: string, nowMs: number): boolean {
  try {
    const { exp } = decodeJwt(idToken).payload;
    return exp === undefined || isExpired(exp, nowMs);
  } catch {
    return true;
  }
}

// Key còn hạn (expires là giây epoch)
export const isValidKey = (key: Pick<ApiKey, "expires">, nowMs: number) =>
  (key.expires ?? 0) * MILLISECONDS_PER_SECOND > nowMs;
