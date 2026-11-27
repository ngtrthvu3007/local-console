import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { CodeSnippet } from "@shared/components/CodeSnippet.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { downloadBlob } from "@shared/download.ts";
import { formatBytes } from "@localconsole/core/shared";
import { HTML_PREVIEW_HEIGHT } from "../constants.ts";
import { useEmailContent } from "../hooks/useMailbox.ts";
import { rawText, type Email, type HeaderLine } from "@localconsole/core/ses";
import { HtmlPreview } from "./HtmlPreview.tsx";

const previewFrameStyle = { maxHeight: HTML_PREVIEW_HEIGHT, overflow: "auto" } as const;

const headerColumns: TableProps.ColumnDefinition<HeaderLine>[] = [
  { id: "name", header: "Name", isRowHeader: true, cell: (line) => line.name },
  { id: "value", header: "Value", cell: (line) => line.value },
];

export function EmailPanel({ email }: { email: Email }) {
  const content = useEmailContent(email);

  if (email.RejectReason) return <Alert type='error'>{email.RejectReason}</Alert>;
  // readEmail không reject (MIME lỗi thì dùng field) nên chỉ còn trạng thái đang đọc
  if (!content.data) return <Spinner />;

  const { html, text, headers, attachments } = content.data;
  const tabs: TabsProps.Tab[] = [];
  if (html) {
    tabs.push({
      id: "html",
      label: "HTML",
      content: <HtmlPreview html={html} title='Email HTML' />,
    });
  }
  if (text) {
    tabs.push({
      id: "text",
      label: "Text",
      content: (
        <div style={previewFrameStyle}>
          <CodeSnippet code={text} wrap />
        </div>
      ),
    });
  }
  tabs.push({
    id: "headers",
    label: "Headers",
    content: (
      <Table variant='embedded' columnDefinitions={headerColumns} items={headers} wrapLines />
    ),
  });
  if (email.RawData) {
    tabs.push({
      id: "raw",
      label: "Raw",
      content: (
        <div style={previewFrameStyle}>
          <CodeSnippet code={rawText(email.RawData)} />
        </div>
      ),
    });
  }

  return (
    <SpaceBetween size='m'>
      {!html && !text && <Alert type='warning'>Can't read this email</Alert>}
      <Tabs tabs={tabs} />
      {attachments.length > 0 && (
        <SpaceBetween size='xs'>
          <Box variant='awsui-key-label'>Attachments</Box>
          {attachments.map(({ fileName, mimeType, content: data }, index) => (
            // Tên file có thể trùng (attachment không tên); danh sách không đổi thứ tự
            <SpaceBetween
              key={`${index}-${fileName}`}
              direction='horizontal'
              size='xs'
              alignItems='center'
            >
              <Box>
                {fileName} ({formatBytes(data.byteLength)})
              </Box>
              <Button
                iconName='download'
                ariaLabel={`Download ${fileName}`}
                onClick={() => downloadBlob(fileName, data, mimeType)}
              >
                Download
              </Button>
            </SpaceBetween>
          ))}
        </SpaceBetween>
      )}
    </SpaceBetween>
  );
}
