import { Sha256 } from "@aws-crypto/sha256-js";
import { SignatureV4 } from "@smithy/signature-v4";
import { AWS_TEST_CREDENTIALS } from "#shared/constants.ts";
import { proxyGraphqlUrl } from "./apis.ts";
import { AUTH_TYPES } from "./constants.ts";

const SIGNING_SERVICE = "appsync";
const CONTENT_TYPE = "application/json";
const HOST_HEADER = "host";

export type QueryAuth =
  | { type: typeof AUTH_TYPES.apiKey; key: string }
  | { type: typeof AUTH_TYPES.cognito; token: string }
  | { type: typeof AUTH_TYPES.iam; region: string };

interface RequestInput {
  graphqlUri: string;
  proxyBase: string;
  auth: QueryAuth;
  body: string;
}

// IAM: Floci kiểm chữ ký theo host / path của endpoint nó trả (localhost.floci.io:4566/v1/…), không
// theo URL của proxy (spec 7 #16). Bỏ header host: trình duyệt không cho đặt, proxy tự gửi host của Floci
async function signedHeaders(graphqlUri: string, region: string, body: string) {
  const url = new URL(graphqlUri);
  const signer = new SignatureV4({
    service: SIGNING_SERVICE,
    region,
    credentials: AWS_TEST_CREDENTIALS,
    sha256: Sha256,
  });
  const signed = await signer.sign({
    method: "POST",
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port ? Number(url.port) : undefined,
    path: url.pathname,
    headers: { [HOST_HEADER]: url.host, "content-type": CONTENT_TYPE },
    body,
  });
  const { [HOST_HEADER]: _host, ...headers } = signed.headers;
  return headers;
}

// URL (qua proxy, cùng origin) và header theo auth; Cognito phải là "Bearer <token>" (spec 7 #10)
export async function graphqlRequest({
  graphqlUri,
  proxyBase,
  auth,
  body,
}: RequestInput): Promise<{ url: string; headers: Record<string, string> }> {
  const url = proxyGraphqlUrl(proxyBase, graphqlUri);
  const base = { "content-type": CONTENT_TYPE };

  if (auth.type === AUTH_TYPES.apiKey) return { url, headers: { ...base, "x-api-key": auth.key } };
  if (auth.type === AUTH_TYPES.cognito)
    return { url, headers: { ...base, authorization: `Bearer ${auth.token}` } };
  return { url, headers: { ...base, ...(await signedHeaders(graphqlUri, auth.region, body)) } };
}
