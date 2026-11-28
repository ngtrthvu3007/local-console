import Box from "@cloudscape-design/components/box";
import { FormInput, FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { FormValueEditor } from "@shared/components/ValueEditor.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  EDITOR_HEIGHT_PX,
  DEFAULT_BUS_NAME,
  DEFAULT_EVENT_DETAIL,
  DEFAULT_EVENT_SOURCE,
  DELIVERY_HINT,
  sendEventsSchema,
} from "@localconsole/core/eventbridge";
import { useBuses, usePutEvent } from "../hooks/useBuses.ts";

interface Props {
  bus?: string; // bus đang xem, mặc định chọn sẵn
  onDismiss: () => void;
}

// Chỉ mount khi mở. Gửi xong vẫn giữ modal và nội dung để gửi tiếp
export function SendEventsModal({ bus = DEFAULT_BUS_NAME, onDismiss }: Props) {
  const buses = useBuses();
  const putEvent = usePutEvent();
  const form = useZodForm(sendEventsSchema, {
    bus,
    source: DEFAULT_EVENT_SOURCE,
    detailType: "",
    detail: DEFAULT_EVENT_DETAIL,
  });

  const submit = form.handleSubmit((values) =>
    putEvent.mutate(
      values,
      notifyOutcome({
        success: (eventId) => `Sent event ${eventId}`,
        errorHeader: "Couldn't send the event",
      }),
    ),
  );

  // Event gửi tới bus không có thì Floci vẫn trả Event ID rồi bỏ event, nên chỉ cho chọn bus có thật
  const busOptions = (buses.data ?? []).map(({ name }) => ({ value: name, label: name }));

  return (
    <FormModal
      header='Send events'
      actionText='Send'
      cancelText='Close'
      loading={putEvent.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <Box color='text-body-secondary'>{DELIVERY_HINT}</Box>
      <FormSelect control={form.control} name='bus' label='Event bus' options={busOptions} />
      <FormInput
        control={form.control}
        name='source'
        label='Source'
        placeholder={DEFAULT_EVENT_SOURCE}
      />
      <FormInput
        control={form.control}
        name='detailType'
        label='Detail type'
        placeholder='OrderCreated'
      />
      <FormValueEditor
        control={form.control}
        name='detail'
        label='Detail'
        height={EDITOR_HEIGHT_PX}
      />
    </FormModal>
  );
}
