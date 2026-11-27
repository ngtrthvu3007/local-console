import { lines } from "@shared/codeSamples.ts";
import { DATA_SOURCE_TYPES, RUNTIMES, VTL_VERSION, type Runtime } from "./constants.ts";

// Code mẫu khi tạo resolver / function và schema mẫu khi tạo API (spec mục 4)

export interface ResolverCode {
  code?: string; // JS
  request?: string; // VTL
  response?: string; // VTL
}

const JS_RESPONSE = lines("export function response(ctx) {", "  return ctx.result;", "}");
const VTL_RESPONSE = "$util.toJson($ctx.result)";

const jsRequest = (...body: string[]) =>
  lines("export function request(ctx) {", ...body.map((line) => `  ${line}`), "}", "", JS_RESPONSE);

// Floci chỉ chuyển tham số sang Lambda qua request Invoke; resolver không code nhận event rỗng (spec 7 #6)
const TEMPLATES: Record<string, Record<Runtime, ResolverCode>> = {
  [DATA_SOURCE_TYPES.none]: {
    js: { code: jsRequest("return { payload: ctx.args };") },
    vtl: {
      request: lines(
        "{",
        `  "version": "${VTL_VERSION}",`,
        '  "payload": $util.toJson($ctx.args)',
        "}",
      ),
      response: VTL_RESPONSE,
    },
  },
  [DATA_SOURCE_TYPES.dynamodb]: {
    js: {
      code: lines(
        'import { util } from "@aws-appsync/utils";',
        "",
        jsRequest(
          "return {",
          '  operation: "GetItem",',
          "  key: util.dynamodb.toMapValues({ id: ctx.args.id }),",
          "};",
        ),
      ),
    },
    vtl: {
      request: lines(
        "{",
        `  "version": "${VTL_VERSION}",`,
        '  "operation": "GetItem",',
        '  "key": { "id": $util.dynamodb.toDynamoDBJson($ctx.args.id) }',
        "}",
      ),
      response: VTL_RESPONSE,
    },
  },
  [DATA_SOURCE_TYPES.lambda]: {
    js: {
      code: jsRequest(
        "return {",
        '  operation: "Invoke",',
        "  payload: { arguments: ctx.args, identity: ctx.identity },",
        "};",
      ),
    },
    vtl: {
      request: lines(
        "{",
        `  "version": "${VTL_VERSION}",`,
        '  "operation": "Invoke",',
        '  "payload": { "arguments": $util.toJson($ctx.args), "identity": $util.toJson($ctx.identity) }',
        "}",
      ),
      response: VTL_RESPONSE,
    },
  },
};

export const templateFor = (dataSourceType: string, runtime: Runtime): ResolverCode =>
  TEMPLATES[dataSourceType]?.[runtime] ?? TEMPLATES[DATA_SOURCE_TYPES.none][runtime];

// Resolver pipeline: before / after bao quanh các function, kết quả là của function cuối
export const PIPELINE_TEMPLATE: Record<Runtime, ResolverCode> = {
  [RUNTIMES.js]: {
    code: lines(
      "export function request(ctx) {",
      "  return {};",
      "}",
      "",
      "export function response(ctx) {",
      "  return ctx.prev.result;",
      "}",
    ),
  },
  [RUNTIMES.vtl]: { request: "{}", response: "$util.toJson($ctx.prev.result)" },
};

export const STARTER_SCHEMA = lines(
  "type Todo {",
  "  id: ID!",
  "  title: String",
  "}",
  "",
  "type Query {",
  "  getTodo(id: ID!): Todo",
  "}",
  "",
  "type Mutation {",
  "  addTodo(id: ID!, title: String): Todo",
  "}",
);

const CODE_FIELDS = ["code", "request", "response"] as const;

// Người dùng chưa sửa code (còn trống hoặc đúng mẫu trước): đổi data source / runtime thì thay mẫu mới
export const isUntouched = (values: ResolverCode, template: ResolverCode) =>
  CODE_FIELDS.every((field) => {
    const value = values[field] ?? "";
    return !value.trim() || value === (template[field] ?? "");
  });
