import { useWatch } from "react-hook-form";
import Alert from "@cloudscape-design/components/alert";
import type { StreamSpecification, TimeToLiveDescription } from "@aws-sdk/client-dynamodb";
import { FormCheckbox, FormInput, FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { pluralize } from "@shared/format.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  DEFAULT_STREAM_VIEW_TYPE,
  STREAM_VIEW_TYPES,
  TTL_STATUS_ENABLED,
  type StreamViewTypeId,
} from "../constants.ts";
import { useUpdateStream, useUpdateTimeToLive } from "../hooks/useTableSettings.ts";
import { streamSchema, ttlSchema } from "../schemas.ts";

const STREAM_VIEW_OPTIONS = Object.entries(STREAM_VIEW_TYPES).map(([value, label]) => ({
  value,
  label,
}));

// Các modal chỉ mount khi mở

interface TtlProps {
  table: string;
  current: TimeToLiveDescription;
  onDismiss: () => void;
}

export function TimeToLiveModal({ table, current, onDismiss }: TtlProps) {
  const updateTimeToLive = useUpdateTimeToLive(table);
  const form = useZodForm(ttlSchema, {
    enabled: current.TimeToLiveStatus === TTL_STATUS_ENABLED,
    attributeName: current.AttributeName ?? "",
  });
  const enabled = useWatch({ control: form.control, name: "enabled" });

  const submit = form.handleSubmit((values) =>
    updateTimeToLive.mutate(
      // Tắt TTL vẫn phải gửi tên attribute đang dùng
      {
        enabled: values.enabled,
        attributeName: values.attributeName || current.AttributeName || "",
      },
      notifyOutcome({
        success: values.enabled ? `Turned on TTL on ${values.attributeName}` : "Turned off TTL",
        errorHeader: "Couldn't change TTL",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Edit Time to Live (TTL)'
      actionText='Save'
      loading={updateTimeToLive.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormCheckbox control={form.control} name='enabled' text='Turn on TTL' />
      {enabled && (
        <FormInput
          control={form.control}
          name='attributeName'
          label='TTL attribute'
          description='A Number attribute holding the expiry time in Unix seconds, e.g. 1767225600.'
          placeholder='expiresAt'
        />
      )}
    </FormModal>
  );
}

interface StreamProps {
  table: string;
  current?: StreamSpecification;
  triggerCount: number;
  onDismiss: () => void;
}

export function StreamModal({ table, current, triggerCount, onDismiss }: StreamProps) {
  const updateStream = useUpdateStream(table);
  const currentlyEnabled = Boolean(current?.StreamEnabled);
  const form = useZodForm(streamSchema, {
    enabled: currentlyEnabled,
    viewType: (current?.StreamViewType as StreamViewTypeId | undefined) ?? DEFAULT_STREAM_VIEW_TYPE,
  });
  const [enabled, viewType] = useWatch({ control: form.control, name: ["enabled", "viewType"] });
  const turningOff = currentlyEnabled && !enabled;
  const changingType = currentlyEnabled && enabled && viewType !== current?.StreamViewType;

  const submit = form.handleSubmit((values) =>
    updateStream.mutate(
      { ...values, current },
      notifyOutcome({
        success: values.enabled ? "Stream is on" : "Stream is off",
        errorHeader: "Couldn't change the stream",
        then: onDismiss,
      }),
    ),
  );

  const triggersText = pluralize(triggerCount, "Lambda trigger");

  return (
    <FormModal
      header='Edit stream'
      actionText='Save'
      loading={updateStream.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormCheckbox
        control={form.control}
        name='enabled'
        text='Turn on stream'
        description='Item changes are sent to Lambda functions that read this stream.'
      />
      {enabled && (
        <FormSelect
          control={form.control}
          name='viewType'
          label='Data in each record'
          options={STREAM_VIEW_OPTIONS}
        />
      )}
      {turningOff && triggerCount > 0 && (
        <Alert type='warning'>Item changes stop reaching {triggersText}.</Alert>
      )}
      {changingType && (
        <Alert type='warning'>
          The stream is turned off and on again, so its ARN changes.
          {triggerCount > 0 && ` ${triggersText} on the old stream must be added again.`}
        </Alert>
      )}
    </FormModal>
  );
}
