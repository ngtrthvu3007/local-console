import AttributeEditor from "@cloudscape-design/components/attribute-editor";
import Input from "@cloudscape-design/components/input";
import type { KeyValue } from "../secretValue.ts";

const EMPTY_ROW: KeyValue = { key: "", value: "" };

interface Props {
  items: readonly KeyValue[];
  onChange: (items: KeyValue[]) => void;
  keyError: (index: number) => string | undefined;
}

// Không gắn với form cụ thể: trang tạo và modal sửa bọc bằng Controller của field "entries"
export function KeyValueEditor({ items, onChange, keyError }: Props) {
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
      addButtonText='Add row'
      removeButtonText='Remove'
      empty='No rows.'
      onAddButtonClick={() => onChange([...items, EMPTY_ROW])}
      onRemoveButtonClick={({ detail }) =>
        onChange(items.filter((_item, at) => at !== detail.itemIndex))
      }
    />
  );
}
