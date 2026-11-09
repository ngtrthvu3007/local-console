import { useEffect } from "react";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import { DEFAULT_EXCHANGE, type PeekedMessage } from "@server/routes/rabbitmq/contract.ts";
import { FormCheckbox, FormInput, FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { ErrorState } from "@shared/components/TableStates.tsx";
import { FormValueEditor } from "@shared/components/ValueEditor.tsx";
import { pluralize } from "@shared/format.ts";
import { prettyJson } from "@shared/json.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { DEFAULT_EXCHANGE_LABEL, PAYLOAD_EDITOR_HEIGHT_PX, PEEK_COUNT } from "../constants.ts";
import { useCreateQueue, useExchanges, usePeek, usePublish } from "../hooks/useRabbit.ts";
import { createQueueSchema, peekSchema, publishSchema } from "../schemas.ts";

export const exchangeLabel = (name: string) => name || DEFAULT_EXCHANGE_LABEL;

interface BrokerProps {
  broker: string;
  authorization: string;
  onDismiss: () => void;
}

// Chỉ mount khi mở
export function CreateQueueModal({ broker, authorization, onDismiss }: BrokerProps) {
  const createQueue = useCreateQueue(broker, authorization);
  const form = useZodForm(createQueueSchema, { name: "", durable: true });
  const submit = form.handleSubmit((values) =>
    createQueue.mutate(
      values,
      notifyOutcome({
        success: `Created queue ${values.name}`,
        errorHeader: `Couldn't create ${values.name}`,
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Create queue'
      actionText='Create queue'
      loading={createQueue.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput control={form.control} name='name' label='Name' placeholder='orders' autoFocus />
      <FormCheckbox
        control={form.control}
        name='durable'
        text='Durable'
        description='Keeps the queue when the broker restarts.'
      />
    </FormModal>
  );
}

// Chỉ mount khi mở. Mở từ một queue thì gửi thẳng vào queue đó qua exchange mặc định
export function PublishModal({
  broker,
  authorization,
  queue,
  onDismiss,
}: BrokerProps & { queue?: string }) {
  const publish = usePublish(broker, authorization);
  const exchanges = useExchanges(broker, authorization);
  const form = useZodForm(publishSchema, {
    exchange: DEFAULT_EXCHANGE,
    routingKey: queue ?? "",
    payload: "",
  });
  const options = (exchanges.data ?? []).map((exchange) => ({
    value: exchange.name || DEFAULT_EXCHANGE,
    label: exchangeLabel(exchange.name),
    description: exchange.type,
  }));

  const submit = form.handleSubmit((values) =>
    publish.mutate(
      values,
      notifyOutcome({
        // RabbitMQ vẫn nhận message dù không vào queue nào: báo rõ để dev kiểm tra routing key
        success: (result) =>
          result.routed
            ? "Published message"
            : "Message published but not routed to any queue. Check the routing key.",
        errorHeader: "Couldn't publish",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Publish message'
      actionText='Publish'
      size='medium'
      loading={publish.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormSelect control={form.control} name='exchange' label='Exchange' options={options} />
      <FormInput
        control={form.control}
        name='routingKey'
        label='Routing key'
        constraintText='With the default exchange, the routing key is the queue name.'
      />
      <FormValueEditor
        control={form.control}
        name='payload'
        label='Payload'
        height={PAYLOAD_EDITOR_HEIGHT_PX}
      />
    </FormModal>
  );
}

// Payload JSON thì format để dễ đọc (chỉ xem, không lưu lại nên không đổi dữ liệu)
function payloadText(message: PeekedMessage) {
  try {
    return prettyJson(JSON.parse(message.payload));
  } catch {
    return message.payload;
  }
}

const preStyle = { whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0 } as const;

function MessageCard({ message, position }: { message: PeekedMessage; position: number }) {
  return (
    <Container
      header={
        <Header
          variant='h3'
          description={[
            `Routing key ${message.routingKey || "—"}`,
            `exchange ${exchangeLabel(message.exchange)}`,
            message.redelivered ? "redelivered" : undefined,
          ]
            .filter(Boolean)
            .join(" · ")}
        >
          Message {position}
        </Header>
      }
    >
      <ColumnLayout columns={1}>
        <Box variant='code'>
          <pre style={preStyle}>{payloadText(message)}</pre>
        </Box>
        {Object.keys(message.properties).length > 0 && (
          <KeyValuePairs
            items={Object.entries(message.properties).map(([label, value]) => ({
              label,
              value: typeof value === "string" ? value : JSON.stringify(value),
            }))}
          />
        )}
      </ColumnLayout>
    </Container>
  );
}

// Chỉ mount khi mở. Xem trước: lấy rồi trả lại queue, message không mất
export function PeekModal({
  broker,
  authorization,
  queue,
  onDismiss,
}: BrokerProps & { queue: string }) {
  const peek = usePeek(broker, authorization);
  const form = useZodForm(peekSchema, { count: String(PEEK_COUNT.default) });
  const run = form.handleSubmit(({ count }) => peek.mutate({ queue, count }));
  // Mở modal là xem ngay với số mặc định
  const runOnOpen = peek.mutate;
  useEffect(() => runOnOpen({ queue, count: PEEK_COUNT.default }), [runOnOpen, queue]);

  const messages = peek.data ?? [];
  return (
    <FormModal
      header={`Messages in ${queue}`}
      actionText='Peek again'
      cancelText='Close'
      size='large'
      loading={peek.isPending}
      onSubmit={run}
      onDismiss={onDismiss}
    >
      <FormInput
        control={form.control}
        name='count'
        label='Number of messages'
        constraintText={`${PEEK_COUNT.min}–${PEEK_COUNT.max}. Messages stay in the queue and are marked redelivered.`}
      />
      {peek.isPending && <Spinner />}
      {peek.isError && <ErrorState error={peek.error} onRetry={() => run()} />}
      {peek.isSuccess && messages.length === 0 && <Alert type='info'>The queue is empty.</Alert>}
      {messages.length > 0 && (
        <SpaceBetween size='s'>
          <Box color='text-body-secondary'>Showing {pluralize(messages.length, "message")}</Box>
          {messages.map((message, position) => (
            <MessageCard key={position} message={message} position={position + 1} />
          ))}
        </SpaceBetween>
      )}
    </FormModal>
  );
}
