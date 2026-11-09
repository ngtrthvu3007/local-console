import { useRef, type ReactNode } from "react";
import {
  Controller,
  type Control,
  type ControllerRenderProps,
  type FieldValues,
  type Path,
} from "react-hook-form";
import Autosuggest, { type AutosuggestProps } from "@cloudscape-design/components/autosuggest";
import Checkbox from "@cloudscape-design/components/checkbox";
import Button from "@cloudscape-design/components/button";
import FileTokenGroup from "@cloudscape-design/components/file-token-group";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Multiselect from "@cloudscape-design/components/multiselect";
import RadioGroup, { type RadioGroupProps } from "@cloudscape-design/components/radio-group";
import SegmentedControl, {
  type SegmentedControlProps,
} from "@cloudscape-design/components/segmented-control";
import Select, { type SelectProps } from "@cloudscape-design/components/select";

// Nối react-hook-form với component của Cloudscape: giá trị qua Controller, lỗi zod hiện ở errorText

interface FieldProps<TValues extends FieldValues> {
  // Field chỉ đọc/ghi giá trị nhập; kiểu sau khi zod transform không liên quan
  control: Control<TValues, unknown, FieldValues>;
  name: Path<TValues>;
  label?: ReactNode;
  description?: ReactNode;
  constraintText?: ReactNode;
}

type Field<TValues extends FieldValues> = ControllerRenderProps<TValues, Path<TValues>>;

interface ControlledFieldProps<TValues extends FieldValues> extends FieldProps<TValues> {
  children: (field: Field<TValues>, invalid: boolean) => ReactNode;
}

function ControlledField<TValues extends FieldValues>(props: ControlledFieldProps<TValues>) {
  const { control, name, children, ...formFieldProps } = props;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormField {...formFieldProps} errorText={fieldState.error?.message}>
          {children(field, Boolean(fieldState.error))}
        </FormField>
      )}
    />
  );
}

interface InputProps<TValues extends FieldValues> extends FieldProps<TValues> {
  placeholder?: string;
  autoFocus?: boolean;
}

export function FormInput<TValues extends FieldValues>(props: InputProps<TValues>) {
  const { placeholder, autoFocus, ...fieldProps } = props;
  return (
    <ControlledField {...fieldProps}>
      {(field, invalid) => (
        <Input
          ref={field.ref}
          value={field.value ?? ""}
          placeholder={placeholder}
          autoFocus={autoFocus}
          invalid={invalid}
          onChange={({ detail }) => field.onChange(detail.value)}
          onBlur={field.onBlur}
        />
      )}
    </ControlledField>
  );
}

interface AutosuggestFieldProps<TValues extends FieldValues> extends InputProps<TValues> {
  options: AutosuggestProps.Options;
  enteredTextLabel: (value: string) => string; // dòng "Use: …" khi giá trị gõ tay không có trong gợi ý
}

// Ô nhập có gợi ý, vẫn gõ tay được giá trị bất kỳ
export function FormAutosuggest<TValues extends FieldValues>(
  props: AutosuggestFieldProps<TValues>,
) {
  const { options, enteredTextLabel, placeholder, ...fieldProps } = props;
  return (
    <ControlledField {...fieldProps}>
      {(field, invalid) => (
        <Autosuggest
          value={field.value ?? ""}
          options={options}
          placeholder={placeholder}
          invalid={invalid}
          enteredTextLabel={enteredTextLabel}
          onChange={({ detail }) => field.onChange(detail.value)}
          onBlur={field.onBlur}
        />
      )}
    </ControlledField>
  );
}

interface FileUploadFieldProps<TValues extends FieldValues> extends FieldProps<TValues> {
  accept?: string; // vd: ".json"
}

interface FilePickerProps {
  files: File[];
  accept?: string;
  onChange: (files: File[]) => void;
}

