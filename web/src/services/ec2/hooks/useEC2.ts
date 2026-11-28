import { EC2Client } from "@aws-sdk/client-ec2";
import { useAwsClient } from "@shared/aws.ts";

export const useEC2 = () => useAwsClient(EC2Client);
