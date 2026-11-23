import { useState } from "react";
import { useWatch } from "react-hook-form";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Checkbox from "@cloudscape-design/components/checkbox";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import {
  FormCheckbox,
  FormInput,
  FormSegmentedControl,
  FormSelect,
} from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { FormValueEditor } from "@shared/components/ValueEditor.tsx";
import { DELETE_PREVIEW_COUNT } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { reformatJson } from "@shared/json.ts";
import { notifyBulkOutcome, notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useFunctions } from "../../lambda/hooks/useFunctions.ts";
import { useQueues } from "../../sqs/hooks/useQueues.ts";
import {
  DEFAULT_FILTER_SCOPE,
  EDITOR_HEIGHT_PX,
  FILTER_SCOPES,
  HOST_FROM_CONTAINER,
  HTTP_PROTOCOLS,
  isLocalUrl,
  PROTOCOLS,
  RAW_DELIVERY_PROTOCOLS,
  type Protocol,
} from "../constants.ts";
import {
  filterPolicyAttributes,
  rawDeliveryAttributes,
  useCreateSubscription,
  useDeleteSubscriptions,
  useSetSubscriptionAttributes,
} from "../hooks/useSubscriptions.ts";
import { createSubscriptionSchema, filterPolicySchema } from "../schemas.ts";
import { protocolLabel, type Subscription, type Topic } from "../topics.ts";

// Các modal chỉ mount khi mở

const PROTOCOL_OPTIONS = Object.entries(PROTOCOLS).map(([value, label]) => ({ value, label }));
// Luật của AWS (Floci không chặn): topic FIFO chỉ giao tới SQS, topic standard không giao tới queue FIFO
const SQS_PROTOCOL: Protocol = "sqs";
const FIFO_TOPIC_SQS_ONLY = "FIFO topics deliver only to SQS queues";
const FIFO_QUEUE_NEEDS_FIFO_TOPIC = "Only FIFO topics can deliver to FIFO queues";
const SCOPE_OPTIONS = Object.entries(FILTER_SCOPES).map(([id, text]) => ({ id, text }));

const FILTER_POLICY_LABEL = 'Filter policy, e.g. {"type": ["order"]}';

const INITIAL_SUBSCRIPTION = {
  protocol: "sqs" as Protocol,
  queueArn: "",
  functionArn: "",
  url: "",
  rawDelivery: false,
  filterPolicy: "",
  filterScope: DEFAULT_FILTER_SCOPE,
};

