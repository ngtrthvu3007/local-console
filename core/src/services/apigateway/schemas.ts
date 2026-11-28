import { z } from "zod";
import { API_TYPES, type ApiType } from "./apis.ts";
import { isLambdaAuthorizer, readsOneSource } from "./authorizers.ts";
import {
  AUTHORIZER_TYPES,
  DEFAULT_KEY,
  IDENTITY_LIST_SEPARATOR,
  METHOD_ORDER,
  NAME_MAX_LENGTH,
} from "./constants.ts";

type AddIssue = (path: string, message: string) => void;

const issueAdder =
  (context: z.RefinementCtx): AddIssue =>
  (path, message) =>
    context.addIssue({ code: "custom", path: [path], message });

const nameRule = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(NAME_MAX_LENGTH, `Must be at most ${NAME_MAX_LENGTH} characters.`);

const splitList = (text: string) =>
  text
    .split(IDENTITY_LIST_SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean);

export const apiSchema = z
  .object({
    type: z.enum([API_TYPES.rest, API_TYPES.http, API_TYPES.websocket]),
    name: nameRule,
    description: z.string().trim(),
    functionArn: z.string(),
    grant: z.boolean(),
    routeSelection: z.string().trim(),
  })
  .superRefine((values, context) => {
    if (values.type === API_TYPES.websocket && !values.routeSelection) {
      issueAdder(context)("routeSelection", "Enter a route selection expression.");
    }
  });

export type ApiForm = z.input<typeof apiSchema>;
export type ApiValues = z.output<typeof apiSchema>;

const SEGMENT = "[A-Za-z0-9._-]+";
const PATH_PART = new RegExp(`^(${SEGMENT}|\\{${SEGMENT}\\+?\\})$`);
// AWS: mỗi cấp chỉ một path variable ({id} hoặc {proxy+})
const PATH_VARIABLE = /^\{.+\}$/;

export const resourceSchema = (siblings: readonly string[]) =>
  z.object({
    pathPart: z
      .string()
      .trim()
      .regex(
        PATH_PART,
        "Use letters, numbers, periods (.), hyphens (-) and underscores (_), or {name} / {name+} for a path variable.",
      )
      .superRefine((part, context) => {
        const variable = siblings.find((sibling) => PATH_VARIABLE.test(sibling));
        if (siblings.includes(part)) {
          context.addIssue({ code: "custom", message: `A resource /${part} already exists.` });
        } else if (variable && PATH_VARIABLE.test(part)) {
          context.addIssue({
            code: "custom",
            message: `This level already has the path variable ${variable}.`,
          });
        }
      }),
  });

// "other": integration console không sửa (AWS, MOCK… do CDK tạo), giữ nguyên khi lưu
const INTEGRATION_KINDS = ["lambda", "http", "other"] as const;
type IntegrationKind = (typeof INTEGRATION_KINDS)[number];
const URL_SCHEME = /^https?:\/\//;

const targetFields = {
  integration: z.enum(INTEGRATION_KINDS),
  functionArn: z.string(),
  grant: z.boolean(),
  url: z.string().trim(),
  // NONE, AWS_IAM hoặc ID authorizer
  authorization: z.string(),
};

function checkTarget(
  values: { integration: IntegrationKind; functionArn: string; url: string },
  addIssue: AddIssue,
) {
  if (values.integration === "lambda" && !values.functionArn) {
    addIssue("functionArn", "Choose a function.");
  }
  if (values.integration === "http" && !URL_SCHEME.test(values.url)) {
    addIssue("url", "Enter a URL that starts with http:// or https://.");
  }
}

const isApiMethod = (method: string) => METHOD_ORDER.includes(method);

export const methodSchema = z
  .object({ httpMethod: z.string(), ...targetFields })
  .superRefine((values, context) => {
    const addIssue = issueAdder(context);
    if (!isApiMethod(values.httpMethod)) addIssue("httpMethod", "Choose a method.");
    checkTarget(values, addIssue);
  });

export type MethodForm = z.input<typeof methodSchema>;
export type MethodValues = z.output<typeof methodSchema>;

// "/" hoặc các đoạn tên / {tên}; {tên+} chỉ ở cuối
const ROUTE_SEGMENT = `${SEGMENT}|\\{${SEGMENT}\\}`;
const ROUTE_PATH = new RegExp(
  `^(/|(/(${ROUTE_SEGMENT}))*(/(${ROUTE_SEGMENT})|/\\{${SEGMENT}\\+\\}))$`,
);

interface RouteKeyFields {
  method: string;
  path: string;
  isDefault: boolean;
  routeKey: string;
}

// HTTP ghép method + path, WebSocket dùng nguyên chữ người dùng nhập
function routeKeyOf(apiType: ApiType, values: RouteKeyFields) {
  if (apiType === API_TYPES.websocket) return values.routeKey;
  return values.isDefault ? DEFAULT_KEY : `${values.method} ${values.path}`;
}

