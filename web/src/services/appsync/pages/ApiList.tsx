import { useCollection } from "@cloudscape-design/collection-hooks";
import type { GraphqlApi } from "@aws-sdk/client-appsync";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import TextFilter from "@cloudscape-design/components/text-filter";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { copyable } from "@shared/components/CopyButton.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR, NOT_AVAILABLE } from "@localconsole/core/shared";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { authLabel, localEndpoint, appsyncRoutes } from "@localconsole/core/appsync";
import { useApiActions } from "../components/ApiActions.tsx";
import { useApis } from "../hooks/useApis.ts";
import { appsyncBaseCrumbs } from "../routes.ts";

const ID_FIELD = "apiId";
const NAME_FIELD = "name";
const PAGE_SIZE = 50;

const matchesText = (api: GraphqlApi, text: string) => {
  const query = text.toLowerCase();
  return [api.name ?? "", api.apiId ?? ""].some((value) => value.toLowerCase().includes(query));
};

export function ApiList() {
  useBreadcrumbs(appsyncBaseCrumbs);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const { flociPublicUrl } = useLoadedConfig();
  const apis = useApis();

  const createButton = (
    <Button href={appsyncRoutes.createApi} onFollow={follow}>
      Create API
    </Button>
  );

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<GraphqlApi>(apis.data ?? [], {
      filtering: {
        empty: emptyOrError(
          apis,
          <EmptyState
            title='No APIs'
            description='Create an API, or deploy one with CDK, then refresh.'
            action={createButton}
          />,
        ),
        noMatch: (
          <EmptyState
            title='No matches'
            action={<Button onClick={() => actions.setFiltering("")}>Clear filter</Button>}
          />
        ),
        filteringFunction: matchesText,
      },
      sorting: { defaultState: { sortingColumn: { sortingField: NAME_FIELD } } },
      pagination: { pageSize: PAGE_SIZE },
      selection: { trackBy: ID_FIELD },
    });

  // Lấy bản mới nhất của dòng đang chọn
  const selectedId = collectionProps.selectedItems?.[0]?.apiId;
  const apiActions = useApiActions(apis.data?.find((api) => api.apiId === selectedId));

  const nameCell = (api: GraphqlApi) => (
    <Link href={appsyncRoutes.api(api.apiId ?? "")} onFollow={follow}>
      {api.name}
    </Link>
  );
  const nameColumn: TableProps.ColumnDefinition<GraphqlApi> = {
    id: "name",
    header: "Name",
    isRowHeader: true,
    sortingField: NAME_FIELD,
    cell: nameCell,
  };
  const authColumn: TableProps.ColumnDefinition<GraphqlApi> = {
    id: "auth",
    header: "Authorization",
    cell: (api) => authLabel(api.authenticationType),
  };

  const wideColumns: TableProps.ColumnDefinition<GraphqlApi>[] = [
    nameColumn,
    { id: "id", header: "API ID", cell: (api) => api.apiId },
    authColumn,
    {
      id: "endpoint",
      header: "GraphQL endpoint",
      cell: (api) =>
        api.uris?.GRAPHQL
          ? copyable(localEndpoint(flociPublicUrl, api.uris.GRAPHQL))
          : NOT_AVAILABLE,
    },
  ];

  // Khung hẹp: tầng 2 là ID và kiểu auth, màu xám
  const compactColumns: TableProps.ColumnDefinition<GraphqlApi>[] = [
    {
      ...nameColumn,
      cell: (api) => (
        <div>
          {nameCell(api)}
          <Box variant='small' display='block' color='text-body-secondary'>
            {[api.apiId, authLabel(api.authenticationType)].join(DETAIL_SEPARATOR)}
          </Box>
        </div>
      ),
    },
  ];

  const barActions: BarAction[] = [
    refreshAction(apis),
    { id: "create", text: "Create API", primary: true, href: appsyncRoutes.createApi },
  ];

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={apis.data ? `(${apis.data.length})` : undefined}
      description='GraphQL APIs in Floci. Run queries against them on the API page.'
      actions={
        <ActionBar
          compact={compact}
          actions={barActions}
          menuItems={apiActions.menuItems}
          onMenuItemClick={apiActions.onMenuItemClick}
        />
      }
    >
      APIs
    </Header>
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='single'
        ariaLabels={selectionLabels<GraphqlApi>("API", (api) => api.name ?? "")}
        trackBy={ID_FIELD}
        items={items}
        loading={apis.isLoading}
        loadingText='Loading APIs'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        header={header}
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder='Find APIs by name or ID'
            countText={`${filteredItemsCount ?? 0} matches`}
          />
        }
        pagination={<Pagination {...paginationProps} />}
      />
      {apiActions.modal}
    </div>
  );
}
