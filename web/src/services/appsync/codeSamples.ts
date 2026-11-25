import { lines, literal, type CodeSample } from "@shared/codeSamples.ts";
import { AUTH_TYPES, type AuthType } from "./constants.ts";

const SAMPLE_QUERY = "query { __typename }";
const API_KEY_PLACEHOLDER = "YOUR_API_KEY";
const TOKEN_PLACEHOLDER = "YOUR_ID_TOKEN";
const TOKEN_NOTE =
  "ID token of a signed-in user (Cognito InitiateAuth, see the app client's Connect card)";
const IAM_NOTE =
  "Sign the request with SigV4 (service appsync), e.g. with @smithy/signature-v4 or requests-aws4auth";

interface SampleInput {
  endpoint: string;
  authType?: AuthType;
  apiKey?: string;
}

// Header theo auth của API: API key, không có thì Cognito Bearer (Floci chỉ nhận Bearer, spec 7 #10);
// chỉ IAM thì không có code ký, chỉ ghi chú
function authHeader({ authType, apiKey }: SampleInput) {
  if (authType === AUTH_TYPES.apiKey) {
    const key = literal(apiKey ?? API_KEY_PLACEHOLDER);
    return { node: [`    "x-api-key": ${key},`], python: [`"x-api-key": ${key}`], note: [] };
  }
  if (authType === AUTH_TYPES.cognito) {
    const bearer = literal(`Bearer ${TOKEN_PLACEHOLDER}`);
    return {
      node: [`    authorization: ${bearer},`],
      python: [`"authorization": ${bearer}`],
      note: [TOKEN_NOTE],
    };
  }
  return { node: [], python: [], note: [IAM_NOTE] };
}

// Thẻ Connect: gọi endpoint GraphQL bằng fetch / requests, không cần SDK
export function apiSample(input: SampleInput): CodeSample {
  const header = authHeader(input);
  const endpoint = literal(input.endpoint);
  const query = literal(SAMPLE_QUERY);

  return {
    node: lines(
      ...header.note.map((note) => `// ${note}`),
      `const response = await fetch(${endpoint}, {`,
      '  method: "POST",',
      "  headers: {",
      '    "content-type": "application/json",',
      ...header.node,
      "  },",
      `  body: JSON.stringify({ query: ${query} }),`,
      "});",
      "console.log(await response.json());",
    ),
    python: lines(
      ...header.note.map((note) => `# ${note}`),
      "import requests",
      "",
      "response = requests.post(",
      `    ${endpoint},`,
      `    headers={${header.python.join(", ")}},`,
      `    json={"query": ${query}},`,
      ")",
      "print(response.json())",
    ),
  };
}
