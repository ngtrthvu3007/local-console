import { useCollection } from "@cloudscape-design/collection-hooks";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useQuery } from "@tanstack/react-query";
import { listEventSources } from "../eventSources.ts";
import { EVENTBRIDGE_QUERY_ROOT } from "../hooks/useBuses.ts";
import { useEventBridge } from "../hooks/useEventBridge.ts";
import { useScheduler } from "../hooks/useScheduler.ts";
import { eventbridgeRoutes } from "../routes.ts";

const PAGE_SIZE = 10;

interface Row {
  id: string;
  type: "Rule" | "Schedule";
  name: string;
  where: string; // bus của rule, group của schedule
  href: string;
}

function NameCell({ row }: { row: Row }) {
  const follow = useFollow();

  return (
    <Link href={row.href} onFollow={follow}>
      {row.name}
    </Link>
  );
}

const COLUMNS: TableProps.ColumnDefinition<Row>[] = [
  { id: "name", header: "Name", isRowHeader: true, cell: (row) => <NameCell row={row} /> },
  { id: "type", header: "Type", cell: (row) => row.type },
  { id: "where", header: "Bus / group", cell: (row) => row.where },
];

// Rỗng hoặc lỗi thì ẩn để trang queue / topic không có khối thừa
export function EventSources({ targetArn }: { targetArn: string }) {
  const events = useEventBridge();
  const scheduler = useScheduler();

  // Dưới key gốc của EventBridge: tạo / sửa / xóa rule hay schedule làm mới luôn khối này
  const sources = useQuery({
    queryKey: [EVENTBRIDGE_QUERY_ROOT, "sources", targetArn],
    queryFn: () => listEventSources(events, scheduler, (candidate) => candidate === targetArn),
  });

  const rows: Row[] = [
    ...(sources.data?.rules ?? []).map(({ bus, rule }) => ({
      id: `rule:${bus}/${rule}`,
      type: "Rule" as const,
      name: rule,
      where: bus,
      href: eventbridgeRoutes.rule(bus, rule),
    })),
    ...(sources.data?.schedules ?? []).map(({ group, name }) => ({
      id: `schedule:${group}/${name}`,
      type: "Schedule" as const,
      name,
      where: group,
      href: eventbridgeRoutes.schedule(group, name),
    })),
  ];

  const { items, paginationProps } = useCollection(rows, { pagination: { pageSize: PAGE_SIZE } });
  if (!rows.length) return null;

  return (
    <Table
      variant='container'
      trackBy='id'
      items={items}
      pagination={rows.length > PAGE_SIZE ? <Pagination {...paginationProps} /> : undefined}
      columnDefinitions={COLUMNS}
      wrapLines
      header={
        <Header
          variant='h2'
          counter={`(${rows.length})`}
          description='EventBridge rules and schedules that send events here.'
        >
          EventBridge
        </Header>
      }
    />
  );
}
