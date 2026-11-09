import type { LifecycleRule } from "@aws-sdk/client-s3";
import { pluralize } from "@shared/format.ts";
import type { LifecycleFormOutput } from "./schemas.ts";

const WHOLE_BUCKET = "Whole bucket";

const days = (count: number) => pluralize(count, "day");

export function toLifecycleRule(values: LifecycleFormOutput): LifecycleRule {
  const { id, prefix, status, expireDays, noncurrentDays, abortDays, deleteExpiredMarkers } =
    values;
  const expiration = expireDays
    ? { Days: expireDays }
    : deleteExpiredMarkers
      ? { ExpiredObjectDeleteMarker: true }
      : undefined;
  return {
    ID: id,
    Status: status,
    Filter: { Prefix: prefix },
    Expiration: expiration,
    NoncurrentVersionExpiration: noncurrentDays ? { NoncurrentDays: noncurrentDays } : undefined,
    AbortIncompleteMultipartUpload: abortDays ? { DaysAfterInitiation: abortDays } : undefined,
  };
}

// Rule cũ có thể đặt Prefix ở ngoài Filter
export const lifecycleScope = (rule: LifecycleRule) =>
  rule.Filter?.Prefix || rule.Prefix || WHOLE_BUCKET;

export function describeLifecycleActions(rule: LifecycleRule): string[] {
  const actions: string[] = [];
  if (rule.Expiration?.Days)
    actions.push(`Expire current versions after ${days(rule.Expiration.Days)}`);
  if (rule.Expiration?.ExpiredObjectDeleteMarker) actions.push("Delete expired delete markers");
  const noncurrent = rule.NoncurrentVersionExpiration?.NoncurrentDays;
  if (noncurrent) actions.push(`Delete noncurrent versions after ${days(noncurrent)}`);
  const abort = rule.AbortIncompleteMultipartUpload?.DaysAfterInitiation;
  if (abort) actions.push(`Abort incomplete uploads after ${days(abort)}`);
  return actions;
}
