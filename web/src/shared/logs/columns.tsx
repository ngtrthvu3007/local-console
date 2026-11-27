import type { OutputLogEvent } from "@aws-sdk/client-cloudwatch-logs";
import Box from "@cloudscape-design/components/box";
import type { TableProps } from "../components/ResponsiveTable.tsx";
import { formatDate } from "@localconsole/core/shared";
import { logMessageText } from "@localconsole/core/logs";

// Tách khỏi LogEvents.tsx để trang chỉ cần bảng (ECS, trang stream) không kéo theo ô lọc, khoảng thời gian…
// Giữ nguyên xuống dòng của log (stack trace…), dòng dài thì xuống dòng thay vì cuộn ngang
const messageStyle = { whiteSpace: "pre-wrap", wordBreak: "break-word" } as const;

// Dùng chung cho bảng log đọc bằng FilterLogEvents và GetLogEvents
export const logEventColumns: TableProps.ColumnDefinition<OutputLogEvent>[] = [
  { id: "timestamp", header: "Timestamp", cell: (event) => formatDate(event.timestamp) },
  {
    id: "message",
    header: "Message",
    isRowHeader: true,
    cell: (event) => (
      <div style={messageStyle}>
        <Box variant='code'>{logMessageText(event.message)}</Box>
      </div>
    ),
  },
];
