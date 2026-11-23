import { STUB_REASON_MARKER } from "./constants.ts";

interface EventWithReason {
  LogicalResourceId?: string;
  ResourceStatusReason?: string;
}

export const isStubReason = (reason = "") => reason.includes(STUB_REASON_MARKER);

// Events mới nhất trước: lấy lý do gần nhất
export function latestReasons(events: readonly EventWithReason[]): Map<string, string> {
  const reasons = new Map<string, string>();
  for (const { LogicalResourceId, ResourceStatusReason } of events) {
    if (LogicalResourceId && ResourceStatusReason && !reasons.has(LogicalResourceId)) {
      reasons.set(LogicalResourceId, ResourceStatusReason);
    }
  }
  return reasons;
}

export const stubbedResources = <T extends { LogicalResourceId?: string }>(
  resources: readonly T[],
  reasons: ReadonlyMap<string, string>,
) =>
  resources.filter(({ LogicalResourceId }) => isStubReason(reasons.get(LogicalResourceId ?? "")));
