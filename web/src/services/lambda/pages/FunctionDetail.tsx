import { useTabParam } from "@shared/hooks/useTabParam.ts";
import { pageState } from "@shared/components/PageState.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs, {
  type KeyValuePairsProps,
} from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { LeaveModal } from "@shared/components/LeaveModal.tsx";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import { formatDate } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { skipLeaveGuard, useLeaveGuard } from "@shared/hooks/useLeaveGuard.ts";
import { StackLink } from "@shared/StackLink.tsx";
import { CodeTab } from "../components/CodeTab.tsx";
import { ConfigurationTab } from "../components/ConfigurationTab.tsx";
import { DeleteFunctionsModal } from "../components/FunctionModals.tsx";
import { MonitorTab } from "../components/MonitorTab.tsx";
import { TestTab } from "../components/TestTab.tsx";
import { TriggersTab } from "../components/TriggersTab.tsx";
import { logGroupOf } from "../helpers.ts";
import { useFunction } from "../hooks/useFunctions.ts";
import type { CodeEdits } from "../zipArchive.ts";
import { FUNCTION_TABS, functionCrumbs, lambdaRoutes } from "../routes.ts";

const OVERVIEW_COLUMNS = 3;

export function FunctionDetail() {
  const { name = "" } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useTabParam(FUNCTION_TABS, FUNCTION_TABS.code);
  const details = useFunction(name);
  const [deleting, setDeleting] = useState(false);
  // Code sửa chưa deploy nằm ở đây để không mất khi đổi tab (Tabs chỉ render tab đang mở)
  const [edits, setEdits] = useState<CodeEdits>({});
  const [openPath, setOpenPath] = useState<string>();
  const hasUndeployedChanges = Object.keys(edits).length > 0;
  const leaveBlocker = useLeaveGuard(hasUndeployedChanges);

  useBreadcrumbs(functionCrumbs(name));

  const state = pageState(details, {
    ready: Boolean(details.data?.Configuration),
    title: `Function ${name} not found`,
    backHref: lambdaRoutes.functions,
    backText: "View functions",
  });

  if (state || !details.data?.Configuration) return state;

  const configuration = details.data.Configuration;
  const arn = configuration.FunctionArn ?? "";
  const logGroup = logGroupOf(configuration);

  // ARN dài nên nằm một hàng riêng, không bị bẻ thành nhiều dòng trong một cột hẹp
  const arnItem: KeyValuePairsProps.Item = {
    label: "ARN",
    value: <CopyButton variant='inline' text={arn} label={arn} />,
  };

  const overviewItems: KeyValuePairsProps.Item[] = [
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
          onOpenMonitor={() => setTab(FUNCTION_TABS.monitor)}
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
    <ResponsiveActions>
      <Button onClick={() => setDeleting(true)}>Delete</Button>
    </ResponsiveActions>
  );

  const header = (
    <Header
      variant='h1'
      description={
        <>
          {configuration.Description}
          <StackLink
            separated={Boolean(configuration.Description)}
            type='AWS::Lambda::Function'
            physicalId={name}
          />
        </>
      }
      actions={headerActions}
    >
      {name}
    </Header>
  );

  return (
    <ContentLayout header={header}>
      <SpaceBetween size='l'>
        <Container header={<Header variant='h2'>Function overview</Header>}>
          <SpaceBetween size='l'>
            <KeyValuePairs items={[arnItem]} />
            <KeyValuePairs columns={OVERVIEW_COLUMNS} items={overviewItems} />
          </SpaceBetween>
        </Container>
        <Tabs activeTabId={tab} tabs={tabs} onChange={({ detail }) => setTab(detail.activeTabId)} />
      </SpaceBetween>

      {deleting && (
        <DeleteFunctionsModal
          functions={[{ name, arn, logGroup }]}
          onDismiss={() => setDeleting(false)}
          onDone={() => navigate(lambdaRoutes.functions, skipLeaveGuard)}
        />
      )}
      <LeaveModal blocker={leaveBlocker}>
        Your code changes aren't deployed and will be lost.
      </LeaveModal>
    </ContentLayout>
  );
}
