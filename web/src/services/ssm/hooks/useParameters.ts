import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DeleteParametersCommand,
  DescribeParametersCommand,
  GetParameterCommand,
  PutParameterCommand,
  paginateDescribeParameters,
  type ParameterMetadata,
} from "@aws-sdk/client-ssm";
import { DELETE_PARAMETERS_BATCH, SECURE_STRING, type ParameterType } from "../constants.ts";
import { chunks } from "@shared/aws.ts";
import { useSSM } from "./useSSM.ts";

// Mọi query của SSM nằm dưới key gốc này
const SSM_QUERY_ROOT = "ssm";
const parametersQueryKey = [SSM_QUERY_ROOT, "parameters"];
const parameterQueryKey = (name: string) => [SSM_QUERY_ROOT, "parameter", name];
// SSM báo không có bằng 400 kèm tên lỗi này (isNotFoundError không bắt)
const PARAMETER_NOT_FOUND = "ParameterNotFound";

export const isParameterMissing = (error: unknown) =>
  error instanceof Error && error.name === PARAMETER_NOT_FOUND;

export function useParameters() {
  const client = useSSM();

  return useQuery({
    queryKey: parametersQueryKey,
    queryFn: async () => {
      const parameters: ParameterMetadata[] = [];

      for await (const page of paginateDescribeParameters({ client }, {})) {
        parameters.push(...(page.Parameters ?? []));
      }

      return parameters;
    },
  });
}

// Giá trị từ GetParameter, mô tả chỉ có ở DescribeParameters
export function useParameter(name: string) {
  const client = useSSM();

  return useQuery({
    queryKey: parameterQueryKey(name),
    queryFn: async () => {
      const [{ Parameter }, { Parameters }] = await Promise.all([
        client.send(new GetParameterCommand({ Name: name, WithDecryption: true })),
        client.send(
          new DescribeParametersCommand({
            ParameterFilters: [{ Key: "Name", Option: "Equals", Values: [name] }],
          }),
        ),
      ]);

      return {
        parameter: Parameter ?? {},
        description: Parameters?.[0]?.Description ?? "",
        keyId: Parameters?.[0]?.KeyId ?? "",
      };
    },
    retry: false,
  });
}

interface ParameterInput {
  name: string;
  description: string;
  type: ParameterType;
  value: string;
  keyId: string;
}

export function usePutParameter(editing: boolean) {
  const client = useSSM();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, description, type, value, keyId }: ParameterInput) =>
      client.send(
        new PutParameterCommand({
          Name: name,
          Description: description,
          Type: type,
          Value: value,
          // Chỉ SecureString mới có key; trống = key mặc định alias/aws/ssm
          KeyId: type === SECURE_STRING && keyId ? keyId : undefined,
          Overwrite: editing,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [SSM_QUERY_ROOT] }),
  });
}

// DeleteParameters nhận tối đa 10 tên; tên không có trả về trong InvalidParameters
export function useDeleteParameters() {
  const client = useSSM();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (names: readonly string[]) => {
      const failures: string[] = [];

      for (const batch of chunks(names, DELETE_PARAMETERS_BATCH)) {
        const { InvalidParameters = [] } = await client.send(
          new DeleteParametersCommand({ Names: batch }),
        );

        failures.push(...InvalidParameters.map((name) => `${name}: not found`));
      }

      return { count: names.length - failures.length, failures };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [SSM_QUERY_ROOT] }),
  });
}
