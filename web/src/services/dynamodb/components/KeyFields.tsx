import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import { KEY_TYPES } from "../constants.ts";

const KEY_TYPE_OPTIONS = Object.entries(KEY_TYPES).map(([value, label]) => ({
  value,
  label,
}));

// Tên key co giãn, ô kiểu cố định vừa chữ dài nhất ("Number") để không bị cắt, cùng một dòng
const TYPE_SELECT_WIDTH_PX = 136;
const ROW_GAP_PX = 8;
const rowStyle = {
  display: "grid",
  gridTemplateColumns: `minmax(0, 1fr) ${TYPE_SELECT_WIDTH_PX}px`,
  gap: ROW_GAP_PX,
} as const;

interface Props<TValues extends FieldValues> {
  control: Control<TValues, unknown, FieldValues>;
  path: string; // vd: "partitionKey", "indexes.0.sortKey"
  label?: string;
  description?: string;
  placeholder?: string;
}

// Một hàng [tên key][kiểu], báo lỗi của cả hai ô
export function KeyFields<TValues extends FieldValues>(props: Props<TValues>) {
  const { control, path, label, description, placeholder } = props;
  const namePath = `${path}.name` as Path<TValues>;
  const typePath = `${path}.type` as Path<TValues>;
  return (
    <Controller
      control={control}
      name={namePath}
      render={({ field: nameField, fieldState: nameState }) => (
        <Controller
          control={control}
          name={typePath}
          render={({ field: typeField, fieldState: typeState }) => (
            <FormField
              label={label}
              description={description}
              errorText={nameState.error?.message ?? typeState.error?.message}
            >
              <div style={rowStyle}>
                <Input
                  value={nameField.value ?? ""}
                  placeholder={placeholder}
                  invalid={Boolean(nameState.error)}
                  ariaLabel={label ? `${label} name` : "Key name"}
                  onChange={({ detail }) => nameField.onChange(detail.value)}
                />
                <Select
                  options={KEY_TYPE_OPTIONS}
                  ariaLabel={label ? `${label} type` : "Key type"}
                  invalid={Boolean(typeState.error)}
                  selectedOption={
                    KEY_TYPE_OPTIONS.find((option) => option.value === typeField.value) ?? null
                  }
                  onChange={({ detail }) => typeField.onChange(detail.selectedOption.value)}
                />
              </div>
            </FormField>
          )}
        />
      )}
    />
  );
}
