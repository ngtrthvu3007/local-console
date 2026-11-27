import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ConfigurationChanges,
  CreateFunctionInput,
  DeleteFunctionsInput,
  FunctionToDelete,
  LambdaService,
} from "@localconsole/core/lambda";
import { existsQuery } from "@shared/aws.ts";
import { useCognitoService } from "../../cognito/hooks/useCognitoService.ts";
import { useLambdaService } from "./useLambdaService.ts";

export type { FunctionToDelete };

export const LAMBDA_QUERY_ROOT = "lambda";
const functionsQueryKey = [LAMBDA_QUERY_ROOT, "functions"];

export const functionQueryKey = (name: string, part: string) => [
  LAMBDA_QUERY_ROOT,
  "function",
  name,
  part,
];

const DETAILS = "details";

export function useFunctions() {
  const lambda = useLambdaService();

  return useQuery({ queryKey: functionsQueryKey, queryFn: lambda.listFunctions });
}

export function useFunction(name: string) {
  const lambda = useLambdaService();

  return useQuery({
    queryKey: functionQueryKey(name, DETAILS),
    queryFn: () => lambda.getFunction(name),
    retry: false,
  });
}

// Nơi khác tham chiếu tới function (S3 rule, SNS subscription…) còn trỏ được không.
// Query option dùng chung: trang service khác truyền facade Lambda của nó
export const functionExistsQuery = (lambda: Pick<LambdaService, "getFunction">, name: string) =>
  existsQuery(functionQueryKey(name, "exists"), () => lambda.getFunction(name));

export function useFunctionExists(name: string) {
  const lambda = useLambdaService();
  return useQuery(functionExistsQuery(lambda, name));
}

function useInvalidateFunction() {
  const queryClient = useQueryClient();

  return (name: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: functionQueryKey(name, DETAILS) }),
      queryClient.invalidateQueries({ queryKey: functionsQueryKey }),
    ]);
}

export function useCreateFunction() {
  const lambda = useLambdaService();
  const invalidate = useInvalidateFunction();

  return useMutation({
    mutationFn: (input: CreateFunctionInput) => lambda.createFunction(input),
    onSuccess: (_result, input) => invalidate(input.name),
  });
}

export function useCognitoTriggerUses(functions: readonly { name: string; arn: string }[]) {
  const cognito = useCognitoService();

  return useQuery({
    queryKey: functionQueryKey(functions.map(({ name }) => name).join(), "cognito-triggers"),
    queryFn: () => cognito.listTriggerUses(functions),
  });
}

export function useRotationUses(functions: readonly { name: string; arn: string }[]) {
  const lambda = useLambdaService();

  return useQuery({
    queryKey: functionQueryKey(functions.map(({ name }) => name).join(), "rotations"),
    queryFn: () => lambda.listRotationUses(functions),
  });
}

export function useFunctionsWithTriggers(names: readonly string[]) {
  const lambda = useLambdaService();

  return useQuery({
    queryKey: functionQueryKey(names.join(), "with-triggers"),
    queryFn: () => lambda.listFunctionsWithTriggers(names),
  });
}

export function useDeleteFunctions() {
  const lambda = useLambdaService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DeleteFunctionsInput) => lambda.deleteFunctions(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: functionsQueryKey }),
  });
}

export function useUpdateConfiguration(name: string) {
  const lambda = useLambdaService();
  const invalidate = useInvalidateFunction();

  return useMutation({
    mutationFn: (changes: ConfigurationChanges) => lambda.updateConfiguration(name, changes),
    onSuccess: () => invalidate(name),
  });
}

export function useDeployCode(name: string) {
  const lambda = useLambdaService();
  const invalidate = useInvalidateFunction();

  return useMutation({
    mutationFn: (zipFile: Uint8Array) => lambda.deployCode(name, zipFile),
    onSuccess: () => invalidate(name),
  });
}
