import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import Tabs from "@cloudscape-design/components/tabs";
import type { Method } from "@aws-sdk/client-api-gateway";
import { BreakableText } from "@shared/components/BreakableText.tsx";
import {
  authorizerTypeLabel,
  AUTH_IAM,
  AUTH_NONE,
  IAM_NOTE,
  type AuthorizerRow,
  API_VERSIONS,
} from "@localconsole/core/apigateway";
import { useAuthorizers } from "../hooks/useApiDetail.ts";
import { IntegrationValue } from "./IntegrationValue.tsx";
import { MethodTest } from "./MethodTest.tsx";

const METHOD_TABS = { overview: "overview", test: "test" } as const;

// Có authorizer thì hiện tên kèm loại, không thì loại xác thực của method
function authorizerText(method: Method, authorizers: AuthorizerRow[] = []) {
  const type = method.authorizationType ?? AUTH_NONE;
  if (type === AUTH_IAM) return `${AUTH_IAM} · ${IAM_NOTE}`;
  const authorizer = authorizers.find((a) => a.id === method.authorizerId);
  if (authorizer) return `${authorizer.name} (${authorizerTypeLabel(authorizer.type)})`;
  return type;
}

function AuthorizerValue({ method, apiId }: { method: Method; apiId: string }) {
  const authorizers = useAuthorizers(API_VERSIONS.rest, apiId);
  return authorizerText(method, authorizers.data);
}

export function MethodOverview({
  method,
  path,
  apiId,
}: {
  method: Method;
  path: string;
  apiId: string;
}) {
  const integration = method.methodIntegration;
  return (
    <Tabs
      tabs={[
        {
          id: METHOD_TABS.overview,
          label: "Overview",
          content: (
            <KeyValuePairs
              columns={1}
              items={[
                {
                  label: "Integration",
                  value: <IntegrationValue type={integration?.type} uri={integration?.uri} />,
                },
                ...(integration?.uri
                  ? [{ label: "URI", value: <BreakableText text={integration.uri} /> }]
                  : []),
                { label: "Authorizer", value: <AuthorizerValue method={method} apiId={apiId} /> },
                { label: "API key", value: method.apiKeyRequired ? "Required" : "Not required" },
              ]}
            />
          ),
        },
        {
          id: METHOD_TABS.test,
          label: "Test",
          // key: đổi method thì form Test về trống
          content: (
            <MethodTest
              key={`${path}:${method.httpMethod}`}
              apiId={apiId}
              path={path}
              method={method}
            />
          ),
        },
      ]}
    />
  );
}
