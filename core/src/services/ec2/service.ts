import type { EC2Client } from "@aws-sdk/client-ec2";
import type { NewInstance } from "./schemas.ts";
import {
  getInstance,
  getUserData,
  launchInstance,
  listImages,
  listInstances,
  runInstanceAction,
  type InstanceActionInput,
} from "./operations/instances.ts";
import { listNetworkOptions } from "./operations/network.ts";

export function createEc2Service(ec2: EC2Client) {
  return {
    listImages: () => listImages(ec2),
    listInstances: () => listInstances(ec2),
    getInstance: (id: string) => getInstance(ec2, id),
    getUserData: (id: string) => getUserData(ec2, id),
    launchInstance: (instance: NewInstance) => launchInstance(ec2, instance),
    runInstanceAction: (input: InstanceActionInput) => runInstanceAction(ec2, input),
    listNetworkOptions: () => listNetworkOptions(ec2),
  };
}

export type Ec2Service = ReturnType<typeof createEc2Service>;
