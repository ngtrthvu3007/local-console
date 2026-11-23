import { useState } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Tabs from "@cloudscape-design/components/tabs";
import { BreakableText } from "@shared/components/BreakableText.tsx";
import { CodeSnippet } from "@shared/components/CodeSnippet.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { ErrorState } from "@shared/components/TableStates.tsx";
import { SECRET_TYPES, type SecretType } from "../constants.ts";
import { useSecretValue } from "../hooks/useSecrets.ts";
import { keyValueOf, readableText, type KeyValue } from "../secretValue.ts";
import { EditKeyValueModal, EditPlaintextModal } from "./EditSecretValueModal.tsx";

// Như bảng biến môi trường của Lambda: khung hẹp thành dòng hai tầng, giá trị dài xuống dòng
const ENTRY_COLUMNS: TableProps.ColumnDefinition<KeyValue>[] = [
  {
    id: "key",
    header: "Key",
    isRowHeader: true,
    cell: (entry) => <BreakableText text={entry.key} />,
  },
  { id: "value", header: "Value", cell: (entry) => <BreakableText text={entry.value} /> },
];

export function SecretValue({ name }: { name: string }) {
  const [retrieved, setRetrieved] = useState(false);
  const [view, setView] = useState<SecretType>("keyValue");
  const [editing, setEditing] = useState(false);
  const value = useSecretValue(name, retrieved);
  const text = value.data?.SecretString;
  const entries = text === undefined ? undefined : keyValueOf(text);
  // Giá trị không phải key/value phẳng thì chỉ có Plaintext
  const shownView = entries ? view : "plaintext";

  // Một nút nên để nút thường (như ConfigurationTab của Lambda): ActionBar sẽ giấu nó vào menu trên phone
  const action = retrieved ? (
    <Button disabled={text === undefined} onClick={() => setEditing(true)}>
      Edit value
    </Button>
  ) : (
    <Button onClick={() => setRetrieved(true)}>Retrieve secret value</Button>
  );

  const plaintext = text !== undefined && <CodeSnippet code={readableText(text)} wrap />;

  const body = () => {
    if (!retrieved) return <Box color='text-body-secondary'>Retrieve the value to see it.</Box>;
    if (value.isLoading) return <StatusIndicator type='loading'>Loading value</StatusIndicator>;
    if (value.isError) return <ErrorState error={value.error} onRetry={() => value.refetch()} />;
    if (text === undefined) return <Box color='text-body-secondary'>Binary secret — not shown</Box>;
    if (!entries) return plaintext;

    return (
      <Tabs
        activeTabId={shownView}
        onChange={({ detail }) =>
          setView(detail.activeTabId === "plaintext" ? "plaintext" : "keyValue")
        }
        tabs={[
          {
            id: "keyValue",
            label: SECRET_TYPES.keyValue,
            content: (
              <Table
                variant='borderless'
                items={entries}
                trackBy='key'
                columnDefinitions={ENTRY_COLUMNS}
                wrapLines
              />
            ),
          },
          { id: "plaintext", label: SECRET_TYPES.plaintext, content: plaintext },
        ]}
      />
    );
  };

  return (
    <Container
      header={
        <Header variant='h2' actions={action}>
          Secret value
        </Header>
      }
    >
      {body()}
      {editing &&
        text !== undefined &&
        (shownView === "keyValue" && entries ? (
          <EditKeyValueModal name={name} entries={entries} onDismiss={() => setEditing(false)} />
        ) : (
          <EditPlaintextModal name={name} plaintext={text} onDismiss={() => setEditing(false)} />
        ))}
    </Container>
  );
}
