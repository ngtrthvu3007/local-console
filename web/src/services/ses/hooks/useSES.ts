import { SESv2Client } from "@aws-sdk/client-sesv2";
import { useAwsClient } from "@shared/aws.ts";

export const useSES = () => useAwsClient(SESv2Client);
