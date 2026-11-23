import { ElastiCacheClient } from "@aws-sdk/client-elasticache";
import { useAwsClient } from "@shared/aws.ts";

export const useElastiCache = () => useAwsClient(ElastiCacheClient);
