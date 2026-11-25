import { useQuery } from "@tanstack/react-query";
import { GetBucketNotificationConfigurationCommand, ListBucketsCommand } from "@aws-sdk/client-s3";
import { isArnOrQualified as refersTo } from "@shared/arn.ts";
import { listRuleTargets, listScheduleTargets } from "../../eventbridge/eventSources.ts";
import { useEventBridge } from "../../eventbridge/hooks/useEventBridge.ts";
import { useScheduler } from "../../eventbridge/hooks/useScheduler.ts";
import { useSNS } from "../../sns/hooks/useSNS.ts";
import { listSubscriptionsOfEndpoint } from "../../sns/hooks/useSubscriptions.ts";
import { toNotificationRules } from "../notificationRules.ts";
import { useS3 } from "./useS3.ts";

const REFERENCES = "references";

// Floci không dọn tham chiếu khi xóa nên cảnh báo trước; local ít resource nên quét hết khi mở modal
export function useReferencedNames(items: readonly { name: string; arn: string }[]) {
  const { s3 } = useS3();
  const sns = useSNS();
  const events = useEventBridge();
  const scheduler = useScheduler();

  return useQuery({
    queryKey: [REFERENCES, ...items.map((item) => item.arn)],
    queryFn: async () => {
      const buckets = (await s3.send(new ListBucketsCommand({}))).Buckets ?? [];

      const [subscriptions, perBucket, ruleTargets, scheduleTargets] = await Promise.all([
        listSubscriptionsOfEndpoint(sns, (endpoint) =>
          items.some((item) => refersTo(endpoint, item.arn)),
        ),
        Promise.all(
          buckets.map(async ({ Name: bucket = "" }) =>
            toNotificationRules(
              await s3.send(new GetBucketNotificationConfigurationCommand({ Bucket: bucket })),
            ),
          ),
        ),
        listRuleTargets(events),
        listScheduleTargets(scheduler),
      ]);

      const referrers = [
        ...subscriptions.map((subscription) => subscription.endpoint),
        ...perBucket.flat().map((rule) => rule.arn),
        ...ruleTargets.map((target) => target.arn),
        ...scheduleTargets.map((target) => target.arn),
      ];

      return items
        .filter((item) => referrers.some((referrer) => refersTo(referrer, item.arn)))
        .map((item) => item.name);
    },
  });
}
