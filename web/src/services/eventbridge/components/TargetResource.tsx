import Box from "@cloudscape-design/components/box";
import { lastArnPart } from "@shared/arn.ts";
import { clusterNameOf } from "../../ecs/arns.ts";
import { ClusterLink } from "../../ecs/components/ClusterLink.tsx";
import { TaskDefinitionLink } from "../../ecs/components/TaskDefinitionLink.tsx";
import { StreamLink } from "../../kinesis/components/StreamLink.tsx";
import { streamNameOfArn } from "../../kinesis/recordData.ts";
import { FunctionLink } from "../../lambda/components/FunctionLink.tsx";
import { QueueLink } from "../../sqs/components/QueueLink.tsx";
import { TopicLink } from "../../sns/components/TopicLink.tsx";
import { StateMachineLink } from "../../stepfunctions/components/StateMachineLink.tsx";
import { busNameOfArn, qualifierOfArn, targetKindOfArn } from "../targets.ts";
import { BusLink } from "./BusLink.tsx";

interface Props {
  arn: string;
  ecsTaskDefinition?: string; // EcsParameters.TaskDefinitionArn của target ECS
}

// Có trang trên console thì là link; loại khác hiện ARN dạng text
export function TargetResource({ arn, ecsTaskDefinition }: Props) {
  const kind = targetKindOfArn(arn);
  if (kind === "lambda") {
    // Trỏ tới version / alias thì hiện kèm sau tên function, để khỏi tưởng trỏ tới bản chính
    const qualifier = qualifierOfArn(arn);
    return (
      <>
        <FunctionLink arn={arn} />
        {qualifier && `:${qualifier}`}
      </>
    );
  }
  if (kind === "sqs") return <QueueLink name={lastArnPart(arn)} />;
  if (kind === "sns") return <TopicLink name={lastArnPart(arn)} />;
  if (kind === "eventbus") return <BusLink name={busNameOfArn(arn)} />;
  if (kind === "stepfunctions") return <StateMachineLink name={lastArnPart(arn)} />;
  if (kind === "ecs") {
    return (
      <>
        <ClusterLink name={clusterNameOf(arn)} />
        {ecsTaskDefinition && (
          <>
            {" › "}
            <TaskDefinitionLink arn={ecsTaskDefinition} />
          </>
        )}
      </>
    );
  }
  if (kind === "kinesis") {
    // Target do CDK / CLI tạo: Floci 2.4.0 nhận nhưng không giao event vào stream, báo để khỏi chờ
    return (
      <>
        <StreamLink name={streamNameOfArn(arn)} />{" "}
        <Box variant='small' display='inline' color='text-status-warning'>
          (Floci doesn&apos;t deliver to Kinesis)
        </Box>
      </>
    );
  }
  return <>{arn}</>;
}
