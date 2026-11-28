export const USER_REQUEST_SEGMENT = "_user_request_";
export const EXECUTE_API_SEGMENT = "execute-api";
export const CONNECTIONS_SEGMENT = "@connections";
export const RESTAPIS_SEGMENT = "restapis";

export const LAMBDA_ARN_PREFIX = "arn:aws:lambda:";
export const LAMBDA_URI_MARKER = ":lambda:path/";
export const APIGATEWAY_ARN_PREFIX = "arn:aws:apigateway:";
export const COGNITO_POOL_MARKER = "userpool/";

export const INTEGRATION_TYPES = {
  awsProxy: "AWS_PROXY",
  aws: "AWS",
  http: "HTTP",
  httpProxy: "HTTP_PROXY",
  mock: "MOCK",
} as const;

export const HEADER_ERROR = "Use Header:Value on each line.";

export const ANY_METHOD = "ANY";
// ANY đứng đầu vì nó phủ mọi method còn lại
export const METHOD_ORDER = [
  ANY_METHOD,
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

export const APIGATEWAY_PRINCIPAL = "apigateway.amazonaws.com";
export const SOURCE_ARN_KEY = "AWS:SourceArn";

export const WEBSOCKET_SCHEME = "ws://";
export const EXECUTE_API_ARN_PREFIX = "arn:aws:execute-api:";
// Terraform hay bỏ stage / method trong SourceArn: coi như khớp mọi giá trị
export const ARN_WILDCARD = "*";
// SourceArn của Lambda authorizer: <apiId>/authorizers/<authorizerId> thay cho stage / method
export const AUTHORIZERS_ARN_SEGMENT = "authorizers";

export const INTEGRATION_LABELS = {
  lambdaProxy: "Lambda proxy",
  lambda: "Lambda",
  httpProxy: "HTTP proxy",
  mock: "Mock",
  aws: "AWS",
  other: "Other",
} as const;

// Tab Test: fetch không cho GET / HEAD mang body
export const BODYLESS_METHODS = ["GET", "HEAD"];
export const NO_STAGE_HINT = "Create a stage to test this method.";
export const LAMBDA_LOGS_LABEL = "Lambda logs: ";
export const MONITOR_SUFFIX = " › Monitor";
export const EMPTY_BODY_TEXT = "No body.";

export const AUTH_NONE = "NONE";
export const AUTH_IAM = "AWS_IAM";
// Floci 2.4.0 trả 403 MissingAuthenticationToken cho lời gọi không ký (spec 7 #18)
export const IAM_NOTE =
  "Floci checks the signature, not IAM policies. Test sends unsigned requests.";
export const AUTHORIZER_TYPE_LABELS: Partial<Record<string, string>> = {
  COGNITO_USER_POOLS: "Cognito user pools",
  TOKEN: "Lambda (TOKEN)",
  REQUEST: "Lambda (REQUEST)",
  JWT: "JWT",
};
export const NOT_FOUND_LINK = "View APIs";
export const NOT_FOUND_DESCRIPTION = "It may have been deleted, or the id is wrong.";
export const WEBSOCKET_PROTOCOL = "WEBSOCKET";
export const IDENTITY_SEPARATOR = ", ";
export const INTEGRATION_ARROW = " → ";
export const ROUTE_SELECTION_LABEL = "Route selection: ";
export const INTEGRATION_TARGET_PREFIX = "integrations/";
export const AUTHORIZER_TYPES = { cognito: "COGNITO_USER_POOLS", jwt: "JWT" } as const;
export const JWT_ISSUER_LABEL = "issuer ";
export const LOCAL_ISSUER_POPOVER =
  "Floci blocks local Cognito issuers, so requests get 401. Use a Lambda or Cognito user pool authorizer on a REST API to test sign-in locally.";
// Host của URL WebSocket: Floci định tuyến <apiId>.execute-api.<region>.localhost
export const LOCALHOST_DOMAIN = "localhost";
export const STAGES_DESCRIPTION =
  "Floci serves the latest configuration on every stage; deployments have no effect.";
export const URL_LABELS = {
  machine: "From your machine",
  compose: "From a container in compose",
  webSocket: "WebSocket URL",
  connections: "@connections URL",
} as const;

// Type CloudFormation của từng phiên bản API
export const CFN_API_TYPES = {
  v1: "AWS::ApiGateway::RestApi",
  v2: "AWS::ApiGatewayV2::Api",
} as const;
