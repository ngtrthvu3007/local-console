import { useCollection } from "@cloudscape-design/collection-hooks";
import type { DistributionSummary } from "@aws-sdk/client-cloudfront";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import TextFilter from "@cloudscape-design/components/text-filter";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR, NOT_AVAILABLE } from "@shared/constants.ts";
import { formatDate } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { useDistributionActions } from "../components/DistributionActions.tsx";
import { DistributionStatus } from "../components/DistributionStatus.tsx";
import { localUrl } from "../distributions.ts";
import { useDistributions } from "../hooks/useDistributions.ts";
import { cloudfrontBaseCrumbs, cloudfrontRoutes } from "../routes.ts";

const ID_FIELD = "Id";
const MODIFIED_FIELD = "LastModifiedTime";
const PAGE_SIZE = 50;
const ORIGIN_SEPARATOR = ", ";

const originDomains = (summary: DistributionSummary) =>
  (summary.Origins?.Items ?? []).map((origin) => origin.DomainName ?? "");

const matchesText = (summary: DistributionSummary, text: string) => {
  const query = text.toLowerCase();
  return [summary.Id ?? "", summary.Comment ?? "", ...originDomains(summary)].some((value) =>
    value.toLowerCase().includes(query),
  );
};

export function DistributionList() {
  useBreadcrumbs(cloudfrontBaseCrumbs);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const { flociPublicUrl } = useLoadedConfig();
  const distributions = useDistributions();

  const createButton = (
    <Button href={cloudfrontRoutes.createDistribution()} onFollow={follow}>
      Create distribution
    </Button>
  );

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<DistributionSummary>(distributions.data ?? [], {
      filtering: {
        empty: emptyOrError(
          distributions,
          <EmptyState
            title='No distributions'
            description='Create a distribution for a bucket, or deploy one with CDK, then refresh.'
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
      // Distribution vừa sửa nằm trên cùng
      sorting: {
        defaultState: { sortingColumn: { sortingField: MODIFIED_FIELD }, isDescending: true },
      },
      pagination: { pageSize: PAGE_SIZE },
      selection: { trackBy: ID_FIELD },
    });

  // Lấy bản mới nhất của dòng đang chọn: selectedItems giữ trạng thái cũ, menu sẽ khóa sai sau Disable
  const selectedId = collectionProps.selectedItems?.[0]?.Id;
  const selected = distributions.data?.find((summary) => summary.Id === selectedId);
  const distributionActions = useDistributionActions(
    selected && { id: selected.Id ?? "", enabled: Boolean(selected.Enabled) },
  );

  const idCell = (summary: DistributionSummary) => (
    <Link href={cloudfrontRoutes.distribution(summary.Id ?? "")} onFollow={follow}>
      {summary.Id}
    </Link>
  );
  const idColumn: TableProps.ColumnDefinition<DistributionSummary> = {
    id: "id",
    header: "ID",
    isRowHeader: true,
    sortingField: ID_FIELD,
    cell: idCell,
  };
  const statusColumn: TableProps.ColumnDefinition<DistributionSummary> = {
    id: "status",
    header: "Status",
    cell: (summary) => <DistributionStatus enabled={summary.Enabled} />,
  };

  const wideColumns: TableProps.ColumnDefinition<DistributionSummary>[] = [
    idColumn,
    {
      id: "description",
      header: "Description",
      cell: (summary) => summary.Comment || NOT_AVAILABLE,
    },
    {
      id: "url",
      header: "Local URL",
      cell: (summary) => {
        const url = localUrl(flociPublicUrl, summary.Id ?? "");
        return (
          <Link href={url} external>
            {url}
          </Link>
        );
      },
    },
    {
      id: "origins",
      header: "Origins",
      cell: (summary) => originDomains(summary).join(ORIGIN_SEPARATOR) || NOT_AVAILABLE,
    },
    statusColumn,
    {
      id: "modified",
      header: "Last modified",
      sortingField: MODIFIED_FIELD,
      cell: (summary) => formatDate(summary.LastModifiedTime),
    },
  ];

  // Khung hẹp: tầng 2 là mô tả và origin, màu xám
  const compactColumns: TableProps.ColumnDefinition<DistributionSummary>[] = [
    {
      ...idColumn,
      cell: (summary) => (
        <div>
          {idCell(summary)}
          <Box variant='small' display='block' color='text-body-secondary'>
            {[summary.Comment, originDomains(summary).join(ORIGIN_SEPARATOR)]
              .filter(Boolean)
              .join(DETAIL_SEPARATOR)}
          </Box>
        </div>
      ),
    },
    statusColumn,
  ];

  const barActions: BarAction[] = [
    refreshAction(distributions),
    {
      id: "create",
      text: "Create distribution",
      primary: true,
      href: cloudfrontRoutes.createDistribution(),
    },
  ];

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={distributions.data ? `(${distributions.data.length})` : undefined}
      description='Floci serves each distribution at a local URL, without caching.'
      actions={
        <ActionBar
          compact={compact}
          actions={barActions}
          menuItems={distributionActions.menuItems}
          onMenuItemClick={distributionActions.onMenuItemClick}
        />
      }
    >
      Distributions
    </Header>
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='single'
        ariaLabels={selectionLabels<DistributionSummary>(
          "distribution",
          (summary) => summary.Id ?? "",
        )}
        trackBy={ID_FIELD}
        items={items}
        loading={distributions.isLoading}
        loadingText='Loading distributions'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        header={header}
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder='Find distributions by ID, description or origin'
            countText={`${filteredItemsCount ?? 0} matches`}
          />
        }
        pagination={<Pagination {...paginationProps} />}
      />
      {distributionActions.modal}
    </div>
  );
}
