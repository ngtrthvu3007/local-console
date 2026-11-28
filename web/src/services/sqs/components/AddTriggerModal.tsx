import { FormCheckbox, FormInput, FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useFunctions } from "../../lambda/hooks/useFunctions.ts";
import {
  ALREADY_TRIGGERED,
  SQS_BATCH_SIZE,
  functionNameOfMapping,
  DEFAULT_MAPPING_OPTIONS,
} from "@localconsole/core/lambda";
import { MappingOptionsFields } from "../../lambda/components/MappingOptionsFields.tsx";
import { ViewFunctionButton } from "../../lambda/components/StreamTriggers.tsx";
import { useAddQueueTrigger, useQueueTriggers } from "../hooks/useQueueTriggers.ts";
import { type Queue, queueTriggerSchema } from "@localconsole/core/sqs";

// Chỉ mount khi mở. Cùng giới hạn và mặc định với modal Add trigger của Lambda
export function AddTriggerModal({ queue, onDismiss }: { queue: Queue; onDismiss: () => void }) {
  const functions = useFunctions();
  const addTrigger = useAddQueueTrigger(queue);
  const triggers = useQueueTriggers(queue);
  const form = useZodForm(queueTriggerSchema, {
    functionName: "",
    batchSize: String(SQS_BATCH_SIZE.default),
    enabled: true,
    ...DEFAULT_MAPPING_OPTIONS,
  });
  // AWS từ chối trigger thứ hai cho cùng queue và function (Floci thì nhận, thành hai consumer)
  const linked = new Set((triggers.data ?? []).map(functionNameOfMapping));
  const functionOptions = (functions.data ?? []).map((item) => ({
    value: item.FunctionName!,
    label: item.FunctionName!,
    disabled: linked.has(item.FunctionName!),
    description: linked.has(item.FunctionName!) ? ALREADY_TRIGGERED : item.Runtime,
  }));

  const submit = form.handleSubmit((values) =>
    addTrigger.mutate(
      values,
      notifyOutcome({
        success: `${values.functionName} now runs when messages arrive in ${queue.name}`,
        successAction: <ViewFunctionButton functionName={values.functionName} />,
        errorHeader: "Couldn't add the trigger",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header={`Add Lambda trigger to ${queue.name}`}
      actionText='Add'
      loading={addTrigger.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormSelect
        control={form.control}
        name='functionName'
        label='Function'
        placeholder='Choose a function'
        empty='No functions'
        options={functionOptions}
      />
      <FormInput
        control={form.control}
        name='batchSize'
        label='Batch size'
        constraintText={`${SQS_BATCH_SIZE.min}–${SQS_BATCH_SIZE.max} messages per invocation.`}
      />
      <MappingOptionsFields form={form} source='sqs' />
      <FormCheckbox control={form.control} name='enabled' text='Enable trigger' />
    </FormModal>
  );
}
