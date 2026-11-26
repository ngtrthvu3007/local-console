import { useState } from "react";
import { useParams } from "react-router";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { useTabParam } from "@shared/hooks/useTabParam.ts";
import { ActionBar, type BarAction } from "@shared/components/ActionBar.tsx";
import { ConnectCard } from "@shared/components/CodeSamples.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { copyToClipboard } from "@shared/clipboard.ts";
import { DETAIL_SEPARATOR } from "@shared/constants.ts";
import { formatDate } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { StackLink } from "@shared/StackLink.tsx";
import { stateMachineSample } from "../codeSamples.ts";
import { DefinitionTab } from "../components/DefinitionTab.tsx";
import { ExecutionsTab } from "../components/ExecutionsTab.tsx";
import { StartExecutionModal } from "../components/StartExecutionModal.tsx";
import { STATE_MACHINE_TYPE_LABELS } from "../constants.ts";
import {
  isStateMachineMissing,
  useStateMachine,
  type StateMachineDetails,
} from "../hooks/useStateMachines.ts";
import { STATE_MACHINE_TABS, stateMachineCrumbs, stepfunctionsRoutes } from "../routes.ts";

function StateMachineView({ machine }: { machine: StateMachineDetails }) {
  const { ref, compact } = useIsCompact();
  const [tab, setTab] = useTabParam(STATE_MACHINE_TABS, STATE_MACHINE_TABS.executions);
  const [starting, setStarting] = useState(false);

  const tabs: TabsProps.Tab[] = [
    {
      id: STATE_MACHINE_TABS.executions,
      label: "Executions",
      content: <ExecutionsTab machineArn={machine.arn} />,
    },
    {
      id: STATE_MACHINE_TABS.definition,
      label: "Definition",
      content: (
        <SpaceBetween size='l'>
          <DefinitionTab definition={machine.definition} />
          <ConnectCard sample={stateMachineSample(machine)} />
        </SpaceBetween>
      ),
    },
  ];

  const barActions: BarAction[] = [
    {
      id: "start",
      text: "Start execution",
      primary: true,
      onClick: () => setStarting(true),
    },
  ];

  const header = (
    <Header
      variant='h1'
      description={
        <>
          {[
            STATE_MACHINE_TYPE_LABELS[machine.type],
            `Created ${formatDate(machine.createdAt)}`,
          ].join(DETAIL_SEPARATOR)}
          <StackLink separated type='AWS::StepFunctions::StateMachine' physicalId={machine.arn} />
        </>
      }
      actions={
        <ActionBar
          compact={compact}
          actions={barActions}
          menuItems={[{ id: "copy", text: "Copy ARN" }]}
          onMenuItemClick={() => copyToClipboard(machine.arn, "ARN")}
        />
      }
    >
      {machine.name}
    </Header>
  );

  return (
    <div ref={ref}>
      <ContentLayout header={header}>
        <Tabs activeTabId={tab} tabs={tabs} onChange={({ detail }) => setTab(detail.activeTabId)} />
      </ContentLayout>
      {starting && (
        <StartExecutionModal machineArn={machine.arn} onDismiss={() => setStarting(false)} />
      )}
    </div>
  );
}

export function StateMachineDetail() {
  const { name = "" } = useParams();
  const details = useStateMachine(name);

  useBreadcrumbs(stateMachineCrumbs(name));

  const state = pageState(details, {
    ready: Boolean(details.data),
    notFound: details.isError && isStateMachineMissing(details.error),
    title: `State machine ${name} not found`,
    backHref: stepfunctionsRoutes.stateMachines,
    backText: "View state machines",
  });
  if (state || !details.data) return state;

  return <StateMachineView machine={details.data} />;
}
