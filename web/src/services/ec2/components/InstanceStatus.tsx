import type { Instance } from "@aws-sdk/client-ec2";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { INSTANCE_STATE_STYLES } from "../constants.ts";
import { stateOf } from "../instances.ts";

// State không biết (Floci thêm kiểu mới) thì hiện nguyên chữ
export function InstanceStatus({ instance }: { instance: Instance }) {
  const state = stateOf(instance);
  if (!state) return <>{NOT_AVAILABLE}</>;
  const style = INSTANCE_STATE_STYLES[state];
  return <StatusIndicator type={style?.type ?? "info"}>{style?.label ?? state}</StatusIndicator>;
}
