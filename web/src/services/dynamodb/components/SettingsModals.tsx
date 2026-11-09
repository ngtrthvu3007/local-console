import { useWatch } from "react-hook-form";
import Alert from "@cloudscape-design/components/alert";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import type { StreamSpecification, TimeToLiveDescription } from "@aws-sdk/client-dynamodb";
import { FormCheckbox, FormInput, FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { pluralize } from "@shared/format.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useFunctions } from "../../lambda/hooks/useFunctions.ts";
import {
  DEFAULT_STARTING_POSITION,
  STARTING_POSITION_OPTIONS,
  STREAM_BATCH_SIZE,
} from "../../lambda/constants.ts";
import { FUNCTION_TABS, lambdaRoutes } from "../../lambda/routes.ts";
import {
  DEFAULT_STREAM_VIEW_TYPE,
  STREAM_VIEW_TYPES,
  TTL_STATUS_ENABLED,
  type StreamViewTypeId,
} from "../constants.ts";
import {
  useAddStreamTrigger,
  useUpdateStream,
  useUpdateTimeToLive,
} from "../hooks/useTableSettings.ts";
import { streamSchema, streamTriggerSchema, ttlSchema } from "../schemas.ts";

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

// Nút trong thông báo: mở tab Triggers của function vừa gắn
function ViewFunctionButton({ functionName }: { functionName: string }) {
  const follow = useFollow();
  return (
    <Button href={lambdaRoutes.function(functionName, FUNCTION_TABS.triggers)} onFollow={follow}>
      View function
    </Button>
  );
}

interface TriggerProps {
  table: string;
  streamArn: string;
  onDismiss: () => void;
}

export function StreamTriggerModal({ table, streamArn, onDismiss }: TriggerProps) {
  const functions = useFunctions();
  const addTrigger = useAddStreamTrigger(table, streamArn);
  const form = useZodForm(streamTriggerSchema, {
    functionName: "",
    startingPosition: DEFAULT_STARTING_POSITION,
    batchSize: String(STREAM_BATCH_SIZE.default),
    enabled: true,
  });
  const functionOptions = (functions.data ?? []).map((item) => ({
    value: item.FunctionName!,
    label: item.FunctionName!,
    description: item.Runtime,
  }));

  const submit = form.handleSubmit((values) =>
    addTrigger.mutate(
      values,
      notifyOutcome({
        success: `${values.functionName} now runs when items in ${table} change`,
        successAction: <ViewFunctionButton functionName={values.functionName} />,
        errorHeader: "Couldn't add the trigger",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header={`Add Lambda trigger to ${table}`}
      actionText='Add'
      loading={addTrigger.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormSelect
        control={form.control}
        name='functionName'
        label='Function'
        options={functionOptions}
      />
      <ColumnLayout columns={2}>
        <FormSelect
          control={form.control}
          name='startingPosition'
          label='Starting position'
          options={STARTING_POSITION_OPTIONS}
        />
        <FormInput
          control={form.control}
          name='batchSize'
          label='Batch size'
          constraintText={`${STREAM_BATCH_SIZE.min}–${STREAM_BATCH_SIZE.max} records per invocation.`}
        />
      </ColumnLayout>
      <FormCheckbox control={form.control} name='enabled' text='Enable trigger' />
    </FormModal>
  );
}
