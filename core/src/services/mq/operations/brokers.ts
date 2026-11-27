import {
  CreateBrokerCommand,
  DeleteBrokerCommand,
  DescribeBrokerCommand,
  RebootBrokerCommand,
  paginateListBrokers,
  type DescribeBrokerResponse,
  type MqClient,
} from "@aws-sdk/client-mq";
import { collectPages } from "#shared/aws/pagination.ts";
import { runEach } from "#shared/utils/bulk.ts";
import {
  DEPLOYMENT_MODE,
  ENGINE_TYPE,
  ENGINE_VERSION,
  HOST_INSTANCE_TYPE,
} from "#services/mq/constants.ts";

export interface CreateBrokerInput {
  name: string;
  username: string;
  password: string;
}

export interface BrokerRef {
  id: string;
  name: string;
}

export const listBrokers = (mq: MqClient) =>
  collectPages(paginateListBrokers({ client: mq }, {}), (page) => page.BrokerSummaries);

export const getBroker = (mq: MqClient, broker: string): Promise<DescribeBrokerResponse> =>
  mq.send(new DescribeBrokerCommand({ BrokerId: broker }));

export const createBroker = (mq: MqClient, { name, username, password }: CreateBrokerInput) =>
  mq.send(
    new CreateBrokerCommand({
      BrokerName: name,
      EngineType: ENGINE_TYPE,
      EngineVersion: ENGINE_VERSION,
      HostInstanceType: HOST_INSTANCE_TYPE,
      DeploymentMode: DEPLOYMENT_MODE,
      PubliclyAccessible: false,
      AutoMinorVersionUpgrade: true,
      Users: [{ Username: username, Password: password }],
    }),
  );

export const deleteBrokers = (mq: MqClient, brokers: readonly BrokerRef[]) =>
  runEach(
    brokers,
    (broker) => broker.name,
    (broker) => mq.send(new DeleteBrokerCommand({ BrokerId: broker.id })),
  );

// Floci trả thành công nhưng không khởi động lại container (development.md › Traps)
export const rebootBroker = (mq: MqClient, broker: string) =>
  mq.send(new RebootBrokerCommand({ BrokerId: broker }));
