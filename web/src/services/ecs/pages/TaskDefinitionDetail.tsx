import { useState } from "react";
import { useParams } from "react-router";
import jsonHighlight from "@cloudscape-design/code-view/highlight/json";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Tabs from "@cloudscape-design/components/tabs";
import { useTabParam } from "@shared/hooks/useTabParam.ts";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { CodeSnippet } from "@shared/components/CodeSnippet.tsx";
import { copyable } from "@shared/components/CopyButton.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { DETAIL_SEPARATOR, LIST_SEPARATOR, NOT_AVAILABLE } from "@shared/constants.ts";
import { prettyJson } from "@shared/json.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { StackLink } from "@shared/StackLink.tsx";
import { taskDefinitionLabel } from "../arns.ts";
import { ContainersTab } from "../components/ContainersTab.tsx";
import { RevisionActionModal } from "../components/RevisionActionModal.tsx";
import { StatusBadge } from "@shared/components/StatusBadge.tsx";
import { REVISION_STATUS_STYLES, STATUS } from "../constants.ts";
import { useTaskDefinition } from "../hooks/useTaskDefinitions.ts";
import { REVISION_TABS, ecsRoutes, revisionCrumbs } from "../routes.ts";

const DETAILS_COLUMNS = 3;

export function TaskDefinitionDetail() {
  const params = useParams();
  const family = params.family ?? "";
  const revision = Number(params.revision);
  const { ref, compact } = useIsCompact();
  const [tab, setTab] = useTabParam(REVISION_TABS, REVISION_TABS.containers);
  const details = useTaskDefinition(family, revision);
  const definition = details.data ?? undefined;
  const [deregistering, setDeregistering] = useState(false);

  useBreadcrumbs(revisionCrumbs(family, revision));

  const state = pageState(details, {
    ready: Boolean(definition),
    notFound: details.data === null,
    title: `Task definition ${family}:${params.revision} not found`,
    backHref: ecsRoutes.family(family),
    backText: `View revisions of ${family}`,
  });
  if (state || !definition) return state;

  const arn = definition.taskDefinitionArn ?? "";
  const label = taskDefinitionLabel(arn);

  const barActions: BarAction[] = [
    refreshAction(details),
    {
      id: "deregister",
      text: "Deregister",
      disabled: definition.status !== STATUS.active,
      onClick: () => setDeregistering(true),
    },
    { id: "revise", text: "Create new revision", href: ecsRoutes.createTaskDefinition(label) },
    {
      id: "run",
      text: "Run task",
      primary: true,
      disabled: definition.status !== STATUS.active,
      href: ecsRoutes.runTask({ taskDefinition: label }),
    },
  ];

  const header = (
    <Header
      variant='h1'
      description={
        <>
          <StatusBadge status={definition.status} styles={REVISION_STATUS_STYLES} />
          {DETAIL_SEPARATOR}
          {definition.requiresCompatibilities?.join(LIST_SEPARATOR) ?? NOT_AVAILABLE}
          <StackLink separated type='AWS::ECS::TaskDefinition' physicalId={arn} />
        </>
      }
      actions={<ActionBar compact={compact} actions={barActions} />}
    >
      {label}
    </Header>
  );

  return (
    <div ref={ref}>
      <ContentLayout header={header}>
        <SpaceBetween size='l'>
          <Container header={<Header variant='h2'>Overview</Header>}>
            <KeyValuePairs
              columns={DETAILS_COLUMNS}
              items={[
                { label: "ARN", value: copyable(arn) },
                { label: "Task role", value: definition.taskRoleArn ?? NOT_AVAILABLE },
                { label: "Execution role", value: definition.executionRoleArn ?? NOT_AVAILABLE },
                { label: "Network mode", value: definition.networkMode ?? NOT_AVAILABLE },
                { label: "CPU", value: definition.cpu ?? NOT_AVAILABLE },
                { label: "Memory (MiB)", value: definition.memory ?? NOT_AVAILABLE },
              ]}
            />
          </Container>
          <Tabs
            activeTabId={tab}
            onChange={({ detail }) => setTab(detail.activeTabId)}
            tabs={[
              {
                id: REVISION_TABS.containers,
                label: "Containers",
                content: <ContainersTab containers={definition.containerDefinitions ?? []} />,
              },
              {
                id: REVISION_TABS.json,
                label: "JSON",
                content: (
                  <CodeSnippet
                    code={prettyJson(definition)}
                    highlight={jsonHighlight}
                    ariaLabel='Task definition JSON'
                  />
                ),
              },
            ]}
          />
        </SpaceBetween>
      </ContentLayout>
      {deregistering && (
        <RevisionActionModal
          action='deregister'
          arns={[arn]}
          onDismiss={() => setDeregistering(false)}
          onDone={() => setDeregistering(false)}
        />
      )}
    </div>
  );
}
