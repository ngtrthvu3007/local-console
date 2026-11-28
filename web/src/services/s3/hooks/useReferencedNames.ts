import { useQuery } from "@tanstack/react-query";
import { isArnOrQualified as refersTo } from "@localconsole/core/shared";
import { useEventBridgeService } from "../../eventbridge/hooks/useEventBridgeService.ts";
import { useSnsService } from "../../sns/hooks/useSnsService.ts";
import { toNotificationRules } from "@localconsole/core/s3";
import { useS3Service } from "./useS3Service.ts";

const REFERENCES = "references";

// Floci không dọn tham chiếu khi xóa nên cảnh báo trước; local ít resource nên quét hết khi mở modal
export function useReferencedNames(items: readonly { name: string; arn: string }[]) {
  const s3 = useS3Service();
  const sns = useSnsService();
  const eventbridge = useEventBridgeService();

  return useQuery({
    queryKey: [REFERENCES, ...items.map((item) => item.arn)],
    queryFn: async () => {
      const buckets = await s3.listBuckets();

      const [subscriptions, perBucket, ruleTargets, scheduleTargets] = await Promise.all([
        sns.listSubscriptionsOfEndpoint((endpoint) =>
          items.some((item) => refersTo(endpoint, item.arn)),
        ),
        Promise.all(
          buckets.map(async ({ Name: bucket = "" }) =>
            toNotificationRules(await s3.getBucketNotifications(bucket)),
          ),
        ),
        eventbridge.listRuleTargets(),
        eventbridge.listScheduleTargets(),
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