function checkRouteKey(apiType: ApiType, values: RouteKeyFields, addIssue: AddIssue) {
  if (apiType === API_TYPES.websocket) {
    if (!values.routeKey) addIssue("routeKey", "Enter a route key.");
    if (values.routeKey.length > NAME_MAX_LENGTH) {
      addIssue("routeKey", `Must be at most ${NAME_MAX_LENGTH} characters.`);
    }
    return;
  }
  if (values.isDefault) return;
  if (!isApiMethod(values.method)) addIssue("method", "Choose a method.");
  if (!ROUTE_PATH.test(values.path)) {
    addIssue(
      "path",
      "Start with / and use letters, numbers, periods (.), hyphens (-), underscores (_) or {name}; {name+} only at the end.",
    );
  }
}

export const routeSchema = (apiType: ApiType, existingKeys: readonly string[]) =>
  z
    .object({
      method: z.string(),
      path: z.string().trim(),
      isDefault: z.boolean(),
      routeKey: z.string().trim(),
      ...targetFields,
      twoWay: z.boolean(),
    })
    .superRefine((values, context) => {
      const addIssue = issueAdder(context);
      checkRouteKey(apiType, values, addIssue);

      const key = routeKeyOf(apiType, values);
      if (existingKeys.includes(key)) {
        const field = apiType === API_TYPES.websocket ? "routeKey" : "path";
        addIssue(values.isDefault ? "isDefault" : field, `Route ${key} already exists.`);
      }
      if (apiType === API_TYPES.websocket && values.integration === "http") {
        addIssue("integration", "WebSocket routes call a Lambda function.");
      }
      checkTarget(values, addIssue);
    })
    .transform(({ method, path, isDefault, routeKey, ...target }) => ({
      ...target,
      routeKey: routeKeyOf(apiType, { method, path, isDefault, routeKey }),
    }));

export type RouteForm = z.input<ReturnType<typeof routeSchema>>;
export type RouteValues = z.output<ReturnType<typeof routeSchema>>;

const IDENTITY_NAME = { header: /^[A-Za-z0-9-]+$/, querystring: /^[A-Za-z0-9._-]+$/ };
const IDENTITY_TEXT = { header: "header", querystring: "query string parameter" };
export const authorizerSchema = (existingNames: readonly string[]) =>
  z
    .object({
      name: nameRule,
      type: z.string(),
      functionArn: z.string(),
      grant: z.boolean(),
      poolId: z.string(),
      issuer: z.string().trim(),
      audience: z.string(),
      identityKind: z.enum(["header", "querystring"]),
      identityNames: z.string(),
    })
    .superRefine((values, context) => {
      const addIssue = issueAdder(context);
      if (existingNames.includes(values.name)) {
        addIssue("name", `Authorizer ${values.name} already exists.`);
      }
      if (isLambdaAuthorizer(values.type) && !values.functionArn) {
        addIssue("functionArn", "Choose a function.");
      }
      if (values.type === AUTHORIZER_TYPES.cognito && !values.poolId) {
        addIssue("poolId", "Choose a user pool.");
      }
      if (values.type === AUTHORIZER_TYPES.jwt && !URL.canParse(values.issuer)) {
        addIssue("issuer", "Enter the issuer URL.");
      }

      // AWS: chỉ REQUEST authorizer đọc được query string; TOKEN / Cognito / JWT đọc một header
      if (values.identityKind === "querystring" && values.type !== AUTHORIZER_TYPES.request) {
        addIssue("identityKind", "Only REQUEST authorizers read a query string.");
      }

      const names = splitList(values.identityNames);
      const text = IDENTITY_TEXT[values.identityKind];
      if (!names.length) addIssue("identityNames", `Enter a ${text}.`);
      else if (!names.every((name) => IDENTITY_NAME[values.identityKind].test(name))) {
        addIssue("identityNames", `Use letters, numbers and hyphens (-) in each ${text} name.`);
      } else if (readsOneSource(values.type) && names.length > 1) {
        addIssue("identityNames", `Enter one ${text}.`);
      }
    })
    .transform((values) => ({
      ...values,
      identityNames: splitList(values.identityNames),
      audience: splitList(values.audience),
    }));

export type AuthorizerForm = z.input<ReturnType<typeof authorizerSchema>>;
export type AuthorizerValues = z.output<ReturnType<typeof authorizerSchema>>;

const STAGE_NAME = new RegExp(`^[A-Za-z0-9_-]{1,${NAME_MAX_LENGTH}}$`);

export const stageSchema = (apiType: ApiType, existingNames: readonly string[]) =>
  z.object({ name: z.string().trim() }).superRefine(({ name }, context) => {
    const addIssue = issueAdder(context);
    const valid = STAGE_NAME.test(name) || (apiType === API_TYPES.http && name === DEFAULT_KEY);
    if (!valid) {
      addIssue(
        "name",
        `Use 1–${NAME_MAX_LENGTH} letters, numbers, hyphens (-) and underscores (_).`,
      );
    } else if (existingNames.includes(name)) {
      addIssue("name", `Stage ${name} already exists.`);
    }
  });
