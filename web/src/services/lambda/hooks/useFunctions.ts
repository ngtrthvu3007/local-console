import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DeleteLogGroupCommand } from "@aws-sdk/client-cloudwatch-logs";
import {
  CreateFunctionCommand,
  DeleteEventSourceMappingCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  GetFunctionConfigurationCommand,
  ListEventSourceMappingsCommand,
  paginateListFunctions,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  type FunctionConfiguration,
  type LambdaClient,
  type Runtime,
  type UpdateFunctionConfigurationCommandInput,
} from "@aws-sdk/client-lambda";
import { existsUnlessMissing } from "@shared/aws.ts";
import { runEach } from "@shared/hooks/useNotify.ts";
import { logGroupExists } from "@shared/logs/useLogEvents.ts";
import { useCognito } from "../../cognito/hooks/useCognito.ts";
import { listPoolTriggers } from "../../cognito/hooks/usePools.ts";
import { listRotatedSecrets } from "../../secretsmanager/hooks/useSecrets.ts";
import { useSecretsManager } from "../../secretsmanager/hooks/useSecretsManager.ts";
import { DEFAULT_ROLE_ARN } from "../constants.ts";
import { useLambda } from "./useLambda.ts";

// Mọi query của Lambda nằm dưới key gốc này (service khác đổi trigger thì invalidate cả gốc)
export const LAMBDA_QUERY_ROOT = "lambda";
const functionsQueryKey = [LAMBDA_QUERY_ROOT, "functions"];

// Mọi query về một function (chi tiết, code, log, trigger…) nằm dưới key này
export const functionQueryKey = (name: string, part: string) => [
  LAMBDA_QUERY_ROOT,
  "function",
  name,
  part,
];

const DETAILS = "details";

export function useFunctions() {
  const { lambda } = useLambda();

  return useQuery({
    queryKey: functionsQueryKey,
    queryFn: async () => {
      const functions: FunctionConfiguration[] = [];

      for await (const page of paginateListFunctions({ client: lambda }, {})) {
        functions.push(...(page.Functions ?? []));
      }

      return functions;
    },
  });
}

export function useFunction(name: string) {
  const { lambda } = useLambda();

  return useQuery({
    queryKey: functionQueryKey(name, DETAILS),
    queryFn: () => lambda.send(new GetFunctionCommand({ FunctionName: name })),
    retry: false,
  });
}

// Nơi khác tham chiếu tới function (S3 rule, SNS subscription…) còn trỏ được không
export const functionExistsQuery = (lambda: LambdaClient, name: string) => ({
  queryKey: functionQueryKey(name, "exists"),
  queryFn: () =>
    existsUnlessMissing(() =>
      lambda.send(new GetFunctionConfigurationCommand({ FunctionName: name })),
    ),
  retry: false,
});

export function useFunctionExists(name: string) {
  const { lambda } = useLambda();
  return useQuery(functionExistsQuery(lambda, name));
}

// Làm mới chi tiết và danh sách; trả promise để nút giữ loading tới khi dữ liệu mới về
function useInvalidateFunction() {
  const queryClient = useQueryClient();

  return (name: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: functionQueryKey(name, DETAILS) }),
      queryClient.invalidateQueries({ queryKey: functionsQueryKey }),
    ]);
}

interface CreateFunctionInput {
  name: string;
  runtime: Runtime;
  handler: string;
  memory: number;
  timeout: number;
  zipFile: Uint8Array;
}

export function useCreateFunction() {
  const { lambda } = useLambda();
  const invalidate = useInvalidateFunction();

  return useMutation({
    mutationFn: (input: CreateFunctionInput) =>
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
      ),
    onSuccess: (_result, input) => invalidate(input.name),
  });
}

export interface FunctionToDelete {
  name: string;
  arn: string;
  logGroup: string;
}

// Floci không xóa trigger khi xóa function nên cảnh báo trước; chỉ cần biết có hay không nên đọc trang đầu
// Floci không dọn trigger của pool khi xóa function: đăng ký / đăng nhập ở pool đó sẽ lỗi
// (UnexpectedLambdaException), nên cảnh báo trước khi xóa
export function useCognitoTriggerUses(functions: readonly { name: string; arn: string }[]) {
  const cognito = useCognito();

  return useQuery({
    queryKey: functionQueryKey(functions.map(({ name }) => name).join(), "cognito-triggers"),
    queryFn: async () => {
      const uses = await Promise.all(
        functions.map(async ({ name, arn }) =>
          (await listPoolTriggers(cognito, arn)).map((trigger) => ({ ...trigger, fn: name })),
        ),
      );

      return uses.flat();
    },
  });
}

// Floci giữ rotation trỏ tới function đã xóa: lần xoay vòng sau của secret sẽ lỗi, nên cảnh báo trước
export function useRotationUses(functions: readonly { name: string; arn: string }[]) {
  const secrets = useSecretsManager();

  return useQuery({
    queryKey: functionQueryKey(functions.map(({ name }) => name).join(), "rotations"),
    queryFn: async () => {
      const uses = await Promise.all(
        functions.map(async ({ name, arn }) =>
          (await listRotatedSecrets(secrets, arn)).map((secret) => ({ secret, fn: name })),
        ),
      );

      return uses.flat();
    },
  });
}

export function useFunctionsWithTriggers(names: readonly string[]) {
  const { lambda } = useLambda();

  return useQuery({
    queryKey: functionQueryKey(names.join(), "with-triggers"),
    queryFn: async () => {
      const checks = await Promise.all(
        names.map(async (name) => {
          const { EventSourceMappings } = await lambda.send(
            new ListEventSourceMappingsCommand({ FunctionName: name }),
          );

          return { name, triggered: Boolean(EventSourceMappings?.length) };
        }),
      );

      return checks.filter((check) => check.triggered).map((check) => check.name);
    },
  });
}

export function useDeleteFunctions() {
  const { lambda, logs } = useLambda();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      functions: FunctionToDelete[];
      deleteLogGroups: boolean;
      deleteTriggers: boolean;
    }) =>
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
          if (input.deleteLogGroups && (await logGroupExists(logs, logGroup))) {
            await logs.send(new DeleteLogGroupCommand({ logGroupName: logGroup }));
          }
        },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: functionsQueryKey }),
  });
}

type ConfigurationChanges = Omit<UpdateFunctionConfigurationCommandInput, "FunctionName">;

// Dùng cho cấu hình chung và biến môi trường (Environment luôn phải gửi đủ cả danh sách)
export function useUpdateConfiguration(name: string) {
  const { lambda } = useLambda();
  const invalidate = useInvalidateFunction();

  return useMutation({
    mutationFn: (changes: ConfigurationChanges) =>
      lambda.send(new UpdateFunctionConfigurationCommand({ FunctionName: name, ...changes })),
    onSuccess: () => invalidate(name),
  });
}

// Deploy code sửa inline: gửi cả gói đã nén lại
export function useDeployCode(name: string) {
  const { lambda } = useLambda();
  const invalidate = useInvalidateFunction();

  return useMutation({
    mutationFn: (zipFile: Uint8Array) =>
      lambda.send(new UpdateFunctionCodeCommand({ FunctionName: name, ZipFile: zipFile })),
    onSuccess: () => invalidate(name),
  });
}
