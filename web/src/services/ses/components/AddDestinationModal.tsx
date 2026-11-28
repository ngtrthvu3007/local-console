import { useEffect } from "react";
import { useWatch } from "react-hook-form";
import Link from "@cloudscape-design/components/link";
import {
  FormCheckbox,
  FormInput,
  FormMultiselect,
  FormSelect,
  FormTiles,
} from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useBuses } from "../../eventbridge/hooks/useBuses.ts";
import { DEFAULT_BUS_NAME, eventbridgeRoutes } from "@localconsole/core/eventbridge";
import { useTopics } from "../../sns/hooks/useTopics.ts";
import { snsRoutes } from "@localconsole/core/sns";
import {
  ADD_DESTINATION_DEFAULTS,
  DESTINATION_KIND_LABELS,
  EVENT_TYPE_LABELS,
  addDestinationSchema,
} from "@localconsole/core/ses";
import { useAddDestination } from "../hooks/useConfigurationSets.ts";

const EVENT_TYPE_OPTIONS = Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));
const KIND_ITEMS = Object.entries(DESTINATION_KIND_LABELS).map(([value, label]) => ({
  value,
  label,
}));

interface Props {
  set: string;
  onDismiss: () => void;
}

// Chỉ mount khi mở
export function AddDestinationModal({ set, onDismiss }: Props) {
  const follow = useFollow();
  const add = useAddDestination();
  const topics = useTopics();
  const buses = useBuses();
  const form = useZodForm(addDestinationSchema, {
    ...ADD_DESTINATION_DEFAULTS,
    name: "",
    eventTypes: [],
    arn: "",
  });
  const kind = useWatch({ control: form.control, name: "kind" });
  // Đổi loại đích thì bỏ resource đã chọn: ARN của loại kia không dùng được
  useEffect(() => form.setValue("arn", ""), [kind, form]);

  const options =
    kind === "sns"
      ? (topics.data ?? []).map((topic) => ({ value: topic.arn, label: topic.name }))
      : // SES (và Floci) chỉ nhận bus default làm đích
        (buses.data ?? [])
          .filter((bus) => bus.name === DEFAULT_BUS_NAME)
          .map((bus) => ({ value: bus.arn, label: bus.name }));
  const createHref = kind === "sns" ? snsRoutes.createTopic : eventbridgeRoutes.buses;
  const createText = kind === "sns" ? "Create a topic" : "Create an event bus";

  const submit = form.handleSubmit((values) =>
    add.mutate(
      {
        set,
        name: values.name,
        input: {
          kind: values.kind,
          arn: values.arn,
          eventTypes: values.eventTypes,
          enabled: values.enabled,
        },
      },
      notifyOutcome({
        success: `Added destination ${values.name}`,
        errorHeader: "Couldn't add the destination",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header={`Add event destination to ${set}`}
      actionText='Add destination'
      loading={add.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput control={form.control} name='name' label='Destination name' autoFocus />
      <FormMultiselect
        control={form.control}
        name='eventTypes'
        label='Event types'
        placeholder='Choose event types'
        description='Reject and delivery delay events are not emitted locally.'
        options={EVENT_TYPE_OPTIONS}
      />
      <FormTiles control={form.control} name='kind' label='Send events to' items={KIND_ITEMS} />
      <FormSelect
        control={form.control}
        name='arn'
        label={DESTINATION_KIND_LABELS[kind]}
        placeholder='Choose a resource'
        empty={
          <Link href={createHref} onFollow={follow}>
            {createText}
          </Link>
        }
        options={options}
      />
      <FormCheckbox control={form.control} name='enabled' text='Enable destination' />
    </FormModal>
  );
}
