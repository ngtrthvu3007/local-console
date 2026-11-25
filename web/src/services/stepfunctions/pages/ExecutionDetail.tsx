import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type { DescribeExecutionCommandOutput } from "@aws-sdk/client-sfn";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { ActionBar, type BarAction } from "@shared/components/ActionBar.tsx";
import jsonHighlight from "@cloudscape-design/code-view/highlight/json";
import { CodeSnippet } from "@shared/components/CodeSnippet.tsx";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { copyToClipboard } from "@shared/clipboard.ts";
import { DETAIL_SEPARATOR, NOT_AVAILABLE } from "@shared/constants.ts";
import { formatDate } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { reformatJson } from "@shared/json.ts";
import { lastArnPart } from "@shared/arn.ts";
import { ExecutionStatus } from "../components/ExecutionStatus.tsx";
import { StateMachineLink } from "../components/StateMachineLink.tsx";
import { StepsTable } from "../components/StepsTable.tsx";
import { RUNNING_STATUS, TRUNCATED_NOTE } from "../constants.ts";
import {
  isExecutionMissing,
  useExecution,
  useExecutionHistory,
  useStopExecution,
} from "../hooks/useExecutions.ts";
import { SEARCH_PARAMS, stateMachineCrumbs, stepfunctionsRoutes } from "../routes.ts";
import { stateMachineOfExecutionArn } from "../stateMachines.ts";
import { buildSteps } from "../steps.ts";

// DescribeExecution báo payload không có trong kết quả (quá lớn) bằng inputDetails.included = false
const payloadNote = (included?: boolean) =>
  included === false ? <Box color='text-body-secondary'>{TRUNCATED_NOTE}</Box> : null;

const jsonOrDash = (text?: string) => (text === undefined ? NOT_AVAILABLE : reformatJson(text));

function ExecutionView({ execution }: { execution: DescribeExecutionCommandOutput }) {
  const arn = execution.executionArn ?? "";
  const { ref, compact } = useIsCompact();
  const running = execution.status === RUNNING_STATUS;
  const history = useExecutionHistory(arn, running);
  const stop = useStopExecution(arn);
  const [stopping, setStopping] = useState(false);
  const machine = lastArnPart(execution.stateMachineArn ?? "");
  const steps = useMemo(
    () => buildSteps(history.data ?? [], execution.status ?? ""),
    [history.data, execution.status],
  );

  const barActions: BarAction[] = running
    ? [{ id: "stop", text: "Stop execution", primary: true, onClick: () => setStopping(true) }]
    : [];

  const header = (
    <Header
      variant='h1'
      // Mô tả của Header là <p>: chỉ chứa phần tử inline
      description={
        <>
          <ExecutionStatus status={execution.status} />
          {DETAIL_SEPARATOR}
          <StateMachineLink name={machine} />
          {DETAIL_SEPARATOR}
          Started {formatDate(execution.startDate)}
        </>
      }
      actions={
        <ActionBar
          compact={compact}
          actions={barActions}
          menuItems={[{ id: "copy", text: "Copy ARN" }]}
          onMenuItemClick={() => copyToClipboard(arn, "ARN")}
        />
      }
    >
      {execution.name}
    </Header>
  );

  return (
    <div ref={ref}>
      <ContentLayout header={header}>
        <SpaceBetween size='l'>
          {execution.error && (
            <Alert type='error' header={execution.error}>
              {execution.cause}
            </Alert>
          )}
          <Container>
            <ColumnLayout columns={2}>
              <SpaceBetween size='s'>
                <Header variant='h3'>Input</Header>
                <CodeSnippet code={jsonOrDash(execution.input)} highlight={jsonHighlight} wrap />
                {payloadNote(execution.inputDetails?.included)}
              </SpaceBetween>
              <SpaceBetween size='s'>
                <Header variant='h3'>Output</Header>
                <CodeSnippet code={jsonOrDash(execution.output)} highlight={jsonHighlight} wrap />
                {payloadNote(execution.outputDetails?.included)}
              </SpaceBetween>
            </ColumnLayout>
          </Container>
          <StepsTable steps={steps} query={history} />
        </SpaceBetween>
      </ContentLayout>
      <ConfirmModal
        visible={stopping}
        header='Stop execution'
        actionText='Stop execution'
        loading={stop.isPending}
        onDismiss={() => setStopping(false)}
        onConfirm={() =>
          stop.mutate(
            undefined,
            notifyOutcome({
              success: "Stopped execution",
              errorHeader: "Couldn't stop the execution",
              then: () => setStopping(false),
            }),
          )
        }
      >
        {`Execution ${execution.name} will be aborted and stops at its current step.`}
      </ConfirmModal>
    </div>
  );
}

export function ExecutionDetail() {
  const [searchParams] = useSearchParams();
  const arn = searchParams.get(SEARCH_PARAMS.arn) ?? "";
  const details = useExecution(arn);
  const machine = stateMachineOfExecutionArn(arn);

  useBreadcrumbs([
    ...stateMachineCrumbs(machine),
    {
      text: details.data?.name ?? "",
      href: stepfunctionsRoutes.execution(arn),
    },
  ]);

  const state = pageState(details, {
    ready: Boolean(details.data),
    notFound: details.isError && isExecutionMissing(details.error),
    title: "Execution not found",
    backHref: machine
      ? stepfunctionsRoutes.stateMachine(machine)
      : stepfunctionsRoutes.stateMachines,
    backText: machine ? "View state machine" : "View state machines",
  });
  if (state || !details.data) return state;

  return <ExecutionView execution={details.data} />;
}
