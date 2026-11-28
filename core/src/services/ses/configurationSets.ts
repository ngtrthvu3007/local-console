import {
  type EventDestination,
  type EventDestinationDefinition,
  type EventType,
} from "@aws-sdk/client-sesv2";
import { EVENT_TYPE_LABELS, type AddableEventType, type DestinationKind } from "./constants.ts";

export interface DestinationInput {
  kind: DestinationKind;
  arn: string;
  eventTypes: EventType[];
  enabled: boolean;
}

// Update ghi đè cả destination, nên bật / tắt cũng phải gửi lại đủ phần còn lại
export function toDefinition(input: DestinationInput): EventDestinationDefinition {
  return {
    Enabled: input.enabled,
    MatchingEventTypes: input.eventTypes,
    ...(input.kind === "sns"
      ? { SnsDestination: { TopicArn: input.arn } }
      : { EventBridgeDestination: { EventBusArn: input.arn } }),
  };
}

// Destination tạo ngoài console có thể là loại khác (Kinesis…): không đọc được thì undefined
export function toInput(destination: EventDestination): DestinationInput | undefined {
  const topic = destination.SnsDestination?.TopicArn;
  const bus = destination.EventBridgeDestination?.EventBusArn;
  const target = topic
    ? { kind: "sns" as const, arn: topic }
    : bus
      ? { kind: "eventbus" as const, arn: bus }
      : undefined;
  return (
    target && {
      ...target,
      eventTypes: destination.MatchingEventTypes ?? [],
      enabled: Boolean(destination.Enabled),
    }
  );
}

// Loại event ngoài bốn loại chọn được (Reject…) hiện chữ thường của chính nó
export const eventTypeLabel = (type: EventType) =>
  EVENT_TYPE_LABELS[type as AddableEventType] ?? type.toLowerCase();
