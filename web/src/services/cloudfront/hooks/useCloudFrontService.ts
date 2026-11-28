import { useMemo } from "react";
import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
import { createCloudFrontService } from "@localconsole/core/cloudfront";
import { useAwsClient } from "@shared/aws.ts";

export function useCloudFrontService() {
  const cloudfront = useAwsClient(CloudFrontClient);

  return useMemo(() => createCloudFrontService(cloudfront), [cloudfront]);
}
