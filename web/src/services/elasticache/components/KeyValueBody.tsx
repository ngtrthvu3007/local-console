import { useState } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import type { KeyValue } from "@server/routes/redis/contract.ts";
import { EmptyState, ErrorState } from "@shared/components/TableStates.tsx";
import { formatBytes } from "@shared/format.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { STRING_EDITOR_HEIGHT_PX } from "../constants.ts";
import { isKeyNotFound, useUpdateKey, type KeyValueQuery } from "../hooks/useRedis.ts";
import { CollectionTable } from "./CollectionTable.tsx";
import { ValueEditor } from "@shared/components/ValueEditor.tsx";

type StringValue = Extract<KeyValue, { kind: "string" }>;

function StringEditor({ cluster, value }: { cluster: string; value: StringValue }) {
  const updateKey = useUpdateKey(cluster, value.name);
  const [text, setText] = useState(value.value ?? "");
  const changed = text !== value.value;

  // Binary hoặc quá lớn: lưu lại chuỗi đã decode sẽ làm hỏng dữ liệu gốc
  if (value.value === null) {
    return (
      <Box color='text-body-secondary'>
        Binary or large value ({formatBytes(value.length)}) can't be edited here.
      </Box>
    );
  }

  const save = () =>
    updateKey.mutate(
      { operation: "setString", value: text },
      notifyOutcome({ success: `Saved ${value.name}`, errorHeader: `Couldn't save ${value.name}` }),
    );

  return (
    <SpaceBetween size='s'>
      <ValueEditor value={text} onChange={setText} height={STRING_EDITOR_HEIGHT_PX} />
      <Box float='right'>
        <SpaceBetween direction='horizontal' size='xs'>
          <Button disabled={!changed} onClick={() => setText(value.value ?? "")}>
            Reset
          </Button>
          <Button
            variant='primary'
            disabled={!changed}
            loading={updateKey.isPending}
            onClick={save}
          >
            Save
          </Button>
        </SpaceBetween>
      </Box>
    </SpaceBetween>
  );
}

interface Props {
  cluster: string;
  name: string;
  query: KeyValueQuery;
  value?: KeyValue; // các trang của query đã gộp
}

// Thân panel: nội dung theo kiểu của key
export function KeyValueBody({ cluster, name, query, value }: Props) {
  if (query.isLoading) return <Spinner size='large' />;
  if (isKeyNotFound(query.error)) {
    return (
      <EmptyState
        title={`Key ${name} no longer exists`}
        description='It was deleted or it expired.'
      />
    );
  }
  if (!value) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  switch (value.kind) {
    case "string":
      // Đổi key thì editor mới với giá trị của key đó
      return <StringEditor key={value.name} cluster={cluster} value={value} />;
    case "unsupported":
      return (
        <EmptyState
          title={`Viewing ${value.type} keys isn't supported`}
          description='You can still set its TTL or delete it.'
        />
      );
    default:
      return (
        <CollectionTable
          key={value.name}
          cluster={cluster}
          name={name}
          value={value}
          query={query}
        />
      );
  }
}
