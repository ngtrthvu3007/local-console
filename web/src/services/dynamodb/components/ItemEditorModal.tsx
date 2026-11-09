import { lazy, Suspense, useState } from "react";
import Box from "@cloudscape-design/components/box";
import FormField from "@cloudscape-design/components/form-field";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import Toggle from "@cloudscape-design/components/toggle";
import type { TableDescription } from "@aws-sdk/client-dynamodb";
import { ModalFooter } from "@shared/components/ModalFooter.tsx";
import { ErrorState } from "@shared/components/TableStates.tsx";
import { errorMessage, notifySuccess } from "@shared/hooks/useNotify.ts";
import { prettyJson } from "@shared/json.ts";
import { ITEM_FORMATS, ITEM_FORMAT_LABELS, type ItemFormat } from "../constants.ts";
import {
  keyChanged,
  keyError,
  keyLabel,
  needsDynamoJson,
  parseEditorText,
  toEditorText,
  type Item,
} from "../itemJson.ts";
import { useFullItem, usePutItem } from "../hooks/useItems.ts";
import { keyAttributesOf, keySchemaOf, type IndexKeys } from "../hooks/useTables.ts";

const CodeEditor = lazy(() => import("@shared/components/CodeEditor.tsx"));

const EDITOR_HEIGHT_PX = 360;
const BINARY_KEY_REASON = "Shown as DynamoDB JSON: this table has a binary key, written as base64.";

export type ItemEditorMode = "create" | "edit" | "duplicate";

const HEADERS: Record<ItemEditorMode, string> = {
  create: "Create item",
  edit: "Edit item",
  duplicate: "Duplicate item",
};

// Item mới: các key của bảng với giá trị rỗng để điền
function blankItemText(keys: IndexKeys, format: ItemFormat) {
  const blank = Object.fromEntries(
    keyAttributesOf(keys).map((key) =>
      format === ITEM_FORMATS.json
        ? [key.name, key.type === "N" ? 0 : ""]
        : [key.name, { [key.type]: key.type === "N" ? "0" : "" }],
    ),
  );
  return prettyJson(blank);
}

interface Props {
  table: TableDescription;
  mode: ItemEditorMode;
  item?: Item; // item đang sửa hoặc đang nhân bản
  onDismiss: () => void;
}

// Chỉ mount khi mở. Sửa / nhân bản thì đọc lại cả item trước (bản trong bảng có thể cũ
// hoặc chỉ là phần index trả về), rồi mới mở editor với dữ liệu mới nhất
export function ItemEditorModal(props: Props) {
  const { table, mode, item, onDismiss } = props;
  const fullItem = useFullItem(table.TableName!, item, keySchemaOf(table));
  if (!item) return <ItemEditor {...props} />;
  if (fullItem.data) return <ItemEditor {...props} item={fullItem.data} />;

  const body = fullItem.isError ? (
    <ErrorState error={fullItem.error} onRetry={() => fullItem.refetch()} />
  ) : fullItem.data === null ? (
    <Box>This item no longer exists. It may have been deleted.</Box>
  ) : (
    <Spinner />
  );
  return (
    <Modal visible size='large' header={HEADERS[mode]} onDismiss={onDismiss}>
      {body}
    </Modal>
  );
}

function ItemEditor({ table, mode, item, onDismiss }: Props) {
  const tableName = table.TableName!;
  const keys = keySchemaOf(table);
  const putItem = usePutItem(tableName);
  const hasBinaryKey = keyAttributesOf(keys).some((key) => key.type === "B");
  // Item có số lớn, Set, Binary (hoặc bảng có key Binary) chỉ sửa được bằng DynamoDB JSON
  const lockedReason =
    (item && needsDynamoJson(item)) ?? (hasBinaryKey ? BINARY_KEY_REASON : undefined);
  const [format, setFormat] = useState<ItemFormat>(
    lockedReason ? ITEM_FORMATS.dynamodb : ITEM_FORMATS.json,
  );
  const [text, setText] = useState(() =>
    item ? toEditorText(item, format) : blankItemText(keys, format),
  );
  const [error, setError] = useState<string>();

  const changeText = (next: string) => {
    setText(next);
    setError(undefined);
  };

  // Đổi dạng chỉ khi nội dung hiện tại hợp lệ, và dạng mới giữ được dữ liệu
  const switchFormat = (useDynamoJson: boolean) => {
    const nextFormat = useDynamoJson ? ITEM_FORMATS.dynamodb : ITEM_FORMATS.json;
    try {
      const parsed = parseEditorText(text, format);
      const reason = nextFormat === ITEM_FORMATS.json ? needsDynamoJson(parsed) : undefined;
      if (reason) return setError(reason);
      setText(toEditorText(parsed, nextFormat));
      setFormat(nextFormat);
      setError(undefined);
    } catch (parseError) {
      setError(errorMessage(parseError));
    }
  };

  const save = () => {
    let next: Item;
    try {
      next = parseEditorText(text, format);
    } catch (parseError) {
      return setError(errorMessage(parseError));
    }
    const problem =
      keyError(next, keys) ??
      (mode === "edit" && item && keyChanged(item, next, keys)
        ? "Key attributes can't be changed. Use Duplicate to copy the item with a new key."
        : undefined);
    if (problem) return setError(problem);
    putItem.mutate(
      { item: next, createOnly: mode !== "edit", partitionKeyName: keys.partitionKey.name },
      {
        onSuccess: () => {
          notifySuccess(mode === "edit" ? "Saved item" : "Created item");
          onDismiss();
        },
        // Lỗi hiện ngay dưới editor, modal giữ nguyên nội dung để sửa tiếp
        onError: (saveError) => setError(errorMessage(saveError)),
      },
    );
  };

  const formatToggle = (
    <Toggle
      checked={format === ITEM_FORMATS.dynamodb}
      disabled={Boolean(lockedReason)}
      onChange={({ detail }) => switchFormat(detail.checked)}
    >
      {ITEM_FORMAT_LABELS.dynamodb}
    </Toggle>
  );

  const subtitle = mode === "edit" && item ? keyLabel(item, keys) : `Table ${tableName}`;

  return (
    <Modal
      visible
      size='large'
      header={HEADERS[mode]}
      onDismiss={onDismiss}
      footer={
        <ModalFooter
          actionText='Save'
          loading={putItem.isPending}
          onAction={save}
          onCancel={onDismiss}
        />
      }
    >
      <SpaceBetween size='s'>
        <Box color='text-body-secondary'>{subtitle}</Box>
        {formatToggle}
        {lockedReason && (
          <Box variant='small' color='text-body-secondary'>
            {lockedReason}
          </Box>
        )}
        <FormField stretch errorText={error}>
          <Suspense fallback={<Spinner />}>
            <CodeEditor value={text} onChange={changeText} height={EDITOR_HEIGHT_PX} />
          </Suspense>
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}
