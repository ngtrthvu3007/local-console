import { ReferenceLink } from "@shared/components/MissingReference.tsx";
import { TableLink } from "../../dynamodb/components/TableLink.tsx";
import { ClusterLink } from "../../ecs/components/ClusterLink.tsx";
import { CLUSTER_TABS } from "../../ecs/routes.ts";
import { useFunctionExists } from "../../lambda/hooks/useFunctions.ts";
import { lambdaRoutes } from "../../lambda/routes.ts";
import { QueueLink } from "../../sqs/components/QueueLink.tsx";
import { TopicLink } from "../../sns/components/TopicLink.tsx";
import type { TaskResource } from "../taskResource.ts";
import { StateMachineLink } from "./StateMachineLink.tsx";

const SERVICE_LABELS = {
  lambda: "Lambda",
  sqs: "SQS",
  dynamodb: "DynamoDB",
  sns: "SNS",
  statemachine: "Step Functions",
  ecscluster: "ECS",
} as const;

// Bước gọi function / bảng đã bị xóa thì báo "(not found)" thay vì link sang trang trống
function LambdaTaskLink({ name }: { name: string }) {
  const missing = useFunctionExists(name).data === false;
  return <ReferenceLink name={name} href={lambdaRoutes.function(name)} missing={missing} />;
}

const linkOf = (resource: Exclude<TaskResource, { kind: "other" }>) => {
  switch (resource.kind) {
    case "sqs":
      return <QueueLink name={resource.name} />;
    case "sns":
      return <TopicLink name={resource.name} />;
    case "statemachine":
      return <StateMachineLink name={resource.name} />;
    case "lambda":
      return <LambdaTaskLink name={resource.name} />;
    case "dynamodb":
      return <TableLink name={resource.name} />;
    case "ecscluster":
      return <ClusterLink name={resource.name} tab={CLUSTER_TABS.tasks} />;
  }
};

// Resource của bước Task: có trang trên console thì là link, còn lại là chữ (spec 3.5)
export function TaskResourceLink({ resource }: { resource: TaskResource }) {
  if (resource.kind === "other") return <>{resource.text}</>;
  return (
    <>
      {SERVICE_LABELS[resource.kind]} › {linkOf(resource)}
    </>
  );
}
