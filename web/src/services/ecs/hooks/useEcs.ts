import { ECSClient } from "@aws-sdk/client-ecs";
import { useAwsClient } from "@shared/aws.ts";

export const useEcs = () => useAwsClient(ECSClient);

// Mọi query của ECS nằm dưới key gốc này
export const ECS_QUERY_ROOT = "ecs";

// Query của một cluster (chi tiết, service, task) nằm dưới key này: tải lại cả cụm bằng một key
export const clusterKey = (cluster: string) => [ECS_QUERY_ROOT, "cluster", cluster];
