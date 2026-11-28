import type { Control, FieldValues, Path } from "react-hook-form";
import { useWatch } from "react-hook-form";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import { FormSelect } from "@shared/components/form/FormFields.tsx";
import { useBuses } from "../../eventbridge/hooks/useBuses.ts";
import { useTopics } from "../../sns/hooks/useTopics.ts";
import { useQueues } from "../../sqs/hooks/useQueues.ts";
import { DESTINATION_KINDS, type DestinationKind } from "../constants.ts";
import { useFunctions } from "../hooks/useFunctions.ts";

interface Props<TValues extends FieldValues> {
  control: Control<TValues, unknown, FieldValues>;
  kindName: Path<TValues>;
  arnName: Path<TValues>;
  label: string;
  hint: string; // hiện dưới ô, xem ghi chú ở constraintText
  // Loại đích cho chọn: stream chỉ SQS / SNS, async thêm Lambda và event bus
  kinds: readonly DestinationKind[];
}

// Cặp ô "loại đích" + "resource" dùng cho On failure / On success
export function DestinationFields<TValues extends FieldValues>({
  control,
  kindName,
  arnName,
  label,
  hint,
  kinds,
}: Props<TValues>) {
  const kind = useWatch({ control, name: kindName }) as DestinationKind;
  const queues = useQueues();
  const topics = useTopics();
  const functions = useFunctions();
  const buses = useBuses();

  // Chỉ dựng danh sách của loại đang chọn
  const resourceOptions = () => {
    switch (kind) {
      case "sqs":
        return (queues.data ?? []).map((queue) => ({ value: queue.arn, label: queue.name }));
      case "sns":
        return (topics.data ?? []).map((topic) => ({ value: topic.arn, label: topic.name }));
      case "lambda":
        return (functions.data ?? []).map((fn) => ({
          value: fn.FunctionArn ?? "",
          label: fn.FunctionName ?? "",
        }));
      case "eventbus":
        return (buses.data ?? []).map((bus) => ({ value: bus.arn, label: bus.name }));
      default:
        return [];
    }
  };

  return (
    <ColumnLayout columns={2}>
      <FormSelect
        control={control}
        name={kindName}
        label={label}
        // constraintText thay description để 2 ô chọn cạnh nhau thẳng hàng
        constraintText={hint}
        options={kinds.map((value) => ({ value, label: DESTINATION_KINDS[value] }))}
      />
      {kind !== "none" && (
        <FormSelect
          control={control}
          name={arnName}
          label={DESTINATION_KINDS[kind]}
          placeholder='Choose a resource'
          empty={`No ${DESTINATION_KINDS[kind].toLowerCase()}s`}
          options={resourceOptions()}
        />
      )}
    </ColumnLayout>
  );
}