// Nút chọn file giống trang Upload của S3 (icon add-plus), file đã chọn hiện thành token có nút bỏ.
// FileUpload của Cloudscape luôn vẽ icon mũi tên upload, lệch với S3 nên không dùng.
function FilePicker({ files, accept, onChange }: FilePickerProps) {
  const input = useRef<HTMLInputElement>(null);
  const tokens = files.map((file) => ({ file }));
  return (
    <>
      <input
        ref={input}
        type='file'
        accept={accept}
        hidden
        onChange={(event) => {
          onChange(Array.from(event.target.files ?? []));
          // Cho phép chọn lại cùng một file sau khi đã bỏ
          event.target.value = "";
        }}
      />
      <Button iconName='add-plus' onClick={() => input.current?.click()}>
        Choose file
      </Button>
      {tokens.length > 0 && (
        <FileTokenGroup
          items={tokens}
          showFileSize
          onDismiss={({ detail }) =>
            onChange(files.filter((_file, index) => index !== detail.fileIndex))
          }
        />
      )}
    </>
  );
}

// Giá trị là mảng File
export function FormFileUpload<TValues extends FieldValues>(props: FileUploadFieldProps<TValues>) {
  const { accept, ...fieldProps } = props;
  return (
    <ControlledField {...fieldProps}>
      {(field) => (
        <FilePicker files={field.value ?? []} accept={accept} onChange={field.onChange} />
      )}
    </ControlledField>
  );
}

interface OptionsProps<TValues extends FieldValues> extends FieldProps<TValues> {
  options: SelectProps.Option[];
}

export function FormSelect<TValues extends FieldValues>(props: OptionsProps<TValues>) {
  const { options, ...fieldProps } = props;
  return (
    <ControlledField {...fieldProps}>
      {(field) => (
        <Select
          filteringType='auto'
          options={options}
          selectedOption={options.find((option) => option.value === field.value) ?? null}
          onChange={({ detail }) => field.onChange(detail.selectedOption.value)}
          onBlur={field.onBlur}
        />
      )}
    </ControlledField>
  );
}

export function FormMultiselect<TValues extends FieldValues>(props: OptionsProps<TValues>) {
  const { options, ...fieldProps } = props;
  return (
    <ControlledField {...fieldProps}>
      {(field) => (
        <Multiselect
          options={options}
          selectedOptions={options.filter((option) => field.value?.includes(option.value))}
          onChange={({ detail }) =>
            field.onChange(detail.selectedOptions.map((option) => option.value))
          }
          onBlur={field.onBlur}
        />
      )}
    </ControlledField>
  );
}

interface RadioProps<TValues extends FieldValues> extends FieldProps<TValues> {
  items: RadioGroupProps.RadioButtonDefinition[];
  onChange?: (value: string) => void; // việc làm thêm khi đổi lựa chọn (vd: đặt lại giá trị mặc định)
}

export function FormRadioGroup<TValues extends FieldValues>(props: RadioProps<TValues>) {
  const { items, onChange, ...fieldProps } = props;
  return (
    <ControlledField {...fieldProps}>
      {(field) => (
        <RadioGroup
          items={items}
          value={field.value}
          onChange={({ detail }) => {
            field.onChange(detail.value);
            onChange?.(detail.value);
          }}
        />
      )}
    </ControlledField>
  );
}

interface CheckboxProps<TValues extends FieldValues> extends FieldProps<TValues> {
  text: ReactNode; // chữ cạnh ô tick
}

export function FormCheckbox<TValues extends FieldValues>(props: CheckboxProps<TValues>) {
  // Mô tả đặt dưới chữ của ô tick (như Cloudscape), không đặt trên như FormField
  const { text, description, ...fieldProps } = props;
  return (
    <ControlledField {...fieldProps}>
      {(field) => (
        <Checkbox
          description={description}
          checked={Boolean(field.value)}
          onChange={({ detail }) => field.onChange(detail.checked)}
        >
          {text}
        </Checkbox>
      )}
    </ControlledField>
  );
}

interface SegmentedProps<TValues extends FieldValues> extends FieldProps<TValues> {
  options: SegmentedControlProps.Option[];
}

export function FormSegmentedControl<TValues extends FieldValues>(props: SegmentedProps<TValues>) {
  const { options, ...fieldProps } = props;
  return (
    <ControlledField {...fieldProps}>
      {(field) => (
        <SegmentedControl
          options={options}
          selectedId={field.value}
          onChange={({ detail }) => field.onChange(detail.selectedId)}
        />
      )}
    </ControlledField>
  );
}
