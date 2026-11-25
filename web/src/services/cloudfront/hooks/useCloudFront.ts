import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
import { useAwsClient } from "@shared/aws.ts";

// CloudFront là dữ liệu toàn cục: Floci trả cùng danh sách dù ký bằng region nào (spec 7 #13)
export const useCloudFront = () => useAwsClient(CloudFrontClient);
