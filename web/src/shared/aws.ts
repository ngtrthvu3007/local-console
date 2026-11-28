import { useMemo } from "react";
import { awsClient, existsUnlessMissing, type AwsClientConfig } from "@localconsole/core/shared";
import { AWS_PROXY_PATH } from "./constants.ts";
import { useLoadedConfig } from "./hooks/useConfig.ts";

// SDK trong trình duyệt gọi Floci qua proxy của console
export const proxyEndpoint = () => `${window.location.origin}${AWS_PROXY_PATH}`;

export function useAwsClient<T>(Client: new (config: AwsClientConfig) => T): T {
  const { region } = useLoadedConfig();

  return useMemo(() => awsClient(Client, { region, endpoint: proxyEndpoint() }), [Client, region]);
}

// Query "resource còn không" cho link / cảnh báo tham chiếu giữa các service.
// isMissing: service báo thiếu bằng mã khác 404 (SQS, SNS, Step Functions)
export const existsQuery = (
  queryKey: readonly unknown[],
  request: () => Promise<unknown>,
  isMissing?: (error: unknown) => boolean,
) => ({ queryKey, queryFn: () => existsUnlessMissing(request, isMissing), retry: false });
