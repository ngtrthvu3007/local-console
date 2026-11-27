import type { Instance, Tag } from "@aws-sdk/client-ec2";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { INSTANCE_STATES, NAME_TAG_KEY, TRANSITIONAL_STATES } from "./constants.ts";

export const instanceId = (instance: Instance) => instance.InstanceId ?? "";
export const stateOf = (instance: Instance) => instance.State?.Name ?? "";

const nameTag = (tags: Tag[] | undefined) => tags?.find((tag) => tag.Key === NAME_TAG_KEY)?.Value;

// Instance không có tag Name thì hiện "—", như AWS
export const instanceName = (instance: Instance) => nameTag(instance.Tags) || NOT_AVAILABLE;

export const isTransitional = (instance: Instance) =>
  TRANSITIONAL_STATES.includes(stateOf(instance));

export const INSTANCE_ACTIONS = {
  stop: "stop",
  start: "start",
  reboot: "reboot",
  terminate: "terminate",
} as const;
export type InstanceAction = (typeof INSTANCE_ACTIONS)[keyof typeof INSTANCE_ACTIONS];

// Giống AWS: khóa action không hợp lệ với state
export const ACTION_ALLOWED: Record<InstanceAction, (state: string) => boolean> = {
  stop: (state) => state === INSTANCE_STATES.running,
  start: (state) => state === INSTANCE_STATES.stopped,
  reboot: (state) => state === INSTANCE_STATES.running,
  terminate: (state) =>
    state !== INSTANCE_STATES.terminated && state !== INSTANCE_STATES.shuttingDown,
};
