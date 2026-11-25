import type { StreamDescriptionSummary } from "@aws-sdk/client-kinesis";
import { FormInput } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { FormValueEditor } from "@shared/components/ValueEditor.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { KIBIBYTE } from "@shared/constants.ts";
import { DEFAULT_MAX_RECORD_KIB } from "../constants.ts";
import { usePutRecord } from "../hooks/useStreams.ts";
import { putRecordSchema } from "../schemas.ts";

const DATA_EDITOR_HEIGHT_PX = 200;

interface Props {
  stream: StreamDescriptionSummary;
  onDismiss: () => void;
}

// Chỉ mount khi mở. Gửi xong vẫn giữ modal và nội dung để gửi tiếp, như Send message của SQS
export function PutRecordModal({ stream, onDismiss }: Props) {
  const name = stream.StreamName ?? "";
  const putRecord = usePutRecord(name);
  const maxBytes = (stream.MaxRecordSizeInKiB ?? DEFAULT_MAX_RECORD_KIB) * KIBIBYTE;
  const form = useZodForm(putRecordSchema(maxBytes), { partitionKey: "", data: "" });

  const submit = form.handleSubmit((values) =>
    putRecord.mutate(
      values,
      notifyOutcome({
        success: (result) =>
          `Record sent to ${result.ShardId} (sequence ${result.SequenceNumber}).`,
        errorHeader: `Couldn't put a record to ${name}`,
      }),
    ),
  );

  return (
    <FormModal
      header={`Put record to ${name}`}
      actionText='Put record'
      cancelText='Close'
      size='medium'
      loading={putRecord.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput
        control={form.control}
        name='partitionKey'
        label='Partition key'
        description='Records with the same partition key go to the same shard, in order.'
        placeholder='user-1'
        autoFocus
      />
      <FormValueEditor
        control={form.control}
        name='data'
        label='Data'
        description='Sent as UTF-8 text. JSON is shown on one line in the Data viewer.'
        height={DATA_EDITOR_HEIGHT_PX}
      />
    </FormModal>
  );
}
