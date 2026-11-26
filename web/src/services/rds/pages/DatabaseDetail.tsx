import { useNavigate, useParams } from "react-router";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { useTabParam } from "@shared/hooks/useTabParam.ts";
import { ActionBar, refreshAction } from "@shared/components/ActionBar.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { DETAIL_SEPARATOR } from "@shared/constants.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { StackLink } from "@shared/StackLink.tsx";
import { useDatabaseActions } from "../components/DatabaseActions.tsx";
import { DatabaseStatus } from "../components/DatabaseStatus.tsx";
import { ConfigurationTab, ConnectivityTab, LogsTab } from "../components/DatabaseTabs.tsx";
import { engineText } from "../databases.ts";
import { useDatabase } from "../hooks/useDatabases.ts";
import { DATABASE_TABS, databaseCrumbs, rdsRoutes } from "../routes.ts";

export function DatabaseDetail() {
  const { database: id = "" } = useParams();
  const navigate = useNavigate();
  const { ref, compact } = useIsCompact();
  const [tab, setTab] = useTabParam(DATABASE_TABS, DATABASE_TABS.connectivity);
  const details = useDatabase(id);
  const database = details.data ?? undefined;
  const databaseActions = useDatabaseActions(database, () => navigate(rdsRoutes.databases));

  useBreadcrumbs(databaseCrumbs(id));

  const state = pageState(details, {
    ready: Boolean(database),
    title: `Database ${id} not found`,
    backHref: rdsRoutes.databases,
    backText: "View databases",
  });
  if (state || !database) return state;

  const tabs: TabsProps.Tab[] = [
    {
      id: DATABASE_TABS.connectivity,
      label: "Connectivity & security",
      content: <ConnectivityTab database={database} />,
    },
    {
      id: DATABASE_TABS.configuration,
      label: "Configuration",
      content: <ConfigurationTab database={database} />,
    },
    { id: DATABASE_TABS.logs, label: "Logs & events", content: <LogsTab id={id} /> },
  ];

  const header = (
    <Header
      variant='h1'
      description={
        <>
          {engineText(database)}
          {DETAIL_SEPARATOR}
          <DatabaseStatus database={database} />
          <StackLink separated type='AWS::RDS::DBInstance' physicalId={id} />
        </>
      }
      actions={
        <ActionBar
          compact={compact}
          actions={[refreshAction(details)]}
          menuItems={databaseActions.menuItems}
          onMenuItemClick={databaseActions.onMenuItemClick}
        />
      }
    >
      {id}
    </Header>
  );

  return (
    <div ref={ref}>
      <ContentLayout header={header}>
        <Tabs activeTabId={tab} tabs={tabs} onChange={({ detail }) => setTab(detail.activeTabId)} />
        {databaseActions.modal}
      </ContentLayout>
    </div>
  );
}
