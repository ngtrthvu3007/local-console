import { FunctionLink } from "../../lambda/components/FunctionLink.tsx";
import { QueueLink } from "../../sqs/components/QueueLink.tsx";
import { TopicLink } from "../../sns/components/TopicLink.tsx";
import { StateMachineLink } from "../../stepfunctions/components/StateMachineLink.tsx";
import { busNameOfArn, qualifierOfArn, resourceNameOfArn, targetKindOfArn } from "../targets.ts";
import { BusLink } from "./BusLink.tsx";

// Có trang trên console thì là link; loại khác hiện ARN dạng text
export function TargetResource({ arn }: { arn: string }) {
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
  if (kind === "sqs") return <QueueLink name={resourceNameOfArn(arn)} />;
  if (kind === "sns") return <TopicLink name={resourceNameOfArn(arn)} />;
  if (kind === "eventbus") return <BusLink name={busNameOfArn(arn)} />;
  if (kind === "stepfunctions") return <StateMachineLink name={resourceNameOfArn(arn)} />;
  return <>{arn}</>;
}
