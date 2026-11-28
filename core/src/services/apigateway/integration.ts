import {
  APIGATEWAY_ARN_PREFIX,
  INTEGRATION_ARROW,
  INTEGRATION_LABELS,
  INTEGRATION_TYPES,
  LAMBDA_ARN_PREFIX,
  LAMBDA_URI_MARKER,
} from "./constants.ts";

export type IntegrationView =
  | { kind: "lambda"; proxy: boolean; functionName?: string }
  | { kind: "http"; url: string }
  | { kind: "mock" }
  | { kind: "aws"; service: string }
  | { kind: "other"; type?: string };

// Alias :prod bị bỏ vì regex dừng ở ":"
const FUNCTION_SEGMENT = /function:([^:/]+)/;

// Đoạn có ${...} (kể cả có tiền tố) không phải tên thật nên không được link
function functionNameOf(uri: string) {
  const segment = FUNCTION_SEGMENT.exec(uri)?.[1];
  return segment?.includes("${") ? undefined : segment;
}

export function describeIntegration(
  type: string | undefined,
  uri: string | undefined,
): IntegrationView {
  if (type === INTEGRATION_TYPES.http || type === INTEGRATION_TYPES.httpProxy) {
    return { kind: "http", url: uri ?? "" };
  }
  if (type === INTEGRATION_TYPES.mock) return { kind: "mock" };
  if (uri?.startsWith(LAMBDA_ARN_PREFIX) || uri?.includes(LAMBDA_URI_MARKER)) {
    return {
      kind: "lambda",
      proxy: type === INTEGRATION_TYPES.awsProxy,
      functionName: functionNameOf(uri),
    };
  }
  if (type === INTEGRATION_TYPES.aws && uri?.startsWith(APIGATEWAY_ARN_PREFIX)) {
    // arn:aws:apigateway:<region>:<service>:...
    return { kind: "aws", service: uri.split(":")[4] };
  }
  return { kind: "other", type };
}

// Phần nhãn đứng trước tên function (vd "Lambda proxy")
export const lambdaLabel = (proxy: boolean) =>
  proxy ? INTEGRATION_LABELS.lambdaProxy : INTEGRATION_LABELS.lambda;

export function integrationLabel(view: IntegrationView, uri?: string): string {
  switch (view.kind) {
    case "lambda": {
      const label = lambdaLabel(view.proxy);
      const target = view.functionName ?? uri;
      return target ? `${label}${INTEGRATION_ARROW}${target}` : label;
    }
    case "http":
      return `${INTEGRATION_LABELS.httpProxy}${INTEGRATION_ARROW}${view.url}`;
    case "mock":
      return INTEGRATION_LABELS.mock;
    case "aws":
      return `${INTEGRATION_LABELS.aws}${INTEGRATION_ARROW}${view.service}`;
    case "other":
      return view.type ?? INTEGRATION_LABELS.other;
  }
}
