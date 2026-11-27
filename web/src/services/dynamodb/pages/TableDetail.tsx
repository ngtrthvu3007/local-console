import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import Button from "@cloudscape-design/components/button";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import type { TableDescription } from "@aws-sdk/client-dynamodb";
import { useTabParam } from "@shared/hooks/useTabParam.ts";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { pluralize, DETAIL_SEPARATOR } from "@localconsole/core/shared";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { DeleteTablesModal } from "../components/DeleteTablesModal.tsx";
import { ItemsTab } from "../components/ItemsTab.tsx";
import { SettingsTab } from "../components/SettingsTab.tsx";
import { keyText } from "../components/KeyLabel.tsx";
import { StackLink } from "@shared/StackLink.tsx";
import { useTable } from "../hooks/useTables.ts";
import { keySchemaOf, TABLE_TABS, dynamodbRoutes } from "@localconsole/core/dynamodb";
import { tableCrumbs } from "../routes.ts";

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
  const [tab, setTab] = useTabParam(TABLE_TABS, TABLE_TABS.items);
  const details = useTable(tableName);
  const [deleting, setDeleting] = useState(false);

  useBreadcrumbs(tableCrumbs(tableName));

  const state = pageState(details, {
    ready: Boolean(details.data),
    title: `Table ${tableName} not found`,
    backHref: dynamodbRoutes.tables,
    backText: "View tables",
  });
  if (state || !details.data) return state;

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
    <Header
      variant='h1'
      description={
        <>
          {tableSummary(table)}
          <StackLink separated type='AWS::DynamoDB::Table' physicalId={tableName} />
        </>
      }
      actions={headerActions}
    >
      {tableName}
    </Header>
  );

  return (
    <ContentLayout header={header}>
      <Tabs activeTabId={tab} tabs={tabs} onChange={({ detail }) => setTab(detail.activeTabId)} />
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
