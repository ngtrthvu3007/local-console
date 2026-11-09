import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import type { TableDescription } from "@aws-sdk/client-dynamodb";
import { isNotFoundError } from "@shared/aws.ts";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import { NotFound } from "@shared/components/NotFound.tsx";
import { ErrorState } from "@shared/components/TableStates.tsx";
import { pluralize } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { DeleteTablesModal } from "../components/DeleteTablesModal.tsx";
import { ItemsTab } from "../components/ItemsTab.tsx";
import { SettingsTab } from "../components/SettingsTab.tsx";
import { keyText } from "../components/KeyLabel.tsx";
import { DETAIL_SEPARATOR } from "../constants.ts";
import { keySchemaOf, useTable } from "../hooks/useTables.ts";
import {
  SEARCH_PARAMS,
  TABLE_TABS,
  dynamodbRoutes,
  tableCrumbs,
  type TableTab,
} from "../routes.ts";

const isTableTab = (value: string | null): value is TableTab =>
  Object.values<string | null>(TABLE_TABS).includes(value);

// "pk String · sk String · 1,204 items · Stream on": thay cho khối overview, để mở tab là thấy dữ liệu
function tableSummary(table: TableDescription) {
  const keys = keySchemaOf(table);
  return [
    keyText(keys.partitionKey),
    keys.sortKey && keyText(keys.sortKey),
    pluralize(table.ItemCount ?? 0, "item"),
    table.StreamSpecification?.StreamEnabled ? "Stream on" : "Stream off",
  ]
    .filter(Boolean)
    .join(DETAIL_SEPARATOR);
}

export function TableDetail() {
  const { table: tableName = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get(SEARCH_PARAMS.tab);
  const tab = isTableTab(requestedTab) ? requestedTab : TABLE_TABS.items;
  const details = useTable(tableName);
  const [deleting, setDeleting] = useState(false);

  useBreadcrumbs(tableCrumbs(tableName));

  const selectTab = (nextTab: string) =>
    setSearchParams(nextTab === TABLE_TABS.items ? {} : { [SEARCH_PARAMS.tab]: nextTab });

  if (details.isLoading) return <Spinner size='large' />;
  if (details.isError && isNotFoundError(details.error)) {
    return (
      <NotFound
        title={`Table ${tableName} not found`}
        description='It may have been deleted, or the name is wrong.'
        backHref={dynamodbRoutes.tables}
        backText='View tables'
      />
    );
  }
  if (!details.data) {
    return (
      <Container>
        <ErrorState error={details.error} onRetry={() => details.refetch()} />
      </Container>
    );
  }

  const table = details.data;
  const tabs: TabsProps.Tab[] = [
    { id: TABLE_TABS.items, label: "Items", content: <ItemsTab table={table} /> },
    { id: TABLE_TABS.settings, label: "Settings", content: <SettingsTab table={table} /> },
  ];

  const headerActions = (
    <SpaceBetween direction='horizontal' size='xs'>
      <CopyButton label='Copy ARN' text={table.TableArn} />
      <Button onClick={() => setDeleting(true)}>Delete</Button>
    </SpaceBetween>
  );

  const header = (
    <Header variant='h1' description={tableSummary(table)} actions={headerActions}>
      {tableName}
    </Header>
  );

  return (
    <ContentLayout header={header}>
      <Tabs
        activeTabId={tab}
        tabs={tabs}
        onChange={({ detail }) => selectTab(detail.activeTabId)}
      />
      {deleting && (
        <DeleteTablesModal
          tables={[table]}
          onDismiss={() => setDeleting(false)}
          onDone={() => navigate(dynamodbRoutes.tables)}
        />
      )}
    </ContentLayout>
  );
}
