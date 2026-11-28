import Header from "@cloudscape-design/components/header";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { lastArnPart } from "@localconsole/core/shared";
import { summarizeFilterPolicy, type Subscription } from "@localconsole/core/sns";
import { useSubscriptionsOfEndpoint } from "../hooks/useSubscriptions.ts";
import { TopicLink } from "./TopicLink.tsx";

const COLUMNS: TableProps.ColumnDefinition<Subscription>[] = [
  {
    id: "topic",
    header: "Topic",
    isRowHeader: true,
    cell: (subscription) => <TopicLink name={lastArnPart(subscription.topicArn)} />,
  },
  { id: "raw", header: "Raw", cell: (subscription) => (subscription.rawDelivery ? "Yes" : "No") },
  {
    id: "filter",
    header: "Filter",
    cell: (subscription) => summarizeFilterPolicy(subscription.filterPolicy),
  },
];

// Topic đang đẩy vào queue. Rỗng hoặc lỗi thì ẩn, để trang queue không có thêm khối thừa
export function TopicSubscriptions({ endpointArn }: { endpointArn: string }) {
  const subscriptions = useSubscriptionsOfEndpoint(endpointArn);
  const rows = subscriptions.data ?? [];
  if (!rows.length) return null;

  return (
    <Table
      variant='container'
      trackBy='arn'
      items={rows}
      columnDefinitions={COLUMNS}
      wrapLines
      header={
        <Header
          variant='h2'
          counter={`(${rows.length})`}
          description='Topics that publish into this queue.'
        >
          SNS subscriptions
        </Header>
      }
    />
  );
}
