import { useQueries } from "@tanstack/react-query";
import { lastArnPart } from "@localconsole/core/shared";
import { functionNameOfArn } from "@localconsole/core/lambda";
import { functionExistsQuery } from "../../lambda/hooks/useFunctions.ts";
import { useLambdaService } from "../../lambda/hooks/useLambdaService.ts";
import { useSnsService } from "../../sns/hooks/useSnsService.ts";
import { topicExistsQuery } from "../../sns/hooks/useTopics.ts";
import { queueExistsQuery } from "../../sqs/hooks/useQueues.ts";
import { useSqsService } from "../../sqs/hooks/useSqsService.ts";
import type { NotificationRule } from "@localconsole/core/s3";

// Các rule trỏ tới đích đã bị xóa. S3 từ chối lưu cả cấu hình nếu còn một rule như vậy.
// Dùng chung query với link ở bảng nên không gọi thêm
export function useMissingDestinations(rules: NotificationRule[]) {
  const lambda = useLambdaService();
  const sqs = useSqsService();
  const sns = useSnsService();
  const queryOf = (rule: NotificationRule) => {
    if (rule.destination === "lambda") {
      return functionExistsQuery(lambda, functionNameOfArn(rule.arn));
    }
    if (rule.destination === "sqs") return queueExistsQuery(sqs, lastArnPart(rule.arn));
    return topicExistsQuery(sns, rule.arn);
  };
  // Nhiều rule cùng đích chỉ hỏi một lần: useQueries cảnh báo khi key trùng
  const keyOf = (rule: NotificationRule) => JSON.stringify(queryOf(rule).queryKey);
  const unique = [...new Map(rules.map((rule) => [keyOf(rule), rule])).values()];
  const results = useQueries({ queries: unique.map(queryOf) });
  const missing = new Set(
    unique.filter((_rule, index) => results[index].data === false).map(keyOf),
  );
  return rules.filter((rule) => missing.has(keyOf(rule)));
}
