import { useMemo } from "react";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { createDynamoDbService } from "@localconsole/core/dynamodb";
import { useAwsClient } from "@shared/aws.ts";

export function useDynamoDbService() {
  const dynamodb = useAwsClient(DynamoDBClient);

  return useMemo(() => createDynamoDbService(dynamodb), [dynamodb]);
}
