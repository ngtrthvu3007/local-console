import { z } from "zod";
import { enumOfKeys, wholeNumberIn } from "#shared/validation/schemas.ts";
import {
  API_KEY_DAYS,
  API_NAME_MAX_LENGTH,
  API_NAME_PATTERN,
  AUTH_TYPES,
  DATA_SOURCE_TYPES,
  RESOLVER_KINDS,
  RESOURCE_NAME_PATTERN,
  RUNTIMES,
} from "./constants.ts";

const authType = z.enum(Object.values(AUTH_TYPES));
const POOL_REQUIRED = { path: ["userPoolId"], message: "Choose a user pool." };

const apiName = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(API_NAME_MAX_LENGTH, `Use at most ${API_NAME_MAX_LENGTH} characters.`)
  .regex(API_NAME_PATTERN, "Use letters, numbers, spaces, _ and -.");

// Tên data source / function: chữ, số, _ (luật AWS); không trùng cái khác của API
const resourceName = (existing: readonly string[]) =>
  z
    .string()
    .trim()
    .min(1, "Enter a name.")
    .regex(RESOURCE_NAME_PATTERN, "Use letters, numbers and _.")
    .refine((name) => !existing.includes(name), "This name is already used.");

export const createApiSchema = z
  .object({ name: apiName, authType, userPoolId: z.string() })
  .refine((values) => values.authType !== AUTH_TYPES.cognito || values.userPoolId, POOL_REQUIRED);
export type CreateApiForm = z.input<typeof createApiSchema>;

export const renameSchema = z.object({ name: apiName });

export const authorizationSchema = z
  .object({ defaultType: authType, additional: z.array(authType), userPoolId: z.string() })
  .refine(
    ({ defaultType, additional, userPoolId }) =>
      userPoolId || ![defaultType, ...additional].includes(AUTH_TYPES.cognito),
    POOL_REQUIRED,
  );

export const apiKeySchema = z.object({
  description: z.string().trim(),
  days: wholeNumberIn(API_KEY_DAYS, "days"),
});

export const dataSourceSchema = (existingNames: readonly string[]) =>
  z
    .object({
      name: resourceName(existingNames),
      type: z.enum(Object.values(DATA_SOURCE_TYPES)),
      tableName: z.string(),
      functionArn: z.string(),
      description: z.string().trim(),
    })
    .superRefine((values, context) => {
      if (values.type === DATA_SOURCE_TYPES.dynamodb && !values.tableName)
        context.addIssue({ code: "custom", path: ["tableName"], message: "Choose a table." });
      if (values.type === DATA_SOURCE_TYPES.lambda && !values.functionArn)
        context.addIssue({ code: "custom", path: ["functionArn"], message: "Choose a function." });
    });
export type DataSourceForm = z.input<ReturnType<typeof dataSourceSchema>>;

// Code: JS một khối; VTL bắt buộc request template (response để trống thì AppSync trả kết quả nguyên)
const codeShape = {
  runtime: enumOfKeys(RUNTIMES),
  code: z.string(),
  request: z.string(),
  response: z.string(),
};

type CodeValues = { runtime: string; code: string; request: string };
const checkCode = (values: CodeValues, context: z.RefinementCtx) => {
  if (values.runtime === RUNTIMES.js && !values.code.trim())
    context.addIssue({ code: "custom", path: ["code"], message: "Enter the code." });
  if (values.runtime === RUNTIMES.vtl && !values.request.trim())
    context.addIssue({ code: "custom", path: ["request"], message: "Enter the request template." });
};

export const resolverSchema = z
  .object({
    kind: z.enum(Object.values(RESOLVER_KINDS)),
    dataSourceName: z.string(),
    functionIds: z.array(z.string()),
    ...codeShape,
  })
  .superRefine((values, context) => {
    checkCode(values, context);
    if (values.kind === RESOLVER_KINDS.unit && !values.dataSourceName)
      context.addIssue({
        code: "custom",
        path: ["dataSourceName"],
        message: "Choose a data source.",
      });
    if (values.kind === RESOLVER_KINDS.pipeline && !values.functionIds.some(Boolean))
      context.addIssue({ code: "custom", path: ["functionIds"], message: "Add a function." });
  });
export type ResolverForm = z.input<typeof resolverSchema>;

export const functionSchema = (existingNames: readonly string[]) =>
  z
    .object({
      name: resourceName(existingNames),
      dataSourceName: z.string().min(1, "Choose a data source."),
      ...codeShape,
    })
    .superRefine(checkCode);
export type FunctionForm = z.input<ReturnType<typeof functionSchema>>;
