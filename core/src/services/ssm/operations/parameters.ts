import {
  DeleteParametersCommand,
  DescribeParametersCommand,
  GetParameterCommand,
  PutParameterCommand,
  paginateDescribeParameters,
  type SSMClient,
} from "@aws-sdk/client-ssm";
import { collectPages } from "#shared/aws/pagination.ts";
import { chunks } from "#shared/aws/pagination.ts";
import {
  DELETE_PARAMETERS_BATCH,
  SECURE_STRING,
  type ParameterType,
} from "#services/ssm/constants.ts";

// SSM báo không có bằng 400 kèm tên lỗi này (isNotFoundError không bắt)
const PARAMETER_NOT_FOUND = "ParameterNotFound";

export const isParameterMissing = (error: unknown) =>
  error instanceof Error && error.name === PARAMETER_NOT_FOUND;

export interface ParameterInput {
  name: string;
  description: string;
  type: ParameterType;
  value: string;
  keyId: string;
}

export const listParameters = (ssm: SSMClient) =>
  collectPages(paginateDescribeParameters({ client: ssm }, {}), (page) => page.Parameters);

// Giá trị từ GetParameter, mô tả chỉ có ở DescribeParameters
export async function getParameter(ssm: SSMClient, name: string) {
  const [{ Parameter }, { Parameters }] = await Promise.all([
    ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true })),
    ssm.send(
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
}

export const putParameter = (
  ssm: SSMClient,
  { name, description, type, value, keyId }: ParameterInput,
  editing: boolean,
) =>
  ssm.send(
    new PutParameterCommand({
      Name: name,
      Description: description,
      Type: type,
      Value: value,
      // Chỉ SecureString mới có key; trống = key mặc định alias/aws/ssm
      KeyId: type === SECURE_STRING && keyId ? keyId : undefined,
      Overwrite: editing,
    }),
  );

// DeleteParameters nhận tối đa 10 tên; tên không có trả về trong InvalidParameters
export async function deleteParameters(ssm: SSMClient, names: readonly string[]) {
  const failures: string[] = [];

  for (const batch of chunks(names, DELETE_PARAMETERS_BATCH)) {
    const { InvalidParameters = [] } = await ssm.send(
      new DeleteParametersCommand({ Names: batch }),
    );

    failures.push(...InvalidParameters.map((name) => `${name}: not found`));
  }

  return { count: names.length - failures.length, failures };
}
