import { useEffect, useState } from "react";
import { useWatch } from "react-hook-form";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import type { TableDescription } from "@aws-sdk/client-dynamodb";
import { FormFileUpload, FormRadioGroup } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { formatBytes, pluralize } from "@shared/format.ts";
import { errorMessage, notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  IMPORT_FILE_EXTENSION,
  IMPORT_MAX_BYTES,
  ITEM_FORMATS,
  ITEM_FORMAT_LABELS,
} from "../constants.ts";
import { parseImportText, type Item } from "../itemJson.ts";
import { useImportItems } from "../hooks/useItems.ts";
import { keySchemaOf } from "../hooks/useTables.ts";
import { importSchema, importTooLargeMessage } from "../schemas.ts";

const FORMAT_ITEMS = [
  {
    value: ITEM_FORMATS.dynamodb,
    label: ITEM_FORMAT_LABELS.dynamodb,
    description: 'The format of Export, e.g. [{"pk": {"S": "user#1"}}]',
  },
  {
    value: ITEM_FORMATS.json,
    label: ITEM_FORMAT_LABELS.json,
    description: 'e.g. [{"pk": "user#1"}]',
  },
];

interface FileCheck {
  items?: Item[];
  error?: string;
}

interface Props {
  table: TableDescription;
  onDismiss: () => void;
}

// Chỉ mount khi mở. Đọc và kiểm tra cả file trước khi ghi: có item sai thì không ghi gì
export function ImportModal({ table, onDismiss }: Props) {
  const tableName = table.TableName!;
  const keys = keySchemaOf(table);
  const [written, setWritten] = useState(0);
  const importItems = useImportItems(tableName, keys, setWritten);
  const form = useZodForm(importSchema, { files: [], format: ITEM_FORMATS.dynamodb });
  const [files, format] = useWatch({ control: form.control, name: ["files", "format"] });
  const [check, setCheck] = useState<FileCheck>({});
  const file = files?.[0];

  // Chọn file hoặc đổi định dạng thì đọc lại, để nút ghi đúng số item
  useEffect(() => {
    if (!file) return setCheck({});
    // Chọn nhầm file rất lớn thì báo ngay, không đọc vào bộ nhớ (đọc file vài trăm MB làm treo tab)
    if (file.size > IMPORT_MAX_BYTES) return setCheck({ error: importTooLargeMessage });
    let current = true;
    file
      .text()
      .then((text) => {
        if (current) setCheck({ items: parseImportText(text, format, keys) });
      })
      .catch((readError) => {
        if (current) setCheck({ error: errorMessage(readError) });
      });
    return () => {
      current = false;
    };
    // keys đổi theo bảng, không đổi khi modal đang mở, nên không cần theo dõi
  }, [file, format]);

  const items = check.items;
  const submit = form.handleSubmit(() => {
    if (!items) return;
    importItems.mutate(
      items,
      notifyBulkOutcome({
        success: (result) => `Imported ${pluralize(result.count, "item")} into ${tableName}`,
        errorHeader: "Couldn't import",
        then: onDismiss,
      }),
    );
  });

  const actionText = importItems.isPending
    ? `Importing ${written} of ${items?.length ?? 0}…`
    : items
      ? `Import ${pluralize(items.length, "item")}`
      : "Import";

  return (
    <FormModal
      header={`Import items into ${tableName}`}
      actionText={actionText}
      loading={importItems.isPending}
      disabled={!items}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormFileUpload
        control={form.control}
        name='files'
        label='File'
        accept={IMPORT_FILE_EXTENSION}
        constraintText={`A JSON array of items, up to ${formatBytes(IMPORT_MAX_BYTES)}.`}
      />
      {check.error && <Box color='text-status-error'>{check.error}</Box>}
      <FormRadioGroup control={form.control} name='format' label='Format' items={FORMAT_ITEMS} />
      <Alert>Items with the same key as an existing item overwrite it.</Alert>
    </FormModal>
  );
}
