import {
  AddPermissionCommand,
  CreateFunctionCommand,
  DeleteEventSourceMappingCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  GetPolicyCommand,
  ListEventSourceMappingsCommand,
  paginateListFunctions,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  type LambdaClient,
  type Runtime,
  type UpdateFunctionConfigurationCommandInput,
} from "@aws-sdk/client-lambda";
import { orEmptyWhenNotFound } from "#shared/aws/errors.ts";
import { collectPages } from "#shared/aws/pagination.ts";
import { runEach } from "#shared/utils/bulk.ts";
import type { LogsService } from "#services/logs/service.ts";
import type { SecretsService } from "#services/secretsmanager/service.ts";
import { APIGATEWAY_PRINCIPAL } from "#services/apigateway/constants.ts";
import {
  DEFAULT_ROLE_ARN,
  INVOKE_FUNCTION_ACTION,
  RESOURCE_CONFLICT_ERROR,
} from "#services/lambda/constants.ts";
import { unzipPackage } from "#services/lambda/zipArchive.ts";

export interface CreateFunctionInput {
  name: string;
  runtime: Runtime;
  handler: string;
  memory: number;
  timeout: number;
  zipFile: Uint8Array;
}

export interface FunctionToDelete {
  name: string;
  arn: string;
  logGroup: string;
}

export interface DeleteFunctionsInput {
  functions: FunctionToDelete[];
  deleteLogGroups: boolean;
  deleteTriggers: boolean;
}

export type ConfigurationChanges = Omit<UpdateFunctionConfigurationCommandInput, "FunctionName">;

export const listFunctions = (lambda: LambdaClient) =>
  collectPages(paginateListFunctions({ client: lambda }, {}), (page) => page.Functions);

export const getFunction = (lambda: LambdaClient, name: string) =>
  lambda.send(new GetFunctionCommand({ FunctionName: name }));

export const createFunction = (lambda: LambdaClient, input: CreateFunctionInput) =>
  lambda.send(
    new CreateFunctionCommand({
      FunctionName: input.name,
      Runtime: input.runtime,
      Handler: input.handler,
      Role: DEFAULT_ROLE_ARN,
      MemorySize: input.memory,
      Timeout: input.timeout,
      Code: { ZipFile: input.zipFile },
    }),
  );

// Floci không xóa trigger khi xóa function nên cảnh báo trước; chỉ cần biết có hay không nên đọc trang đầu
export async function listFunctionsWithTriggers(lambda: LambdaClient, names: readonly string[]) {
  const checks = await Promise.all(
    names.map(async (name) => {
      const { EventSourceMappings } = await lambda.send(
        new ListEventSourceMappingsCommand({ FunctionName: name }),
      );

      return { name, triggered: Boolean(EventSourceMappings?.length) };
    }),
  );

  return checks.filter((check) => check.triggered).map((check) => check.name);
}

// Floci giữ rotation trỏ tới function đã xóa: lần xoay vòng sau của secret sẽ lỗi, nên cảnh báo trước
export async function listRotationUses(
  secrets: Pick<SecretsService, "listRotatedSecrets">,
  functions: readonly { name: string; arn: string }[],
) {
  const uses = await Promise.all(
    functions.map(async ({ name, arn }) =>
      (await secrets.listRotatedSecrets(arn)).map((secret) => ({ secret, fn: name })),
    ),
  );

  return uses.flat();
}

export const deleteFunctions = (
  lambda: LambdaClient,
  logs: Pick<LogsService, "logGroupExists" | "deleteLogGroup">,
  input: DeleteFunctionsInput,
) =>
  runEach(
    input.functions,
    (item) => item.name,
    async ({ name, logGroup }) => {
      // Lấy danh sách trước khi xóa function; xóa trigger sau để function xóa lỗi thì trigger còn nguyên
      const mappings = input.deleteTriggers
        ? ((await lambda.send(new ListEventSourceMappingsCommand({ FunctionName: name })))
            .EventSourceMappings ?? [])
        : [];

      await lambda.send(new DeleteFunctionCommand({ FunctionName: name }));

      // Floci (như AWS) giữ trigger của function đã xóa: chúng chạy lại khi tạo function cùng tên
      for (const { UUID } of mappings) {
        await lambda.send(new DeleteEventSourceMappingCommand({ UUID }));
      }

      // Chưa có log group thì bỏ qua, để DeleteLogGroup không trả 400 (trình duyệt ghi console.error)
      if (input.deleteLogGroups && (await logs.logGroupExists(logGroup))) {
        await logs.deleteLogGroup(logGroup);
      }
    },
  );

// Dùng cho cấu hình chung và biến môi trường (Environment luôn phải gửi đủ cả danh sách)
export const updateConfiguration = (
  lambda: LambdaClient,
  name: string,
  changes: ConfigurationChanges,
) => lambda.send(new UpdateFunctionConfigurationCommand({ FunctionName: name, ...changes }));

export const deployCode = (lambda: LambdaClient, name: string, zipFile: Uint8Array) =>
  lambda.send(new UpdateFunctionCodeCommand({ FunctionName: name, ZipFile: zipFile }));

export async function getCodePackage(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't download the code (HTTP ${response.status})`);
  return unzipPackage(new Uint8Array(await response.arrayBuffer()));
}

// Function không có policy thì Lambda trả 404: coi như rỗng
export const getPolicy = (lambda: LambdaClient, name: string) =>
  orEmptyWhenNotFound(
    async () => (await lambda.send(new GetPolicyCommand({ FunctionName: name }))).Policy ?? "",
    "",
  );

export interface AddPermissionInput {
  functionArn: string;
  statementId: string;
  sourceArn: string;
}

// Cho API Gateway gọi function. Statement trùng ID nghĩa là quyền đã có (gắn lại cùng chỗ)
export async function addPermission(lambda: LambdaClient, input: AddPermissionInput) {
  try {
    await lambda.send(
      new AddPermissionCommand({
        FunctionName: input.functionArn,
        StatementId: input.statementId,
        Action: INVOKE_FUNCTION_ACTION,
        Principal: APIGATEWAY_PRINCIPAL,
        SourceArn: input.sourceArn,
      }),
    );
  } catch (error) {
    if (!(error instanceof Error && error.name === RESOURCE_CONFLICT_ERROR)) throw error;
  }
}
