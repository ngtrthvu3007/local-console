import type { CloudFormationClient } from "@aws-sdk/client-cloudformation";
import {
  deleteStack,
  deployStack,
  getStack,
  getStackDescription,
  getTemplate,
  listEvents,
  listResources,
  listStacks,
  listStacksWithResources,
  type StackTemplateInput,
} from "./operations/stacks.ts";

export function createCloudFormationService(cloudformation: CloudFormationClient) {
  return {
    listStacks: () => listStacks(cloudformation),
    getStack: (name: string) => getStack(cloudformation, name),
    getStackDescription: (name: string) => getStackDescription(cloudformation, name),
    getTemplate: (name: string) => getTemplate(cloudformation, name),
    listEvents: (name: string) => listEvents(cloudformation, name),
    listResources: (name: string) => listResources(cloudformation, name),
    listStacksWithResources: () => listStacksWithResources(cloudformation),
    deployStack: (input: StackTemplateInput, editing: boolean) =>
      deployStack(cloudformation, input, editing),
    deleteStack: (name: string) => deleteStack(cloudformation, name),
  };
}

export type CloudFormationService = ReturnType<typeof createCloudFormationService>;
