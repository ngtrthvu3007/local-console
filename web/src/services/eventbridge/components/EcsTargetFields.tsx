import type { Control, FieldValues, Path } from "react-hook-form";
import { taskDefinitionArn } from "../../ecs/arns.ts";
import { NetworkFields } from "../../ecs/components/NetworkFields.tsx";
import { TaskDefinitionFields } from "../../ecs/components/TaskDefinitionFields.tsx";
import type { EcsTarget } from "../targets.ts";

interface EcsFormValues {
  taskFamily: string;
  taskRevision: string;
  subnets: string[];
  securityGroups: string[];
}

interface Props<TValues extends FieldValues> {
  control: Control<TValues, unknown, FieldValues>;
  names: {
    family: Path<TValues>;
    revision: Path<TValues>;
    subnets: Path<TValues>;
    securityGroups: Path<TValues>;
  };
}

// Tên trường giống nhau ở schema rule và schedule
export const ECS_TARGET_NAMES = {
  family: "taskFamily",
  revision: "taskRevision",
  subnets: "subnets",
  securityGroups: "securityGroups",
} as const;

// Trường của target ECS task trong form rule và schedule
export function EcsTargetFields<TValues extends FieldValues>({ control, names }: Props<TValues>) {
  return (
    <>
      <TaskDefinitionFields control={control} names={names} />
      <NetworkFields control={control} names={names} />
    </>
  );
}

export const ecsTargetOf = (values: EcsFormValues, region: string): EcsTarget => ({
  taskDefinitionArn: taskDefinitionArn(region, values.taskFamily, values.taskRevision),
  subnets: values.subnets,
  securityGroups: values.securityGroups,
});
