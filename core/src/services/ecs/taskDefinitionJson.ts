import type { ContainerDefinition, TaskDefinition } from "@aws-sdk/client-ecs";
import { prettyJson } from "#shared/utils/json.ts";
import { AWSLOGS_DRIVER, AWSLOGS_OPTIONS, LAUNCH_TYPE } from "./constants.ts";

const TEMPLATE_FAMILY = "my-task";
const TEMPLATE_IMAGE = "public.ecr.aws/docker/library/busybox:latest";

// Mẫu chạy được ngay trên Floci: Fargate, ghi log ra CloudWatch Logs
export const newTaskDefinitionText = (region: string) =>
  prettyJson({
    family: TEMPLATE_FAMILY,
    requiresCompatibilities: [LAUNCH_TYPE],
    networkMode: "awsvpc",
    cpu: "256",
    memory: "512",
    containerDefinitions: [
      {
        name: "main",
        image: TEMPLATE_IMAGE,
        essential: true,
        command: ["sh", "-c", "echo Hello from ECS"],
        environment: [],
        logConfiguration: {
          logDriver: AWSLOGS_DRIVER,
          options: {
            [AWSLOGS_OPTIONS.group]: `/ecs/${TEMPLATE_FAMILY}`,
            [AWSLOGS_OPTIONS.region]: region,
            [AWSLOGS_OPTIONS.streamPrefix]: "ecs",
          },
        },
      },
    ],
  });

// Trường DescribeTaskDefinition trả mà RegisterTaskDefinition không nhận
const READ_ONLY_FIELDS = new Set<string>([
  "taskDefinitionArn",
  "revision",
  "status",
  "requiresAttributes",
  "compatibilities",
  "registeredAt",
  "registeredBy",
  "deregisteredAt",
]);

export const revisionText = (definition: TaskDefinition) =>
  prettyJson(
    Object.fromEntries(Object.entries(definition).filter(([key]) => !READ_ONLY_FIELDS.has(key))),
  );

// Stream awslogs của ECS: "<prefix>/<container>/<task ID>"
export function awslogsTarget(container: ContainerDefinition, taskId: string) {
  const { logDriver, options = {} } = container.logConfiguration ?? {};
  const group = options[AWSLOGS_OPTIONS.group];
  const prefix = options[AWSLOGS_OPTIONS.streamPrefix];

  if (logDriver !== AWSLOGS_DRIVER || !group || !prefix) return undefined;
  return { group, stream: `${prefix}/${container.name}/${taskId}` };
}
