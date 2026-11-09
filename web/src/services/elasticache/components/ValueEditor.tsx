import { lazy, Suspense, useState } from "react";
import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";
import FormField from "@cloudscape-design/components/form-field";
import Spinner from "@cloudscape-design/components/spinner";
import type { EditorLanguage } from "@shared/components/CodeEditor.tsx";
import { EDITOR_HEIGHT_PX } from "../constants.ts";

// Nạp lười vì ace khá nặng
const CodeEditor = lazy(() => import("@shared/components/CodeEditor.tsx"));

// JSON object/array thì tô màu JSON, còn lại là chữ thường (không báo lỗi cú pháp)
function editorLanguageOf(value: string): EditorLanguage {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? "json" : "text";
  } catch {
    return "text";
  }
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  height?: number;
}

// Hiện đúng giá trị thô, không tự format JSON: format rồi lưu sẽ đổi dữ liệu mà BE đã ghi
export function ValueEditor({ value, onChange, height = EDITOR_HEIGHT_PX }: Props) {
  // Chọn chế độ một lần theo giá trị ban đầu, để gõ dở không làm editor đổi chế độ liên tục
  const [language] = useState(() => editorLanguageOf(value));
  return (
    <Suspense fallback={<Spinner />}>
      <CodeEditor value={value} onChange={onChange} language={language} height={height} />
    </Suspense>
  );
}

interface FieldProps<TValues extends FieldValues> {
  control: Control<TValues, unknown, FieldValues>;
  name: Path<TValues>;
  label: string;
  height?: number;
}

export function FormValueEditor<TValues extends FieldValues>(props: FieldProps<TValues>) {
  const { control, name, label, height } = props;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormField label={label} errorText={fieldState.error?.message} stretch>
          <ValueEditor value={field.value ?? ""} onChange={field.onChange} height={height} />
        </FormField>
      )}
    />
  );
}
