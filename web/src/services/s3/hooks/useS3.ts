import { useMemo } from "react";
import { S3Client } from "@aws-sdk/client-s3";
import { proxyEndpoint } from "@shared/aws.ts";
import { AWS_TEST_CREDENTIALS } from "@shared/constants.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";

interface S3Clients {
  s3: S3Client; // gọi API qua proxy của console
  signer: S3Client; // ký URL theo FLOCI_PUBLIC_URL để trình duyệt/app gọi thẳng Floci
}

export function useS3(): S3Clients {
  const config = useLoadedConfig();
  return useMemo(() => {
    const shared = {
      region: config.region,
      credentials: AWS_TEST_CREDENTIALS,
      forcePathStyle: true,
      // Không tự thêm checksum, để pre-signed PUT bằng curl không cần header checksum
      requestChecksumCalculation: "WHEN_REQUIRED" as const,
      responseChecksumValidation: "WHEN_REQUIRED" as const,
    };
    return {
      s3: new S3Client({ ...shared, endpoint: proxyEndpoint() }),
      signer: new S3Client({ ...shared, endpoint: config.flociPublicUrl }),
    };
  }, [config]);
}
