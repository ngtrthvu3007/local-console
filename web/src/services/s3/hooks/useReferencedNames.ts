import { useQuery } from "@tanstack/react-query";
import { GetBucketNotificationConfigurationCommand, ListBucketsCommand } from "@aws-sdk/client-s3";
import { useSNS } from "../../sns/hooks/useSNS.ts";
import { listSubscriptionsOfEndpoint } from "../../sns/hooks/useSubscriptions.ts";
import { toNotificationRules } from "../notificationRules.ts";
import { useS3 } from "./useS3.ts";

const ARN_SEPARATOR = ":";
const REFERENCES = "references";

// ARN function có thể kèm version / alias
const refersTo = (candidate: string, arn: string) =>
  candidate === arn || candidate.startsWith(`${arn}${ARN_SEPARATOR}`);

// Tên các resource đang được subscription SNS hoặc rule S3 trỏ tới, để cảnh báo trước khi xóa:
// Floci không dọn tham chiếu nên chúng thành mồ côi. Local ít bucket / subscription nên quét hết
// khi mở modal
export function useReferencedNames(items: readonly { name: string; arn: string }[]) {
  const { s3 } = useS3();
  const sns = useSNS();
  return useQuery({
    queryKey: [REFERENCES, ...items.map((item) => item.arn)],
    queryFn: async () => {
      const buckets = (await s3.send(new ListBucketsCommand({}))).Buckets ?? [];
      const [subscriptions, perBucket] = await Promise.all([
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
      ]);
      const referrers = [
        ...subscriptions.map((subscription) => subscription.endpoint),
        ...perBucket.flat().map((rule) => rule.arn),
      ];
      return items
        .filter((item) => referrers.some((referrer) => refersTo(referrer, item.arn)))
        .map((item) => item.name);
    },
  });
}
