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
// Lambda authorizer (TOKEN / REQUEST); Cognito và JWT dùng chính tên loại
export const AUTH_CUSTOM = "CUSTOM";
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
export const HTTP_PROTOCOL = "HTTP";
export const IDENTITY_SEPARATOR = ", ";
export const INTEGRATION_ARROW = " → ";
export const ROUTE_SELECTION_LABEL = "Route selection: ";
export const INTEGRATION_TARGET_PREFIX = "integrations/";
export const AUTHORIZER_TYPES = {
  cognito: "COGNITO_USER_POOLS",
  jwt: "JWT",
  token: "TOKEN",
  request: "REQUEST",
} as const;
export const JWT_ISSUER_LABEL = "issuer ";
export const LOCAL_ISSUER_POPOVER =
  "Floci blocks local Cognito issuers, so requests get 401. Use a Lambda or Cognito user pool authorizer on a REST API to test sign-in locally.";
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

// URI để API Gateway gọi Lambda: REST integration và mọi Lambda authorizer
export const LAMBDA_INVOCATION_PATH = `${LAMBDA_URI_MARKER}2015-03-31/functions/`;
export const INVOCATIONS_SUFFIX = "/invocations";
export const COGNITO_POOL_ARN_PREFIX = "arn:aws:cognito-idp:";
// Tiền tố nguồn danh tính theo loại API; sau đó là header. / querystring.
export const IDENTITY_PREFIXES = {
  REST: "method.request.",
  HTTP: "$request.",
  WebSocket: "route.request.",
} as const;
export const IDENTITY_LIST_SEPARATOR = ",";

// StatementId của Lambda: [A-Za-z0-9_-], tối đa 100 ký tự
export const STATEMENT_ID_PREFIX = "apigateway";
export const STATEMENT_ID_MAX_LENGTH = 100;
export const GRANT_LABEL = "Grant API Gateway permission to invoke the function";
export const GRANT_DESCRIPTION =
  "Floci doesn't check this permission; Lambda › Triggers uses it to show this API.";
export const GRANT_FAILED_PREFIX = "Couldn't grant permission: ";
export const LOCKED_INTEGRATION =
  "Edit this integration in your IaC: the console edits Lambda and HTTP proxy integrations.";
export const HAS_CHILDREN_REASON = "Delete its child resources first.";
export const GREEDY_LEAF_REASON = "A greedy path variable must be the last part of the path.";
export const TWO_WAY_LABEL = "Send the function's response to the client";

// Tên API, authorizer, stage và route key WebSocket: tối đa 128 ký tự (luật AWS)
export const NAME_MAX_LENGTH = 128;
// Route / stage mặc định của API v2
export const DEFAULT_KEY = "$default";
export const DEFAULT_ROUTE_SELECTION = "$request.body.action";
export const DEFAULT_IDENTITY_HEADER = "Authorization";
// Lambda luôn được gọi bằng POST, bất kể method của API
export const LAMBDA_INVOKE_METHOD = "POST";
export const PAYLOAD_FORMAT_VERSIONS = { v1: "1.0", v2: "2.0" } as const;
export const ROOT_RESOURCE_REASON = "The root resource can't be deleted.";
// Method gợi ý sẵn khi tạo method mới
export const DEFAULT_METHOD = "GET";
// Route có sẵn ý nghĩa của API WebSocket; $connect là chỗ duy nhất gắn authorizer (luật AWS)
export const CONNECT_ROUTE = "$connect";
export const DISCONNECT_ROUTE = "$disconnect";
export const TWO_WAY_LOCKED =
  "Floci keeps replying once this is on. To stop, delete the route and create it again.";
// Loại authorizer mỗi loại API có (form tạo authorizer)
export const AUTHORIZER_TYPES_BY_API = {
  REST: [AUTHORIZER_TYPES.token, AUTHORIZER_TYPES.request, AUTHORIZER_TYPES.cognito],
  HTTP: [AUTHORIZER_TYPES.request, AUTHORIZER_TYPES.jwt],
  WebSocket: [AUTHORIZER_TYPES.request],
} as const;
// Floci 2.4.0 không nhận patch /providerARNs
export const POOL_LOCKED = "Floci can't change the user pool. Create a new authorizer instead.";
// Route key HTTP: "<METHOD> <path>"
export const ROUTE_KEY_SEPARATOR = " ";
export const MISSING_AUTHORIZER = "This authorizer no longer exists. Choose another one.";
export const ALL_METHODS_REASON = "This resource already has every method.";
