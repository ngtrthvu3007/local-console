import AttributeEditor from "@cloudscape-design/components/attribute-editor";
import Input from "@cloudscape-design/components/input";
import type { KeyValue } from "@localconsole/core/shared";

export type { KeyValue };

const EMPTY_ROW: KeyValue = { key: "", value: "" };

interface Props {
  items: readonly KeyValue[];
  onChange: (items: KeyValue[]) => void;
  keyError: (index: number) => string | undefined;
  itemLabel?: string; // tên một dòng trên nút thêm và khi trống, vd: "environment variable"
}

// Không gắn với form cụ thể: nơi dùng bọc bằng Controller của field mảng (Secrets Manager, KMS)
export function KeyValueEditor({ items, onChange, keyError, itemLabel = "row" }: Props) {
  const update = (index: number, part: keyof KeyValue, value: string) =>
    onChange(items.map((item, at) => (at === index ? { ...item, [part]: value } : item)));

  const cell = (part: keyof KeyValue) => (item: KeyValue, index: number) => (
    <Input value={item[part]} onChange={({ detail }) => update(index, part, detail.value)} />
  );

  return (
    <AttributeEditor
      items={items}
      definition={[
        { label: "Key", control: cell("key"), errorText: (_item, index) => keyError(index) },
        { label: "Value", control: cell("value") },
      ]}
      addButtonText={`Add ${itemLabel}`}
      removeButtonText='Remove'
      empty={`No ${itemLabel}s.`}
      onAddButtonClick={() => onChange([...items, EMPTY_ROW])}
      onRemoveButtonClick={({ detail }) =>
        onChange(items.filter((_item, at) => at !== detail.itemIndex))
      }
    />
  );
}
