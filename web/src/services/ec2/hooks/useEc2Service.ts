import { useMemo } from "react";
import { EC2Client } from "@aws-sdk/client-ec2";
import { createEc2Service } from "@localconsole/core/ec2";
import { useAwsClient } from "@shared/aws.ts";

export function useEc2Service() {
  const ec2 = useAwsClient(EC2Client);

  return useMemo(() => createEc2Service(ec2), [ec2]);
}
