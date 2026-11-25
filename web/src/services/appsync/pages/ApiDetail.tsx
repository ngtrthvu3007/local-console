import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { ActionBar, refreshAction } from "@shared/components/ActionBar.tsx";
import { LeaveModal } from "@shared/components/LeaveModal.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { skipLeaveGuard, useLeaveGuard } from "@shared/hooks/useLeaveGuard.ts";
import { StackLink } from "@shared/StackLink.tsx";
import { useApiActions } from "../components/ApiActions.tsx";
import { DataSourcesTab } from "../components/DataSourcesTab.tsx";
import { FunctionsTab } from "../components/FunctionsTab.tsx";
import { QueriesTab } from "../components/QueriesTab.tsx";
import { SchemaTab } from "../components/SchemaTab.tsx";
import { SettingsTab } from "../components/SettingsTab.tsx";
import { authLabel } from "../apis.ts";
import { useApi } from "../hooks/useApis.ts";
import { useQueryDraft } from "../hooks/useQueryDraft.ts";
import { API_TABS, SEARCH_PARAMS, apiCrumbs, appsyncRoutes, type ApiTab } from "../routes.ts";

const isApiTab = (value: string | null): value is ApiTab =>
  Object.values<string | null>(API_TABS).includes(value);

export function ApiDetail() {
  const { apiId = "" } = useParams();
  const navigate = useNavigate();
  const { ref, compact } = useIsCompact();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get(SEARCH_PARAMS.tab);
  const tab = isApiTab(requestedTab) ? requestedTab : API_TABS.schema;
  const details = useApi(apiId);
  const api = details.data ?? undefined;
  const actions = useApiActions(api, () => navigate(appsyncRoutes.apis, skipLeaveGuard));
  const [schemaDraft, setSchemaDraft] = useState<string>();
  const [queryDraft, setQueryDraft] = useQueryDraft(apiId);
  const leaveBlocker = useLeaveGuard(schemaDraft !== undefined);

  useBreadcrumbs(apiCrumbs(apiId, api?.name));

  const state = pageState(details, {
    ready: Boolean(api),
    notFound: details.data === null,
    title: `API ${apiId} not found`,
    backHref: appsyncRoutes.apis,
    backText: "View APIs",
  });
  if (state || !api) return state;

  const tabs: TabsProps.Tab[] = [
    {
      id: API_TABS.schema,
      label: "Schema",
      content: (
        <SchemaTab
          apiId={apiId}
          compact={compact}
          draft={schemaDraft}
          onDraftChange={setSchemaDraft}
        />
      ),
    },
    {
      id: API_TABS.dataSources,
      label: "Data sources",
      content: <DataSourcesTab apiId={apiId} compact={compact} />,
    },
    {
      id: API_TABS.functions,
      label: "Functions",
      content: <FunctionsTab apiId={apiId} compact={compact} />,
    },
    {
      id: API_TABS.queries,
      label: "Queries",
      content: <QueriesTab api={api} draft={queryDraft} onDraftChange={setQueryDraft} />,
    },
    {
      id: API_TABS.settings,
      label: "Settings",
      content: <SettingsTab api={api} compact={compact} />,
    },
  ];

  const header = (
    <Header
      variant='h1'
      description={
        <>
          {authLabel(api.authenticationType)}
          <StackLink separated type='AWS::AppSync::GraphQLApi' physicalId={apiId} />
        </>
      }
      actions={
        <ActionBar
          compact={compact}
          actions={[refreshAction(details)]}
          menuItems={actions.menuItems}
          onMenuItemClick={actions.onMenuItemClick}
        />
      }
    >
      {`${api.name} (${apiId})`}
    </Header>
  );

  return (
    <div ref={ref}>
      <ContentLayout header={header}>
        <Tabs
          activeTabId={tab}
          tabs={tabs}
          onChange={({ detail }) =>
            setSearchParams(
              detail.activeTabId === API_TABS.schema
                ? {}
                : { [SEARCH_PARAMS.tab]: detail.activeTabId },
            )
          }
        />
        {actions.modal}
        <LeaveModal blocker={leaveBlocker}>
          Your schema changes aren&apos;t saved and will be lost.
        </LeaveModal>
      </ContentLayout>
    </div>
  );
}
