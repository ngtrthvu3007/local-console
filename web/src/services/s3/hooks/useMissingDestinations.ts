import { useQueries } from "@tanstack/react-query";
import { functionNameOfArn } from "../../lambda/helpers.ts";
import { functionExistsQuery } from "../../lambda/hooks/useFunctions.ts";
import { useLambda } from "../../lambda/hooks/useLambda.ts";
import { useSNS } from "../../sns/hooks/useSNS.ts";
import { topicExistsQuery } from "../../sns/hooks/useTopics.ts";
import { queueExistsQuery } from "../../sqs/hooks/useQueues.ts";
import { useSQS } from "../../sqs/hooks/useSQS.ts";
import { queueNameOfArn } from "../../sqs/queues.ts";
import type { NotificationRule } from "../notificationRules.ts";

// Các rule trỏ tới đích đã bị xóa. S3 từ chối lưu cả cấu hình nếu còn một rule như vậy.
// Dùng chung query với link ở bảng nên không gọi thêm
export function useMissingDestinations(rules: NotificationRule[]) {
  const { lambda } = useLambda();
  const sqs = useSQS();
  const sns = useSNS();
  const results = useQueries({
    queries: rules.map((rule) => {
      if (rule.destination === "lambda") {
        return functionExistsQuery(lambda, functionNameOfArn(rule.arn));
      }
      if (rule.destination === "sqs") return queueExistsQuery(sqs, queueNameOfArn(rule.arn));
      return topicExistsQuery(sns, rule.arn);
    }),
  });
  return rules.filter((_rule, index) => results[index].data === false);
}
