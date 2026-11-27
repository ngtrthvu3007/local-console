import { useEffect, useRef, useState, type ReactNode } from "react";
import { useController, type Control, type FieldValues, type Path } from "react-hook-form";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { KEY_ARN_PREFIX, KEY_PENDING, kmsKeyIdSchema } from "@localconsole/core/kms";
import { useKeyOptions } from "../hooks/useKeys.ts";

const CUSTOM_VALUE = "custom";
// Nhãn chung: Lambda chỉ nhận ARN, service khác nhận cả key ID / alias; lỗi của schema nói rõ
const CUSTOM_OPTION = { value: CUSTOM_VALUE, label: "Enter a key manually" };
// Floci ghi nhận key nhưng vẫn dùng khi key tắt / xóa (spec KMS 7 #3)
const FLOCI_NOTE =
  "Floci records the key but doesn't stop using it when the key is disabled or deleted.";

interface Props<TValues extends FieldValues> {
  control: Control<TValues, unknown, FieldValues>;
  name: Path<TValues>;
  label: ReactNode;
  defaultLabel: string; // option đầu = key mặc định của service, giá trị ""
  description?: ReactNode;
}

// Ô chọn key KMS trong form của service khác: giá trị "" (mặc định) hoặc ARN key; vẫn cho nhập ARN tay.
// Lỗi lấy từ schema của field (kmsKeyIdSchema), hiện như các field khác của form
export function FormKeySelect<TValues extends FieldValues>(props: Props<TValues>) {
  const { control, name, label, defaultLabel, description = FLOCI_NOTE } = props;
  const options = useKeyOptions();
  const [typing, setTyping] = useState(false);
  const { field, fieldState } = useController({ control, name });
  const choices = [{ value: "", label: defaultLabel }, ...(options.data ?? []), CUSTOM_OPTION];

  // Ô bị ẩn (đổi sang lựa chọn không dùng KMS) mà còn ARN gõ dở: react-hook-form giữ giá trị của field
  // đã ẩn, form sẽ không gửi được và không hiện lỗi. Chỉ xóa giá trị sai: StrictMode gọi cleanup giả lúc
  // mount, xóa cả key hợp lệ thì form Edit mất key đang có
  const latest = useRef(field);
  latest.current = field;
  useEffect(
    () => () => {
      if (!kmsKeyIdSchema.safeParse(latest.current.value).success) latest.current.onChange("");
    },
    [],
  );

  const value = String(field.value ?? "");
  const known = choices.find((choice) => choice.value === value && choice !== CUSTOM_OPTION);
  // ARN tay (hoặc key không còn trong danh sách) thì hiện ô nhập
  const custom = typing || !known;

  return (
    <FormField label={label} description={description} errorText={fieldState.error?.message}>
      <SpaceBetween size='xs'>
        <Select
          ref={field.ref}
          filteringType='auto'
          statusType={options.isLoading ? "loading" : "finished"}
          options={choices}
          selectedOption={custom ? CUSTOM_OPTION : (known ?? null)}
          onChange={({ detail }) => {
            const picked = detail.selectedOption.value ?? "";
            setTyping(picked === CUSTOM_VALUE);
            field.onChange(picked === CUSTOM_VALUE ? KEY_PENDING : picked);
          }}
          onBlur={field.onBlur}
        />
        {custom && (
          <Input
            value={value === KEY_PENDING ? "" : value}
            placeholder={`${KEY_ARN_PREFIX}…:key/…`}
            invalid={Boolean(fieldState.error)}
            onChange={({ detail }) => field.onChange(detail.value || KEY_PENDING)}
            onBlur={field.onBlur}
          />
        )}
      </SpaceBetween>
    </FormField>
  );
}
