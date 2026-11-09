import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs, {
  type KeyValuePairsProps,
} from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { isNotFoundError } from "@shared/aws.ts";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import { NotFound } from "@shared/components/NotFound.tsx";
import { ErrorState } from "@shared/components/TableStates.tsx";
import { formatDate } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { CodeTab } from "../components/CodeTab.tsx";
import { ConfigurationTab } from "../components/ConfigurationTab.tsx";
import { DeleteFunctionsModal } from "../components/FunctionModals.tsx";
import { MonitorTab } from "../components/MonitorTab.tsx";
import { TestTab } from "../components/TestTab.tsx";
import { TriggersTab } from "../components/TriggersTab.tsx";
import { logGroupOf } from "../helpers.ts";
import { useFunction } from "../hooks/useFunctions.ts";
import { useLeaveGuard } from "../hooks/useLeaveGuard.ts";
import type { CodeEdits } from "../zipArchive.ts";
import {
  FUNCTION_TABS,
  SEARCH_PARAMS,
  SKIP_LEAVE_GUARD,
  functionCrumbs,
  lambdaRoutes,
  type FunctionTab,
} from "../routes.ts";

const OVERVIEW_COLUMNS = 4;

const isFunctionTab = (value: string | null): value is FunctionTab =>
  Object.values<string | null>(FUNCTION_TABS).includes(value);

export function FunctionDetail() {
  const { name = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get(SEARCH_PARAMS.tab);
  const tab = isFunctionTab(requestedTab) ? requestedTab : FUNCTION_TABS.code;
  const details = useFunction(name);
  const [deleting, setDeleting] = useState(false);
  // Code sửa chưa deploy nằm ở đây để không mất khi đổi tab (Tabs chỉ render tab đang mở)
  const [edits, setEdits] = useState<CodeEdits>({});
  const [openPath, setOpenPath] = useState<string>();
  const hasUndeployedChanges = Object.keys(edits).length > 0;
  const leaveBlocker = useLeaveGuard(hasUndeployedChanges);

  useBreadcrumbs(functionCrumbs(name));

  const selectTab = (nextTab: string) =>
    setSearchParams(nextTab === FUNCTION_TABS.code ? {} : { [SEARCH_PARAMS.tab]: nextTab });

  if (details.isLoading) return <Spinner size='large' />;
  if (details.isError && isNotFoundError(details.error)) {
    return (
      <NotFound
        title={`Function ${name} not found`}
        description='It may have been deleted, or the name is wrong.'
        backHref={lambdaRoutes.functions}
        backText='View functions'
      />
    );
  }
  if (!details.data?.Configuration) {
    return (
      <Container>
        <ErrorState error={details.error} onRetry={() => details.refetch()} />
      </Container>
    );
  }

  const configuration = details.data.Configuration;
  const arn = configuration.FunctionArn ?? "";
  const logGroup = logGroupOf(configuration);

  const overviewItems: KeyValuePairsProps.Item[] = [
    { label: "ARN", value: <CopyButton variant='inline' text={arn} label={arn} /> },
    { label: "Runtime", value: configuration.Runtime },
    { label: "Handler", value: configuration.Handler },
    { label: "Last modified", value: formatDate(configuration.LastModified) },
  ];

  const tabs: TabsProps.Tab[] = [
    {
      id: FUNCTION_TABS.code,
      label: "Code",
      content: (
        <CodeTab
          configuration={configuration}
          codeLocation={details.data.Code?.Location}
          edits={edits}
          onEditsChange={setEdits}
          openPath={openPath}
          onOpenPathChange={setOpenPath}
        />
      ),
    },
    {
      id: FUNCTION_TABS.test,
      label: "Test",
      content: (
        <TestTab
          functionName={name}
          logGroup={logGroup}
          hasUndeployedChanges={hasUndeployedChanges}
          onOpenMonitor={() => selectTab(FUNCTION_TABS.monitor)}
        />
      ),
    },
    {
      id: FUNCTION_TABS.monitor,
      label: "Monitor",
      content: <MonitorTab functionName={name} logGroup={logGroup} />,
    },
    {
      id: FUNCTION_TABS.configuration,
      label: "Configuration",
      content: <ConfigurationTab configuration={configuration} />,
    },
    {
      id: FUNCTION_TABS.triggers,
      label: "Triggers",
      content: <TriggersTab functionName={name} functionArn={arn} />,
    },
  ];

  const headerActions = (
    <SpaceBetween direction='horizontal' size='xs'>
      <CopyButton label='Copy ARN' text={arn} />
      <Button onClick={() => setDeleting(true)}>Delete</Button>
    </SpaceBetween>
  );

  const header = (
    <Header variant='h1' description={configuration.Description} actions={headerActions}>
      {name}
    </Header>
  );

  return (
    <ContentLayout header={header}>
      <SpaceBetween size='l'>
        <Container header={<Header variant='h2'>Function overview</Header>}>
          <KeyValuePairs columns={OVERVIEW_COLUMNS} items={overviewItems} />
        </Container>
        <Tabs
          activeTabId={tab}
          tabs={tabs}
          onChange={({ detail }) => selectTab(detail.activeTabId)}
        />
      </SpaceBetween>

      {deleting && (
        <DeleteFunctionsModal
          functions={[{ name, logGroup }]}
          onDismiss={() => setDeleting(false)}
          onDone={() => navigate(lambdaRoutes.functions, { state: { [SKIP_LEAVE_GUARD]: true } })}
        />
      )}
      <ConfirmModal
        visible={leaveBlocker.state === "blocked"}
        header='Leave this page?'
        actionText='Leave'
        onConfirm={() => leaveBlocker.proceed?.()}
        onDismiss={() => leaveBlocker.reset?.()}
      >
        Your code changes aren't deployed and will be lost.
      </ConfirmModal>
    </ContentLayout>
  );
}