export function CreateSubscriptionModal({
  topic,
  onDismiss,
}: {
  topic: Topic;
  onDismiss: () => void;
}) {
  const createSubscription = useCreateSubscription(topic.arn, topic.name);
  const queues = useQueues();
  const functions = useFunctions();
  const form = useZodForm(createSubscriptionSchema, INITIAL_SUBSCRIPTION);
  const protocol = useWatch({ control: form.control, name: "protocol" });
  const url = useWatch({ control: form.control, name: "url" });

  const protocolOptions = PROTOCOL_OPTIONS.map((option) => {
    const blocked = topic.fifo && option.value !== SQS_PROTOCOL;
    return { ...option, disabled: blocked, description: blocked ? FIFO_TOPIC_SQS_ONLY : undefined };
  });

  const queueOptions = (queues.data ?? []).map((queue) => {
    const blocked = queue.fifo && !topic.fifo;

    return {
      value: queue.arn,
      label: queue.name,
      disabled: blocked,
      description: blocked ? FIFO_QUEUE_NEEDS_FIFO_TOPIC : queue.arn,
    };
  });

  const functionOptions = (functions.data ?? []).map((item) => ({
    value: item.FunctionArn!,
    label: item.FunctionName,
    description: item.FunctionArn,
  }));

  const submit = form.handleSubmit((values) => {
    const endpoint = {
      sqs: values.queueArn,
      lambda: values.functionArn,
      http: values.url,
      https: values.url,
    }[values.protocol];

    createSubscription.mutate(
      { ...values, endpoint },
      notifyOutcome({
        success: `Subscribed ${protocolLabel(values.protocol)} to ${topic.name}`,
        errorHeader: "Couldn't create the subscription",
        then: onDismiss,
      }),
    );
  });

  return (
    <FormModal
      header={`Create subscription to ${topic.name}`}
      actionText='Create'
      size='large'
      loading={createSubscription.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormSelect
        control={form.control}
        name='protocol'
        label='Protocol'
        options={protocolOptions}
      />
      {protocol === "sqs" && (
        <FormSelect
          control={form.control}
          name='queueArn'
          label='Queue'
          description={
            topic.fifo ? "Order and deduplication apply only to FIFO queues." : undefined
          }
          placeholder='Choose a queue'
          empty='No queues'
          options={queueOptions}
        />
      )}
      {protocol === "lambda" && (
        <FormSelect
          control={form.control}
          name='functionArn'
          label='Function'
          placeholder='Choose a function'
          empty='No functions'
          options={functionOptions}
        />
      )}
      {HTTP_PROTOCOLS.includes(protocol) && (
        <>
          <FormInput
            control={form.control}
            name='url'
            label='URL'
            description={`For an app on your machine use ${protocol}://${HOST_FROM_CONTAINER}:<port>. localhost is Floci itself.`}
            placeholder={`${protocol}://${HOST_FROM_CONTAINER}:3000/sns`}
          />
          {isLocalUrl(url) && (
            <Alert type='warning'>
              From the Floci container, this URL points at Floci, not at your machine. Use{" "}
              {HOST_FROM_CONTAINER} instead.
            </Alert>
          )}
        </>
      )}
      {RAW_DELIVERY_PROTOCOLS.includes(protocol) && (
        <FormCheckbox
          control={form.control}
          name='rawDelivery'
          text='Raw message delivery'
          description='Send the body as is, without the SNS JSON envelope.'
        />
      )}
      <ExpandableSection headerText='Filter policy (optional)'>
        <SpaceBetween size='m'>
          <FormSegmentedControl
            control={form.control}
            name='filterScope'
            label='Filter scope'
            options={SCOPE_OPTIONS}
          />
          <FormValueEditor
            control={form.control}
            name='filterPolicy'
            label={FILTER_POLICY_LABEL}
            height={EDITOR_HEIGHT_PX}
          />
        </SpaceBetween>
      </ExpandableSection>
    </FormModal>
  );
}

export function EditFilterModal({
  subscription,
  topicName,
  onDismiss,
}: {
  subscription: Subscription;
  topicName: string;
  onDismiss: () => void;
}) {
  const setFilter = useSetSubscriptionAttributes(subscription, topicName);

  const form = useZodForm(filterPolicySchema, {
    filterPolicy: reformatJson(subscription.filterPolicy ?? ""),
    filterScope: subscription.filterScope,
  });

  const submit = form.handleSubmit((values) =>
    setFilter.mutate(
      filterPolicyAttributes(values),
      notifyOutcome({
        success: values.filterPolicy.trim()
          ? "Saved the filter policy"
          : "Removed the filter policy",
        errorHeader: "Couldn't save the filter policy",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Edit filter policy'
      actionText='Save'
      size='large'
      loading={setFilter.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <Box color='text-body-secondary'>Leave the policy empty to deliver every message.</Box>
      <FormSegmentedControl
        control={form.control}
        name='filterScope'
        label='Filter scope'
        options={SCOPE_OPTIONS}
      />
      <FormValueEditor
        control={form.control}
        name='filterPolicy'
        label={FILTER_POLICY_LABEL}
        height={EDITOR_HEIGHT_PX}
      />
    </FormModal>
  );
}

export function EditRawDeliveryModal({
  subscription,
  topicName,
  onDismiss,
}: {
  subscription: Subscription;
  topicName: string;
  onDismiss: () => void;
}) {
  const setRawDelivery = useSetSubscriptionAttributes(subscription, topicName);
  const [rawDelivery, setRaw] = useState(subscription.rawDelivery);

  return (
    <FormModal
      header='Edit raw message delivery'
      actionText='Save'
      loading={setRawDelivery.isPending}
      onSubmit={() =>
        setRawDelivery.mutate(
          rawDeliveryAttributes(rawDelivery),
          notifyOutcome({
            success: "Saved raw message delivery",
            errorHeader: "Couldn't save raw message delivery",
            then: onDismiss,
          }),
        )
      }
      onDismiss={onDismiss}
    >
      <Checkbox
        checked={rawDelivery}
        description='Send the body as is, without the SNS JSON envelope.'
        onChange={({ detail }) => setRaw(detail.checked)}
      >
        Raw message delivery
      </Checkbox>
    </FormModal>
  );
}

export function DeleteSubscriptionsModal({
  subscriptions,
  topicName,
  onDismiss,
  onDone,
}: {
  subscriptions: readonly Subscription[];
  topicName: string;
  onDismiss: () => void;
  onDone: () => void;
}) {
  const deleteSubscriptions = useDeleteSubscriptions(topicName);
  const hiddenCount = subscriptions.length - DELETE_PREVIEW_COUNT;

  const submit = () =>
    deleteSubscriptions.mutate(
      subscriptions,
      notifyBulkOutcome({
        success: (result) => `Deleted ${pluralize(result.count, "subscription")}`,
        errorHeader: "Couldn't delete",
        then: onDone,
      }),
    );

  return (
    <ConfirmModal
      visible
      header={`Delete ${pluralize(subscriptions.length, "subscription")}?`}
      confirmText={CONFIRM_DELETE}
      actionText='Delete'
      loading={deleteSubscriptions.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      <Box>
        {subscriptions.slice(0, DELETE_PREVIEW_COUNT).map((subscription) => (
          <div key={subscription.arn}>{subscription.endpoint}</div>
        ))}
        {hiddenCount > 0 && <Box color='text-body-secondary'>…and {hiddenCount} more</Box>}
      </Box>
    </ConfirmModal>
  );
}
