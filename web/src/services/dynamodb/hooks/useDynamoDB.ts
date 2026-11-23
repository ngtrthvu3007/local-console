import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { useAwsClient } from "@shared/aws.ts";

export const useDynamoDB = () => useAwsClient(DynamoDBClient);
