import { AuthFlowType, type UserPoolClientType } from "@aws-sdk/client-cognito-identity-provider";
import { lines } from "@localconsole/core/shared";
import { literal, NODE_AWS_NOTE, PYTHON_AWS_NOTE, type CodeSample } from "@shared/codeSamples.ts";
import { USER_PASSWORD_AUTH_FLOW } from "@localconsole/core/cognito";

// Chỗ trống để dev tự điền, như USER / PASSWORD trong URL của MQ
const USERNAME = literal("USERNAME");
const PASSWORD = literal("PASSWORD");
// Không nhúng secret vào code mẫu: app đọc từ env
const SECRET_ENV = "COGNITO_CLIENT_SECRET";
const AUTH_FLOW = literal(AuthFlowType.USER_PASSWORD_AUTH);
const CHALLENGE_NOTE = "A user an admin created gets NEW_PASSWORD_REQUIRED first, not tokens";
const FLOW_NOTE = `Turn on ${USER_PASSWORD_AUTH_FLOW} for this app client first`;

// Đăng nhập bằng username / password như form của app; client có secret thì thêm SECRET_HASH
export function clientSample(client: UserPoolClientType): CodeSample {
  const clientId = literal(client.ClientId ?? "");
  const hasSecret = Boolean(client.ClientSecret);
  const flowOn = client.ExplicitAuthFlows?.includes(USER_PASSWORD_AUTH_FLOW) ?? false;

  return {
    node: lines(
      NODE_AWS_NOTE,
      ...(flowOn ? [] : [`// ${FLOW_NOTE}`]),
      "import {",
      "  CognitoIdentityProviderClient,",
      "  InitiateAuthCommand,",
      '} from "@aws-sdk/client-cognito-identity-provider";',
      ...(hasSecret ? ['import { createHmac } from "node:crypto";'] : []),
      "",
      "const cognito = new CognitoIdentityProviderClient({});",
      `const ClientId = ${clientId};`,
      `const username = ${USERNAME};`,
      ...(hasSecret
        ? [
            `const SECRET_HASH = createHmac("sha256", process.env.${SECRET_ENV})`,
            "  .update(username + ClientId)",
            '  .digest("base64");',
          ]
        : []),
      "",
      "const { AuthenticationResult } = await cognito.send(new InitiateAuthCommand({",
      "  ClientId,",
      `  AuthFlow: ${AUTH_FLOW},`,
      `  AuthParameters: { USERNAME: username, PASSWORD: ${PASSWORD}${hasSecret ? ", SECRET_HASH" : ""} },`,
      "}));",
      `// ${CHALLENGE_NOTE}`,
      "console.log(AuthenticationResult?.IdToken);",
    ),
    python: lines(
      PYTHON_AWS_NOTE,
      ...(flowOn ? [] : [`# ${FLOW_NOTE}`]),
      ...(hasSecret ? ["import base64", "import hashlib", "import hmac", "import os"] : []),
      "import boto3",
      "",
      'cognito = boto3.client("cognito-idp")',
      `client_id = ${clientId}`,
      `username = ${USERNAME}`,
      `params = {"USERNAME": username, "PASSWORD": ${PASSWORD}}`,
      ...(hasSecret
        ? [
            "digest = hmac.new(",
            `    os.environ["${SECRET_ENV}"].encode(),`,
            "    (username + client_id).encode(),",
            "    hashlib.sha256,",
            ").digest()",
            'params["SECRET_HASH"] = base64.b64encode(digest).decode()',
          ]
        : []),
      "",
      "result = cognito.initiate_auth(",
      `    ClientId=client_id, AuthFlow=${AUTH_FLOW}, AuthParameters=params`,
      ")",
      `# ${CHALLENGE_NOTE}`,
      'print(result["AuthenticationResult"]["IdToken"])',
    ),
  };
}
