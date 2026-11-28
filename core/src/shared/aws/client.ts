import { AWS_TEST_CREDENTIALS } from "#shared/constants.ts";

export interface AwsClientConfig {
  region: string;
  credentials: typeof AWS_TEST_CREDENTIALS;
  endpoint: string;
}

// Nơi gọi truyền class SDK của service, nên SDK chỉ tải cùng nơi dùng (web: chunk của trang).
// endpoint: web đi qua proxy /aws, server gọi thẳng Floci
export const awsClient = <T>(
  Client: new (config: AwsClientConfig) => T,
  { region, endpoint }: { region: string; endpoint: string },
) => new Client({ region, credentials: AWS_TEST_CREDENTIALS, endpoint });
