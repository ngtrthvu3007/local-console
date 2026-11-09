import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DeleteLogGroupCommand } from "@aws-sdk/client-cloudwatch-logs";
import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  paginateListFunctions,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  type FunctionConfiguration,
  type Runtime,
  type UpdateFunctionConfigurationCommandInput,
} from "@aws-sdk/client-lambda";
import { orEmptyWhenNotFound } from "@shared/aws.ts";
import { errorMessage } from "@shared/hooks/useNotify.ts";
import { DEFAULT_ROLE_ARN } from "../constants.ts";
import { useLambda } from "./useLambda.ts";

const functionsQueryKey = ["lambda", "functions"];
// Mọi query về một function (chi tiết, code, log, trigger…) nằm dưới key này
export const functionQueryKey = (name: string, part: string) => ["lambda", "function", name, part];
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
  logGroup: string;
}

export function useDeleteFunctions() {
  const { lambda, logs } = useLambda();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { functions: FunctionToDelete[]; deleteLogGroups: boolean }) => {
      const failures: string[] = [];
      for (const { name, logGroup } of input.functions) {
        try {
          await lambda.send(new DeleteFunctionCommand({ FunctionName: name }));
          // Function chưa chạy lần nào thì chưa có log group
          if (input.deleteLogGroups) {
            await orEmptyWhenNotFound(
              () => logs.send(new DeleteLogGroupCommand({ logGroupName: logGroup })),
              undefined,
            );
          }
        } catch (error) {
          failures.push(`${name}: ${errorMessage(error)}`);
        }
      }
      return { count: input.functions.length - failures.length, failures };
    },
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
