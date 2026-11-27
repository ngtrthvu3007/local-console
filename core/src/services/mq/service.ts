import type { MqClient } from "@aws-sdk/client-mq";
import {
  createBroker,
  deleteBrokers,
  getBroker,
  listBrokers,
  rebootBroker,
  type BrokerRef,
  type CreateBrokerInput,
} from "./operations/brokers.ts";

// Chỉ phần AWS (broker). Dữ liệu RabbitMQ đi qua API của console server (server/src/routes/rabbitmq)
export function createMqService(mq: MqClient) {
  return {
    listBrokers: () => listBrokers(mq),
    getBroker: (broker: string) => getBroker(mq, broker),
    createBroker: (input: CreateBrokerInput) => createBroker(mq, input),
    deleteBrokers: (brokers: readonly BrokerRef[]) => deleteBrokers(mq, brokers),
    rebootBroker: (broker: string) => rebootBroker(mq, broker),
  };
}

export type MqService = ReturnType<typeof createMqService>;
