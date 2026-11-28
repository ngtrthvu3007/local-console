import type { SSMClient } from "@aws-sdk/client-ssm";
import {
  deleteParameters,
  getParameter,
  listParameters,
  putParameter,
  type ParameterInput,
} from "./operations/parameters.ts";

export function createSsmService(ssm: SSMClient) {
  return {
    listParameters: () => listParameters(ssm),
    getParameter: (name: string) => getParameter(ssm, name),
    putParameter: (input: ParameterInput, editing: boolean) => putParameter(ssm, input, editing),
    deleteParameters: (names: readonly string[]) => deleteParameters(ssm, names),
  };
}
