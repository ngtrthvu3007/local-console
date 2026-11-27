import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { ActionBar } from "@shared/components/ActionBar.tsx";
import { NotFound } from "@shared/components/NotFound.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { DETAIL_SEPARATOR, formatDate } from "@localconsole/core/shared";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { StackLink } from "@shared/StackLink.tsx";
import { DeleteApiModal } from "../components/DeleteApiModal.tsx";
import { EditApiModal } from "../components/EditApiModal.tsx";
import { AuthorizersTab } from "../components/AuthorizersTab.tsx";
import { StagesTab } from "../components/StagesTab.tsx";
import { RoutesTab } from "../components/RoutesTab.tsx";
import { ResourcesTab } from "../components/ResourcesTab.tsx";
import {
  type ApiDetail,
  API_TYPES,
  CFN_API_TYPES,
  NOT_FOUND_DESCRIPTION,
  NOT_FOUND_LINK,
  API_TABS,
  API_VERSIONS,
  SEARCH_PARAMS,
  apigatewayRoutes,
  isApiVersion,
  type ApiTab,
  type ApiVersion,
} from "@localconsole/core/apigateway";
import { useApi } from "../hooks/useApiDetail.ts";
import { apiCrumbs } from "../routes.ts";

const tabsOf = (version: ApiVersion): ApiTab[] => [
  version === API_VERSIONS.rest ? API_TABS.resources : API_TABS.routes,
  API_TABS.authorizers,
  API_TABS.stages,
];

const TAB_LABELS: Record<ApiTab, string> = {
  resources: "Resources",
  routes: "Routes",
  authorizers: "Authorizers",
  stages: "Stages",
};

function tabContent(tab: ApiTab, version: ApiVersion, api: ApiDetail, apiId: string) {
  if (tab === API_TABS.resources) return <ResourcesTab apiId={apiId} />;
  if (tab === API_TABS.routes)
    return (
      <RoutesTab
        apiId={apiId}
        apiType={api.type}
        routeSelection={api.type === API_TYPES.websocket ? api.routeSelection : undefined}
      />
    );
  if (tab === API_TABS.authorizers)
    return <AuthorizersTab version={version} apiId={apiId} apiType={api.type} />;
  return <StagesTab version={version} apiId={apiId} apiType={api.type} />;
}

function ApiView({ version, apiId }: { version: ApiVersion; apiId: string }) {
  const api = useApi(version, apiId);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const { ref, compact } = useIsCompact();
  useBreadcrumbs(apiCrumbs(version, apiId, api.data?.name ?? apiId));

  const state = pageState(api, {
    ready: Boolean(api.data),
    title: `API ${apiId} not found`,
    backHref: apigatewayRoutes.apis,
    backText: NOT_FOUND_LINK,
    description: NOT_FOUND_DESCRIPTION,
  });
  if (state || !api.data) return state;

  const available = tabsOf(version);
  const requested = searchParams.get(SEARCH_PARAMS.tab);
  const tab = available.find((t) => t === requested) ?? available[0];
  const tabs: TabsProps.Tab[] = available.map((id) => ({
    id,
    label: TAB_LABELS[id],
    content: tabContent(id, version, api.data, apiId),
  }));

  return (
    <div ref={ref}>
      <ContentLayout
        header={
          <Header
            variant='h1'
            actions={
              <ActionBar
                compact={compact}
                actions={[
                  { id: "edit", text: "Edit", onClick: () => setEditing(true) },
                  { id: "delete", text: "Delete", onClick: () => setDeleting(true) },
                ]}
              />
            }
            description={
              <>
                {[
                  api.data.type,
                  apiId,
                  api.data.created ? `Created ${formatDate(api.data.created)}` : "",
                ]
                  .filter(Boolean)
                  .join(DETAIL_SEPARATOR)}
                <StackLink separated type={CFN_API_TYPES[version]} physicalId={apiId} />
              </>
            }
          >
            {api.data.name}
          </Header>
        }
      >
        <Tabs
          activeTabId={tab}
          tabs={tabs}
          onChange={({ detail }) =>
            setSearchParams(
              detail.activeTabId === available[0]
                ? {}
                : { [SEARCH_PARAMS.tab]: detail.activeTabId },
            )
          }
        />
        {deleting && (
          <DeleteApiModal
            api={{ id: apiId, version, ...api.data }}
            onDismiss={() => setDeleting(false)}
            onDone={() => navigate(apigatewayRoutes.apis)}
          />
        )}
        {editing && (
          <EditApiModal
            version={version}
            apiId={apiId}
            api={api.data}
            onDismiss={() => setEditing(false)}
          />
        )}
      </ContentLayout>
    </div>
  );
}

export function ApiDetail() {
  const { version, apiId = "" } = useParams();
  if (!isApiVersion(version)) {
    return (
      <NotFound
        title={`API ${apiId} not found`}
        description={NOT_FOUND_DESCRIPTION}
        backHref={apigatewayRoutes.apis}
        backText={NOT_FOUND_LINK}
      />
    );
  }
  return <ApiView version={version} apiId={apiId} />;
}
