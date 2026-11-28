import type { LambdaClient } from "@aws-sdk/client-lambda";
import type { LogsService } from "#services/logs/service.ts";
import type { SecretsService } from "#services/secretsmanager/service.ts";
import type { AsyncInvocationInput } from "./asyncInvocation.ts";
import {
  getAsyncInvocation,
  putAsyncInvocation,
  removeAsyncInvocation,
} from "./operations/asyncInvocation.ts";
import {
  type ConfigurationChanges,
  createFunction,
  type CreateFunctionInput,
  deleteFunctions,
  type DeleteFunctionsInput,
  deployCode,
  getCodePackage,
  getFunction,
  getPolicy,
  listFunctions,
  listFunctionsWithTriggers,
  listRotationUses,
  updateConfiguration,
} from "./operations/functions.ts";
import { invoke, type InvokeInput } from "./operations/invoke.ts";
import {
  createQueueTrigger,
  createStreamTrigger,
  deleteMapping,
  editMapping,
  hasMappings,
  listMappings,
  setMappingEnabled,
  type EditMappingInput,
  type QueueTriggerInput,
  type StreamTriggerInput,
} from "./operations/mappings.ts";

export interface LambdaDeps {
  logs: LogsService;
  secrets: SecretsService;
  // Code.Location trỏ host nội bộ của Floci: web đổi sang proxy /aws, server dùng nguyên
  codeUrl: (location: string) => string;
}

// Tab Triggers gom từ S3 / SNS / EventBridge… nằm ở facade riêng (các service đó phụ thuộc Lambda)
export function createLambdaService(lambda: LambdaClient, deps: LambdaDeps) {
  return {
    listFunctions: () => listFunctions(lambda),
    getFunction: (name: string) => getFunction(lambda, name),
    getPolicy: (name: string) => getPolicy(lambda, name),
    createFunction: (input: CreateFunctionInput) => createFunction(lambda, input),
    listFunctionsWithTriggers: (names: readonly string[]) =>
      listFunctionsWithTriggers(lambda, names),
    listRotationUses: (functions: readonly { name: string; arn: string }[]) =>
      listRotationUses(deps.secrets, functions),
    deleteFunctions: (input: DeleteFunctionsInput) => deleteFunctions(lambda, deps.logs, input),
    updateConfiguration: (name: string, changes: ConfigurationChanges) =>
      updateConfiguration(lambda, name, changes),
    deployCode: (name: string, zipFile: Uint8Array) => deployCode(lambda, name, zipFile),
    getCodePackage: (location: string) => getCodePackage(deps.codeUrl(location)),
    invoke: (input: InvokeInput) => invoke(lambda, deps.logs, input),
    getAsyncInvocation: (name: string) => getAsyncInvocation(lambda, name),
    putAsyncInvocation: (name: string, values: AsyncInvocationInput) =>
      putAsyncInvocation(lambda, name, values),
    removeAsyncInvocation: (name: string) => removeAsyncInvocation(lambda, name),
    listMappings: (filter: { functionName?: string; sourceArn?: string }) =>
      listMappings(lambda, filter),
    hasMappings: (sourceArn: string) => hasMappings(lambda, sourceArn),
    createStreamTrigger: (input: StreamTriggerInput) => createStreamTrigger(lambda, input),
    createQueueTrigger: (input: QueueTriggerInput) => createQueueTrigger(lambda, input),
    deleteMapping: (uuid?: string) => deleteMapping(lambda, uuid),
    editMapping: (input: EditMappingInput) => editMapping(lambda, input),
    setMappingEnabled: (input: { uuid: string; enabled: boolean }) =>
      setMappingEnabled(lambda, input),
  };
}

export type LambdaService = ReturnType<typeof createLambdaService>;
