import { z } from "zod";
import { jsonObjectError } from "#shared/utils/json.ts";
import { wholeNumberIn } from "#shared/validation/schemas.ts";
import {
  DESIRED_COUNT,
  RESOURCE_NAME_PATTERN,
  RESOURCE_NAME_RULE,
  TASK_COUNT,
} from "./constants.ts";

const resourceName = z.string().trim().regex(RESOURCE_NAME_PATTERN, RESOURCE_NAME_RULE);
const subnets = z.array(z.string()).min(1, "Choose at least one subnet.");
const family = z.string().min(1, "Choose a task definition.");
const revision = z.string().min(1, "Choose a revision.");

export const createClusterSchema = z.object({ name: resourceName });
export type CreateClusterForm = z.input<typeof createClusterSchema>;

// Chỉ kiểm phần console cần để đăng ký; trường còn lại để Floci báo lỗi
const taskDefinitionShape = z.looseObject({
  family: resourceName,
  containerDefinitions: z.array(z.looseObject({})).min(1, "Add at least one container definition."),
});

export const taskDefinitionJsonSchema = z
  .string()
  .trim()
  .min(1, "Enter the task definition JSON.")
  .superRefine((text, context) => {
    const message = jsonObjectError(text);
    if (message) context.addIssue({ code: "custom", message });
  })
  .transform((text): unknown => JSON.parse(text))
  .pipe(taskDefinitionShape);

export const taskDefinitionFormSchema = z.object({ json: taskDefinitionJsonSchema });

const commandArray = z.array(z.string());

// Command override là mảng JSON (như containerDefinitions.command); trống = giữ command cũ
export function parseCommand(text: string): string[] | undefined {
  if (!text.trim()) return undefined;
  try {
    const parsed = commandArray.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

const COMMAND_EXAMPLE = '["sh","-c","echo hi"]';

const containerOverride = z.object({
  container: z.string(),
  command: z
    .string()
    .refine(
      (text) => !text.trim() || parseCommand(text) !== undefined,
      `Enter a JSON array of strings, for example ${COMMAND_EXAMPLE}.`,
    )
    .transform(parseCommand),
  environment: z.array(
    z.object({ key: z.string().trim().min(1, "Enter a name."), value: z.string() }),
  ),
});

export const runTaskSchema = z.object({
  cluster: z.string().min(1, "Choose a cluster."),
  family,
  revision,
  count: wholeNumberIn(TASK_COUNT),
  subnets,
  securityGroups: z.array(z.string()),
  overrides: z.array(containerOverride),
});
export type RunTaskForm = z.input<typeof runTaskSchema>;
export type RunTaskValues = z.output<typeof runTaskSchema>;

const desiredCount = wholeNumberIn(DESIRED_COUNT, "tasks");

export const serviceSchema = z.object({
  name: resourceName,
  family,
  revision,
  desiredCount,
  subnets,
  securityGroups: z.array(z.string()),
});
export type ServiceValues = z.output<typeof serviceSchema>;

export const updateServiceSchema = z.object({ desiredCount, family, revision });
