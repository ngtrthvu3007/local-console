import { FormInput } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { SQS_BATCH_SIZE, STREAM_BATCH_SIZE } from "../constants.ts";
import type { TriggerRow } from "../hooks/useTriggers.ts";
import { fromMapping, pickMappingOptions, type MappingOptions } from "../mappingOptions.ts";
import { editTriggerSchema } from "../schemas.ts";
import { MappingOptionsFields } from "./MappingOptionsFields.tsx";

interface Props {
  row: TriggerRow; // trigger SQS hoặc DynamoDB, có `mapping`
  saving: boolean;
  onSave: (values: { batchSize: number; options: MappingOptions }) => void;
  onDismiss: () => void;
}

// Chỉ mount khi mở. Không đổi được nguồn (queue / bảng) hay starting position: AWS không cho
export function EditTriggerModal({ row, saving, onSave, onDismiss }: Props) {
  const source = row.source === "sqs" ? "sqs" : "dynamodb";
  const limits = source === "sqs" ? SQS_BATCH_SIZE : STREAM_BATCH_SIZE;
  const form = useZodForm(editTriggerSchema(source), {
    batchSize: String(row.mapping?.BatchSize ?? limits.default),
    ...fromMapping(row.mapping ?? {}),
  });

  return (
    <FormModal
      size='large'
      header={`Edit trigger for ${row.resource}`}
      actionText='Save'
      loading={saving}
      onSubmit={form.handleSubmit((values) =>
        onSave({ batchSize: values.batchSize, options: pickMappingOptions(values) }),
      )}
      onDismiss={onDismiss}
    >
      <FormInput
        control={form.control}
        name='batchSize'
        label='Batch size'
        constraintText={`${limits.min}–${limits.max} per invocation.`}
      />
      <MappingOptionsFields form={form} source={source} />
    </FormModal>
  );
}
