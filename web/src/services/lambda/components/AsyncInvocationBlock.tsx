import { useState } from "react";
import { useWatch } from "react-hook-form";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { FormInput } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { DETAIL_SEPARATOR } from "@shared/constants.ts";
import { formatDuration } from "@shared/format.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { lastArnPart } from "@shared/arn.ts";
import { BusLink } from "../../eventbridge/components/BusLink.tsx";
import { DEFAULT_BUS_NAME } from "../../eventbridge/constants.ts";
import { eventbridgeRoutes } from "../../eventbridge/routes.ts";
import { busNameOfArn } from "../../eventbridge/targets.ts";
import { QueueLink } from "../../sqs/components/QueueLink.tsx";
import { TopicLink } from "../../sns/components/TopicLink.tsx";
import {
  destinationKindOf,
  fromInvokeConfig,
  type AsyncInvocationValues,
} from "../asyncInvocation.ts";
import {
  ASYNC_EVENT_AGE_SECONDS,
  ASYNC_RETRY_ATTEMPTS,
  DESTINATION_KINDS,
  type DestinationKind,
} from "../constants.ts";
import {
  useAsyncInvocation,
  usePutAsyncInvocation,
  useRemoveAsyncInvocation,
} from "../hooks/useAsyncInvocation.ts";
import { asyncInvocationSchema } from "../schemas.ts";
import { DestinationFields } from "./DestinationFields.tsx";
import { FunctionLink } from "./FunctionLink.tsx";

const ALL_KINDS = Object.keys(DESTINATION_KINDS) as DestinationKind[];
const BUS_HINT =
  'Lambda sends this event to the bus with source "lambda". Create a rule on the bus to catch it.';
const HINT =
  "Applies to asynchronous calls only (S3, SNS, EventBridge, or the Test tab in Asynchronous mode). Synchronous calls ignore it.";

// Link tới trang của đích; mỗi loại có component link riêng (tự báo "not found" khi đích bị xóa)
function DestinationValue({ arn }: { arn?: string }) {
  const kind = destinationKindOf(arn);
  if (!arn || kind === "none") return <>{DESTINATION_KINDS.none}</>;
  const link = {
    sqs: <QueueLink name={lastArnPart(arn)} />,
    sns: <TopicLink name={lastArnPart(arn)} />,
    lambda: <FunctionLink arn={arn} />,
    eventbus: <BusLink name={busNameOfArn(arn)} />,
  }[kind];
  return (
    <>
      {DESTINATION_KINDS[kind]}
      {DETAIL_SEPARATOR}
      {link}
    </>
  );
}

interface ModalProps {
  name: string;
  initial: AsyncInvocationValues;
  onDismiss: () => void;
}

// Chỉ mount khi mở
function AsyncInvocationModal({ name, initial, onDismiss }: ModalProps) {
  const put = usePutAsyncInvocation(name);
  const form = useZodForm(asyncInvocationSchema, initial);
  const follow = useFollow();
  const [successKind, successArn, failureKind, failureArn] = useWatch({
    control: form.control,
    name: ["onSuccessKind", "onSuccessArn", "onFailureKind", "onFailureArn"],
  });
  // Bus đang chọn ở đích nào là event bus; chưa chọn thì dẫn sang bus default
  const busArn =
    successKind === "eventbus" ? successArn : failureKind === "eventbus" ? failureArn : "";
  const usesBus = successKind === "eventbus" || failureKind === "eventbus";
  const submit = form.handleSubmit((values) =>
    put.mutate(
      values,
      notifyOutcome({
        success: `Updated asynchronous invocation of ${name}`,
        errorHeader: "Couldn't update asynchronous invocation",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      size='large'
      header='Edit asynchronous invocation'
      actionText='Save'
      loading={put.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <ColumnLayout columns={2}>
        <FormInput
          control={form.control}
          name='retryAttempts'
          label='Retry attempts'
          constraintText={`${ASYNC_RETRY_ATTEMPTS.min}–${ASYNC_RETRY_ATTEMPTS.max} retries after the first failed call.`}
        />
        <FormInput
          control={form.control}
          name='maxEventAge'
          label='Maximum event age (seconds)'
          constraintText={`${ASYNC_EVENT_AGE_SECONDS.min}–${ASYNC_EVENT_AGE_SECONDS.max} seconds.`}
        />
      </ColumnLayout>
      <DestinationFields
        control={form.control}
        kindName='onSuccessKind'
        arnName='onSuccessArn'
        label='On success'
        hint='Where the result goes when the function succeeds.'
        kinds={ALL_KINDS}
      />
      <DestinationFields
        control={form.control}
        kindName='onFailureKind'
        arnName='onFailureArn'
        label='On failure'
        hint='Where the event goes after the last retry fails or it is too old.'
        kinds={ALL_KINDS}
      />
      {usesBus && (
        <Alert type='info'>
          {BUS_HINT}{" "}
          <Link
            href={eventbridgeRoutes.createRule(busArn ? busNameOfArn(busArn) : DEFAULT_BUS_NAME)}
            onFollow={follow}
          >
            Create a rule
          </Link>
        </Alert>
      )}
    </FormModal>
  );
}

const MODALS = { edit: "edit", remove: "remove" } as const;
type ModalId = (typeof MODALS)[keyof typeof MODALS];

export function AsyncInvocationBlock({ name }: { name: string }) {
  const config = useAsyncInvocation(name);
  const remove = useRemoveAsyncInvocation(name);
  const [openModal, setOpenModal] = useState<ModalId | null>(null);
  const closeModal = () => setOpenModal(null);
  const current = config.data ?? undefined;
  const values = fromInvokeConfig(current);

  const header = (
    <Header
      variant='h2'
      actions={
        <SpaceBetween size='xs' direction='horizontal'>
          <Button disabled={!current} onClick={() => setOpenModal(MODALS.remove)}>
            Remove
          </Button>
          <Button disabled={config.isLoading} onClick={() => setOpenModal(MODALS.edit)}>
            Edit
          </Button>
        </SpaceBetween>
      }
    >
      Asynchronous invocation
    </Header>
  );

  return (
    <>
      <Container header={header}>
        <SpaceBetween size='s'>
          <KeyValuePairs
            columns={4}
            items={[
              { label: "Retry attempts", value: values.retryAttempts },
              { label: "Maximum event age", value: formatDuration(Number(values.maxEventAge)) },
              {
                label: "On success",
                value: (
                  <DestinationValue arn={current?.DestinationConfig?.OnSuccess?.Destination} />
                ),
              },
              {
                label: "On failure",
                value: (
                  <DestinationValue arn={current?.DestinationConfig?.OnFailure?.Destination} />
                ),
              },
            ]}
          />
          <Box color='text-body-secondary'>{HINT}</Box>
        </SpaceBetween>
      </Container>
      {openModal === MODALS.edit && (
        <AsyncInvocationModal name={name} initial={values} onDismiss={closeModal} />
      )}
      <ConfirmModal
        visible={openModal === MODALS.remove}
        header='Remove asynchronous invocation settings?'
        actionText='Remove'
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(
            undefined,
            notifyOutcome({
              success: `Removed asynchronous invocation settings of ${name}`,
              errorHeader: "Couldn't remove the settings",
              then: closeModal,
            }),
          )
        }
        onDismiss={closeModal}
      >
        <Box>The function goes back to AWS defaults: 2 retries, 6 hours, no destinations.</Box>
      </ConfirmModal>
    </>
  );
}
