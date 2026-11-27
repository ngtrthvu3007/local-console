import { useCollection } from "@cloudscape-design/collection-hooks";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import TextFilter from "@cloudscape-design/components/text-filter";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR } from "@localconsole/core/shared";
import { TABLE_PAGE_SIZE } from "@shared/constants.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { useKeyActions } from "../components/KeyActions.tsx";
import { KeyStatus } from "../components/KeyStatus.tsx";
import {
  KEY_MANAGERS,
  type KeyManager,
  keyTypeLabel,
  keyUsageLabel,
  kmsRoutes,
} from "@localconsole/core/kms";
import { useKeys, type KeyRow } from "../hooks/useKeys.ts";
import { kmsBaseCrumbs } from "../routes.ts";

const keyIdOfRow = (row: KeyRow) => row.meta.KeyId ?? "";

const matchesText = (row: KeyRow, text: string) => {
  const query = text.toLowerCase();
  return [keyIdOfRow(row), ...row.aliases].some((value) => value.toLowerCase().includes(query));
};

const PAGES: Record<KeyManager, { title: string; description: string; crumb: string }> = {
  CUSTOMER: {
    title: "Customer managed keys",
    description: "Keys you create in Floci.",
    crumb: "Customer managed keys",
  },
  AWS: {
    title: "AWS managed keys",
    description: "Default keys of AWS services in Floci. You can't change them.",
    crumb: "AWS managed keys",
  },
};

function KeyList({ manager }: { manager: KeyManager }) {
  const customer = manager === KEY_MANAGERS.customer;
  const page = PAGES[manager];
  const href = customer ? kmsRoutes.keys : kmsRoutes.awsKeys;
  useBreadcrumbs([kmsBaseCrumbs[0], { text: page.crumb, href }]);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const { region } = useLoadedConfig();
  const keys = useKeys(manager);

  const createButton = (
    <Button variant='primary' href={kmsRoutes.createKey} onFollow={follow}>
      Create key
    </Button>
  );

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<KeyRow>(keys.data ?? [], {
      filtering: {
        empty: emptyOrError(
          keys,
          <EmptyState
            title='No keys'
            description={
              customer ? "Create a key, or create one with CDK, then refresh." : undefined
            }
            action={customer ? createButton : undefined}
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
      pagination: { pageSize: TABLE_PAGE_SIZE },
      selection: { trackBy: (row) => keyIdOfRow(row) },
    });

  // Lấy bản mới nhất của dòng đang chọn: selectedItems giữ trạng thái cũ, menu sẽ khóa sai
  const selectedId =
    collectionProps.selectedItems?.[0] && keyIdOfRow(collectionProps.selectedItems[0]);
  const selected = keys.data?.find((row) => keyIdOfRow(row) === selectedId);
  const keyActions = useKeyActions(selected);

  const nameCell = (row: KeyRow) => (
    <Link href={kmsRoutes.key(keyIdOfRow(row))} onFollow={follow}>
      {row.aliases[0] ?? keyIdOfRow(row)}
    </Link>
  );
  const statusColumn: TableProps.ColumnDefinition<KeyRow> = {
    id: "status",
    header: "Status",
    cell: (row) => <KeyStatus meta={row.meta} />,
  };

  const wideColumns: TableProps.ColumnDefinition<KeyRow>[] = [
    { id: "alias", header: "Aliases", isRowHeader: true, cell: nameCell },
    { id: "id", header: "Key ID", cell: keyIdOfRow },
    statusColumn,
    { id: "type", header: "Key type", cell: (row) => keyTypeLabel(row.meta) },
    { id: "usage", header: "Key usage", cell: (row) => keyUsageLabel(row.meta.KeyUsage) },
  ];

  // Khung hẹp: tầng 2 là ID, loại, cách dùng, màu xám
  const compactColumns: TableProps.ColumnDefinition<KeyRow>[] = [
    {
      id: "alias",
      header: "Key",
      isRowHeader: true,
      cell: (row) => (
        <div>
          {nameCell(row)}
          <Box variant='small' display='block' color='text-body-secondary'>
            {[keyIdOfRow(row), keyTypeLabel(row.meta), keyUsageLabel(row.meta.KeyUsage)].join(
              DETAIL_SEPARATOR,
            )}
          </Box>
        </div>
      ),
    },
    statusColumn,
  ];

  const barActions: BarAction[] = [
    refreshAction(keys),
    ...(customer
      ? [{ id: "create", text: "Create key", primary: true, href: kmsRoutes.createKey }]
      : []),
  ];

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={keys.data ? `(${keys.data.length})` : undefined}
      description={`${page.description} Region: ${region}.`}
      actions={
        <ActionBar
          compact={compact}
          actions={barActions}
          menuItems={customer ? keyActions.menuItems : undefined}
          onMenuItemClick={customer ? keyActions.onMenuItemClick : undefined}
        />
      }
    >
      {page.title}
    </Header>
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType={customer ? "single" : undefined}
        ariaLabels={selectionLabels<KeyRow>("key", keyIdOfRow)}
        trackBy={keyIdOfRow}
        items={items}
        loading={keys.isLoading}
        loadingText='Loading keys'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        header={header}
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder='Find keys by alias or ID'
            countText={`${filteredItemsCount ?? 0} matches`}
          />
        }
        pagination={<Pagination {...paginationProps} />}
      />
      {keyActions.modal}
    </div>
  );
}

export const CustomerKeyList = () => <KeyList manager={KEY_MANAGERS.customer} />;
export const AwsKeyList = () => <KeyList manager={KEY_MANAGERS.aws} />;
