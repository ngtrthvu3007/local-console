import {
  useFieldArray,
  type ArrayPath,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from "react-hook-form";
import Alert from "@cloudscape-design/components/alert";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import FormField from "@cloudscape-design/components/form-field";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormCheckbox, FormInput } from "@shared/components/form/FormFields.tsx";
import { DestinationFields } from "./DestinationFields.tsx";
import { FormValueEditor } from "@shared/components/ValueEditor.tsx";
import {
  FILTER_PATTERN_LIMIT,
  ON_FAILURE_KIND_IDS,
  STREAM_RECORD_AGE_SECONDS,
  STREAM_RETRY_ATTEMPTS,
  type MappingOptions,
  type MappingSource,
} from "@localconsole/core/lambda";

const PATTERN_EDITOR_HEIGHT_PX = 120;
// Pattern lọc theo khóa gốc của từng nguồn (luật AWS): SQS là body, DynamoDB Stream là dynamodb
// (giá trị kèm kiểu S / N…), Kinesis là data đã giải mã
const FILTER_EXAMPLES: Record<MappingSource, string> = {
  sqs: '{"body": {"type": ["order"]}}',
  dynamodb: '{"dynamodb": {"NewImage": {"type": {"S": ["order"]}}}}',
  kinesis: '{"data": {"type": ["order"]}}',
};
const filterHint = (source: MappingSource) =>
  `Run the function only for matching ${source === "sqs" ? "messages" : "records"}, e.g. ${FILTER_EXAMPLES[source]}. One match is enough.`;
const SQS_FILTER_WARNING =
  "Messages that don't match any pattern are deleted from the queue without running the function.";
const PARTIAL_BATCH_HINT =
  "Return { batchItemFailures: [{ itemIdentifier: messageId }] } and only those messages go back to the queue.";
// Mỗi pattern là một ô JSON; bắt đầu bằng object rỗng cho dễ sửa
const NEW_PATTERN = { pattern: "{}" };

interface Props<TValues extends FieldValues> {
  // Form của modal có các ô của MappingOptions; kiểu của từng form khác nhau nên khai báo theo TValues
  form: UseFormReturn<TValues, unknown, FieldValues>;
  source: MappingSource;
}

// Tên ô theo MappingOptions; ép về Path<TValues> một chỗ này thay vì ở từng nơi dùng
const field = <TValues extends FieldValues>(
  name: keyof MappingOptions | `filterPatterns.${number}.pattern`,
) => name as Path<TValues>;

// Cụm ô dùng chung cho modal Add trigger của Lambda, của queue SQS, của bảng DynamoDB và modal Edit
export function MappingOptionsFields<TValues extends FieldValues>({
  form,
  source,
}: Props<TValues>) {
  const { control } = form;
  const patterns = useFieldArray({
    control,
    name: field<TValues>("filterPatterns") as ArrayPath<TValues>,
  });
  return (
    <SpaceBetween size='m'>
      <FormField label='Filter patterns - optional' description={filterHint(source)} stretch>
        <SpaceBetween size='s'>
          {patterns.fields.map((entry, index) => (
            <SpaceBetween key={entry.id} size='xs'>
              <FormValueEditor
                control={control}
                name={field<TValues>(`filterPatterns.${index}.pattern`)}
                label={`Pattern ${index + 1}`}
                height={PATTERN_EDITOR_HEIGHT_PX}
              />
              <Button formAction='none' onClick={() => patterns.remove(index)}>
                Remove pattern {index + 1}
              </Button>
            </SpaceBetween>
          ))}
          {patterns.fields.length < FILTER_PATTERN_LIMIT && (
            <Button
              formAction='none'
              iconName='add-plus'
              onClick={() => patterns.append(NEW_PATTERN as never)}
            >
              Add pattern
            </Button>
          )}
        </SpaceBetween>
      </FormField>
      {source === "sqs" ? (
        <SpaceBetween size='s'>
          {patterns.fields.length > 0 && <Alert type='warning'>{SQS_FILTER_WARNING}</Alert>}
          <FormCheckbox
            control={control}
            name={field<TValues>("reportBatchFailures")}
            text='Report batch item failures'
            description={PARTIAL_BATCH_HINT}
          />
        </SpaceBetween>
      ) : (
        <SpaceBetween size='m'>
          <ColumnLayout columns={2}>
            <FormInput
              control={control}
              name={field<TValues>("retryAttempts")}
              label='Retry attempts'
              constraintText={`Use ${STREAM_RETRY_ATTEMPTS.min} to retry forever, or up to ${STREAM_RETRY_ATTEMPTS.max}.`}
            />
            <FormInput
              control={control}
              name={field<TValues>("maxRecordAge")}
              label='Maximum record age (seconds)'
              constraintText={`${STREAM_RECORD_AGE_SECONDS.forever}, or ${STREAM_RECORD_AGE_SECONDS.min}–${STREAM_RECORD_AGE_SECONDS.max}.`}
            />
          </ColumnLayout>
          <DestinationFields
            control={control}
            kindName={field<TValues>("onFailureKind")}
            arnName={field<TValues>("onFailureArn")}
            label='On failure'
            hint='Where records that still fail are sent.'
            kinds={ON_FAILURE_KIND_IDS}
          />
        </SpaceBetween>
      )}
    </SpaceBetween>
  );
}
