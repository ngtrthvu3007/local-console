import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import type { Stack } from "@aws-sdk/client-cloudformation";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { ActionBar, refreshAction } from "@shared/components/ActionBar.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { DETAIL_SEPARATOR } from "@shared/constants.ts";
import { formatDate, pluralize } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { DeleteStackModal } from "../components/DeleteStackModal.tsx";
import { EventsTab } from "../components/EventsTab.tsx";
import { OutputsTab } from "../components/OutputsTab.tsx";
import { PhysicalIdLink, ResourcesTab } from "../components/ResourcesTab.tsx";
import { StackStatus } from "../components/StackStatus.tsx";
import {
  DELETE_FAILED_HINT,
  DELETE_FAILED_STATUS,
  REVIEW_IN_PROGRESS_STATUS,
} from "../constants.ts";
import {
  useStack,
  useStackDescription,
  useStackEvents,
  useStackResources,
} from "../hooks/useStacks.ts";
import { isStackMissing } from "../stacks.ts";
import {
  SEARCH_PARAMS,
  STACK_TABS,
  cloudformationRoutes,
  stackCrumbs,
  type StackTab,
} from "../routes.ts";
import { editLockReason, isRunning } from "../status.ts";
import { latestReasons, stubbedResources } from "../stub.ts";

const isStackTab = (value: string | null): value is StackTab =>
  Object.values<string | null>(STACK_TABS).includes(value);

function StubAlert({ stack, running }: { stack: string; running: boolean }) {
  const events = useStackEvents(stack, running);
  const resources = useStackResources(stack, running);

  const stubbed = useMemo(
    () => stubbedResources(resources.data ?? [], latestReasons(events.data ?? [])),
    [events.data, resources.data],
  );

  if (!stubbed.length) return null;

  return (
    <Alert type='warning'>
      {pluralize(stubbed.length, "resource")} stubbed by Floci, nothing was created for them:{" "}
      {stubbed.map((r) => `${r.LogicalResourceId} (${r.ResourceType})`).join(", ")}
    </Alert>
  );
}

// Stack kẹt DELETE_FAILED: nêu từng resource lỗi kèm lý do và link để người dùng tự gỡ
function DeleteFailedAlert({ stack }: { stack: string }) {
  const events = useStackEvents(stack, false);
  const resources = useStackResources(stack, false);
  const reasons = useMemo(() => latestReasons(events.data ?? []), [events.data]);
  const failed = (resources.data ?? []).filter((r) => r.ResourceStatus === DELETE_FAILED_STATUS);

  return (
    <Alert type='error'>
      {DELETE_FAILED_HINT}
      {failed.length > 0 && (
        <ul>
          {failed.map(
            ({ LogicalResourceId: logicalId = "", PhysicalResourceId: id = "", ResourceType }) => (
              <li key={logicalId}>
                <PhysicalIdLink type={ResourceType} id={id} /> ({logicalId})
                {reasons.has(logicalId) && `: ${reasons.get(logicalId)}`}
              </li>
            ),
          )}
        </ul>
      )}
    </Alert>
  );
}

function StackView({ stack, query }: { stack: Stack; query: ReturnType<typeof useStack> }) {
  const { ref, compact } = useIsCompact();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get(SEARCH_PARAMS.tab);
  const tab = isStackTab(requestedTab) ? requestedTab : STACK_TABS.events;
  const [deleting, setDeleting] = useState(false);
  const name = stack.StackName ?? "";
  const running = isRunning(stack.StackStatus);
  const description = useStackDescription(name);
  // Dùng chung query với tab Resources nên không gọi thêm API
  const resources = useStackResources(name, running);
  const lockReason = editLockReason(stack, resources.data);

  const tabs: TabsProps.Tab[] = [
    {
      id: STACK_TABS.events,
      label: "Events",
      content: <EventsTab stack={name} running={running} />,
    },
    {
      id: STACK_TABS.resources,
      label: "Resources",
      content: <ResourcesTab stack={name} running={running} />,
    },
    {
      id: STACK_TABS.outputs,
      label: "Outputs",
      content: <OutputsTab outputs={stack.Outputs ?? []} />,
    },
  ];

  const header = (
    <Header
      variant='h1'
      description={
        <>
          <StackStatus status={stack.StackStatus} reason={stack.StackStatusReason} />
          <Box variant='span' display='block' color='text-body-secondary'>
            {[
              `Created ${formatDate(stack.CreationTime)}`,
              stack.LastUpdatedTime && `Updated ${formatDate(stack.LastUpdatedTime)}`,
              description.data,
            ]
              .filter(Boolean)
              .join(DETAIL_SEPARATOR)}
          </Box>
        </>
      }
      actions={
        <ActionBar
          compact={compact}
          actions={[
            refreshAction(query),
            {
              id: "edit",
              text: "Edit template",
              href: cloudformationRoutes.editStack(name),
              disabled: Boolean(lockReason),
              disabledReason: lockReason,
            },
            { id: "delete", text: "Delete", onClick: () => setDeleting(true) },
          ]}
        />
      }
    >
      {name}
    </Header>
  );

  return (
    <div ref={ref}>
      <ContentLayout header={header}>
        <SpaceBetween size='l'>
          {stack.StackStatus === REVIEW_IN_PROGRESS_STATUS && (
            <Alert type='info'>
              This stack has a change set that nobody executed yet, so it has no resources.
            </Alert>
          )}
          {stack.StackStatus === DELETE_FAILED_STATUS && <DeleteFailedAlert stack={name} />}
          <StubAlert stack={name} running={running} />
          <Tabs
            activeTabId={tab}
            tabs={tabs}
            onChange={({ detail }) =>
              setSearchParams(
                detail.activeTabId === STACK_TABS.events
                  ? {}
                  : { [SEARCH_PARAMS.tab]: detail.activeTabId },
              )
            }
          />
        </SpaceBetween>
      </ContentLayout>
      {deleting && (
        <DeleteStackModal
          stack={name}
          onDismiss={() => setDeleting(false)}
          onDone={() => navigate(cloudformationRoutes.stacks)}
        />
      )}
    </div>
  );
}

export function StackDetail() {
  const { stack: name = "" } = useParams();
  const details = useStack(name);

  useBreadcrumbs(stackCrumbs(name));

  const state = pageState(details, {
    ready: Boolean(details.data),
    notFound: details.isError && isStackMissing(details.error),
    title: `Stack ${name} not found`,
    backHref: cloudformationRoutes.stacks,
    backText: "View stacks",
  });

  if (state || !details.data) return state;

  return <StackView stack={details.data} query={details} />;
}
