import Header from "@cloudscape-design/components/header";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { ReferenceLink } from "@shared/components/MissingReference.tsx";
import type { Sender } from "../senders.ts";

const COLUMNS: TableProps.ColumnDefinition<Sender>[] = [
  {
    id: "name",
    header: "Name",
    isRowHeader: true,
    cell: (sender) => <ReferenceLink name={sender.name} href={sender.href} missing={false} />,
  },
  { id: "type", header: "Type", cell: (sender) => sender.type },
  { id: "detail", header: "Sends", cell: (sender) => sender.detail },
];

interface Props {
  rows: Sender[];
  title: string;
  description: string;
}

// Bảng "ai đang gửi vào đây" dùng chung cho queue / topic / function và bus. Rỗng thì ẩn, để trang
// không có thêm khối thừa (giống EventSources)
export function SendersTable({ rows, title, description }: Props) {
  if (!rows.length) return null;
  return (
    <Table
      variant='container'
      trackBy='id'
      items={rows}
      columnDefinitions={COLUMNS}
      wrapLines
      header={
        <Header variant='h2' counter={`(${rows.length})`} description={description}>
          {title}
        </Header>
      }
    />
  );
}
