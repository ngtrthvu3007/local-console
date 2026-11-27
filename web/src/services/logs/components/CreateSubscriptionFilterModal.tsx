import { useWatch } from "react-hook-form";
import { FormInput, FormRadioGroup, FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useStreams } from "../../kinesis/hooks/useStreams.ts";
import { useFunctions } from "../../lambda/hooks/useFunctions.ts";
import {
  DESTINATION_TYPES,
  STREAM_NAME_RULE,
  TEXT,
  subscriptionFilterSchema,
} from "@localconsole/core/logs";
import { usePutSubscriptionFilter } from "../hooks/useSubscriptionFilters.ts";

const TYPE_ITEMS = Object.entries(DESTINATION_TYPES).map(([value, label]) => ({ value, label }));
const DESCRIPTIONS = { lambda: TEXT.lambdaDestination, kinesis: TEXT.kinesisDestination };

// Chỉ mount khi mở
export function CreateSubscriptionFilterModal({
  group,
  onDismiss,
}: {
  group: string;
  onDismiss: () => void;
}) {
  const putFilter = usePutSubscriptionFilter(group);
  const form = useZodForm(subscriptionFilterSchema, {
    name: "",
    filterPattern: "",
    destinationType: "lambda",
    destinationArn: "",
  });
  const destinationType = useWatch({ control: form.control, name: "destinationType" });
  // Form giữ giá trị dạng chuỗi: thu về đúng hai loại đích để tra nhãn / mô tả
  const kind = destinationType === "kinesis" ? "kinesis" : "lambda";
  const functions = useFunctions();
  const streams = useStreams();

  const options =
    kind === "lambda"
      ? (functions.data ?? []).flatMap(({ FunctionArn, FunctionName }) =>
          FunctionArn ? [{ value: FunctionArn, label: FunctionName ?? FunctionArn }] : [],
        )
      : (streams.data ?? []).map(({ arn, name }) => ({ value: arn, label: name }));

  const submit = form.handleSubmit((values) =>
    putFilter.mutate(
      values,
      notifyOutcome({
        success: `Created subscription filter ${values.name}`,
        errorHeader: `Couldn't create ${values.name}`,
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Create subscription filter'
      actionText='Create'
      loading={putFilter.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput
        control={form.control}
        name='name'
        label='Name'
        constraintText={STREAM_NAME_RULE}
        placeholder='errors-to-alert'
        autoFocus
      />
      <FormInput
        control={form.control}
        name='filterPattern'
        label='Filter pattern - optional'
        constraintText='Empty sends every event.'
        placeholder={TEXT.filterPlaceholder}
      />
      <FormRadioGroup
        control={form.control}
        name='destinationType'
        label='Destination type'
        items={TYPE_ITEMS}
        // Đổi loại đích thì đích cũ không còn hợp lệ
        onChange={() => form.setValue("destinationArn", "")}
      />
      <FormSelect
        control={form.control}
        name='destinationArn'
        label={DESTINATION_TYPES[kind]}
        description={DESCRIPTIONS[kind]}
        placeholder='Choose a destination'
        empty={kind === "lambda" ? "No functions" : "No streams"}
        options={options}
      />
    </FormModal>
  );
}
