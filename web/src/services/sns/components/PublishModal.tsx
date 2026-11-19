import { useFieldArray } from "react-hook-form";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import FormField from "@cloudscape-design/components/form-field";
import Grid from "@cloudscape-design/components/grid";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormInput, FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { FormValueEditor } from "@shared/components/ValueEditor.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { ATTRIBUTE_DATA_TYPES, EDITOR_HEIGHT_PX, MAX_MESSAGE_ATTRIBUTES } from "../constants.ts";
import { usePublish } from "../hooks/useTopics.ts";
import { publishSchema } from "../schemas.ts";
import type { Topic } from "../topics.ts";

const TYPE_OPTIONS = ATTRIBUTE_DATA_TYPES.map((type) => ({ value: type, label: type }));
// Một hàng attribute: name, type, value, nút xóa (tổng 12 cột của Grid).
// Khung hẹp: name một hàng riêng, type + value + nút xóa ở hàng dưới để ô type không bị cắt chữ
const ATTRIBUTE_ROW_COLUMNS = [
  { colspan: { default: 12, xs: 4 } },
  { colspan: { default: 5, xs: 3 } },
  { colspan: { default: 5, xs: 4 } },
  { colspan: { default: 2, xs: 1 } },
];

// SNS không báo message đi tới subscription nào
const DELIVERY_HINT =
  "To check delivery, peek the subscribed queues or open the function's Monitor tab.";

// Chỉ mount khi mở. Publish xong vẫn giữ modal và nội dung để gửi tiếp
export function PublishModal({ topic, onDismiss }: { topic: Topic; onDismiss: () => void }) {
  const publish = usePublish(topic);
  const form = useZodForm(publishSchema(topic), {
    subject: "",
    body: "",
    attributes: [],
    groupId: "",
    dedupId: "",
  });
  const attributes = useFieldArray({ control: form.control, name: "attributes" });

  const submit = form.handleSubmit((values) =>
    publish.mutate(
      values,
      notifyOutcome({
        success: (result) => `Published message ${result.MessageId}`,
        errorHeader: `Couldn't publish to ${topic.name}`,
      }),
    ),
  );

  const dedupDescription = topic.contentBasedDedup
    ? "Optional. Leave empty to use a hash of the body."
    : "Required. Messages with the same ID within 5 minutes are dropped.";

  return (
    <FormModal
      header={`Publish message to ${topic.name}`}
      actionText='Publish'
      cancelText='Close'
      size='large'
      loading={publish.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <Box color='text-body-secondary'>{DELIVERY_HINT}</Box>
      <FormInput control={form.control} name='subject' label='Subject' description='Optional.' />
      <FormValueEditor control={form.control} name='body' label='Body' height={EDITOR_HEIGHT_PX} />
      {topic.fifo && (
        <ColumnLayout columns={2}>
          <FormInput
            control={form.control}
            name='groupId'
            label='Message group ID'
            description='Messages in the same group are delivered in order.'
            placeholder='order-42'
          />
          <FormInput
            control={form.control}
            name='dedupId'
            label='Deduplication ID'
            description={dedupDescription}
          />
        </ColumnLayout>
      )}
      <FormField
        stretch
        label='Message attributes'
        description={`Subscription filter policies match on these. Up to ${MAX_MESSAGE_ATTRIBUTES}.`}
      >
        <SpaceBetween size='s'>
          {attributes.fields.map((field, index) => (
            <Grid key={field.id} gridDefinition={ATTRIBUTE_ROW_COLUMNS}>
              <FormInput
                control={form.control}
                name={`attributes.${index}.name`}
                placeholder='type'
              />
              <FormSelect
                control={form.control}
                name={`attributes.${index}.type`}
                options={TYPE_OPTIONS}
              />
              <FormInput
                control={form.control}
                name={`attributes.${index}.value`}
                placeholder='order'
              />
              <Button
                iconName='close'
                variant='icon'
                ariaLabel={`Remove attribute ${index + 1}`}
                formAction='none'
                onClick={() => attributes.remove(index)}
              />
            </Grid>
          ))}
          <Button
            iconName='add-plus'
            formAction='none'
            disabled={attributes.fields.length >= MAX_MESSAGE_ATTRIBUTES}
            onClick={() => attributes.append({ name: "", type: "String", value: "" })}
          >
            Add attribute
          </Button>
        </SpaceBetween>
      </FormField>
    </FormModal>
  );
}
