import type { ReactNode } from "react";
import { useWatch, type Control, type FieldValues, type Path } from "react-hook-form";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormCheckbox, FormSelect } from "@shared/components/form/FormFields.tsx";
import { GRANT_DESCRIPTION, GRANT_LABEL } from "@localconsole/core/apigateway";
import { useFunctions } from "../../lambda/hooks/useFunctions.ts";

const NO_FUNCTION = { value: "", label: "None" };

interface Props<TValues extends FieldValues> {
  control: Control<TValues, unknown, FieldValues>;
  functionName: Path<TValues>;
  grantName: Path<TValues>;
  label: string;
  description?: ReactNode;
  optional?: boolean; // thêm lựa chọn None
  currentArn?: string; // function đang gắn (khi sửa): quyền của nó đã có
}

// Chọn function (giá trị là ARN) và ô thêm quyền gọi; ô quyền chỉ hiện khi chọn function mới
export function LambdaFunctionFields<TValues extends FieldValues>(props: Props<TValues>) {
  const { control, functionName, grantName, label, description, optional, currentArn } = props;
  const functions = useFunctions();
  const selected = useWatch({ control, name: functionName });

  const options = (functions.data ?? []).flatMap(({ FunctionArn, FunctionName }) =>
    FunctionArn ? [{ value: FunctionArn, label: FunctionName ?? FunctionArn }] : [],
  );

  return (
    <SpaceBetween size='m'>
      <FormSelect
        control={control}
        name={functionName}
        label={label}
        description={description}
        placeholder='Choose a function'
        empty='No functions'
        options={optional ? [NO_FUNCTION, ...options] : options}
      />
      {selected && selected !== currentArn && (
        <FormCheckbox
          control={control}
          name={grantName}
          text={GRANT_LABEL}
          description={GRANT_DESCRIPTION}
        />
      )}
    </SpaceBetween>
  );
}
