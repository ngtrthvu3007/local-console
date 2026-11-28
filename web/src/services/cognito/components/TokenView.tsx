import type { AuthenticationResultType } from "@aws-sdk/client-cognito-identity-provider";
import CodeView from "@cloudscape-design/code-view/code-view";
import jsonHighlight from "@cloudscape-design/code-view/highlight/json";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Tabs from "@cloudscape-design/components/tabs";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import {
  MILLISECONDS_PER_SECOND,
  NOT_AVAILABLE,
  formatDate,
  prettyJson,
} from "@localconsole/core/shared";
import { decodeJwt, isExpired, GROUPS_CLAIM, GROUPS_SEPARATOR } from "@localconsole/core/cognito";

// exp / iat của JWT tính bằng giây
const dateOf = (seconds?: number) => formatDate(seconds && seconds * MILLISECONDS_PER_SECOND);

function TokenClaims({ token }: { token: string }) {
  const { header, payload } = decodeJwt(token);
  const hasExpired = payload.exp !== undefined && isExpired(payload.exp, Date.now());

  return (
    <SpaceBetween size='m'>
      <KeyValuePairs
        columns={1}
        items={[
          {
            label: "Expires",
            value: (
              <SpaceBetween size='xs' direction='horizontal'>
                <span>{dateOf(payload.exp)}</span>
                {hasExpired && <StatusIndicator type='warning'>Expired</StatusIndicator>}
              </SpaceBetween>
            ),
          },
          { label: "Issued", value: dateOf(payload.iat) },
          {
            label: GROUPS_CLAIM,
            value: payload[GROUPS_CLAIM]?.join(GROUPS_SEPARATOR) ?? NOT_AVAILABLE,
          },
        ]}
      />
      {/* Copy để ngoài khung code: nó chép token gốc (cho header Authorization), không phải JSON */}
      <CodeView
        content={prettyJson({ header, payload })}
        highlight={jsonHighlight}
        wrapLines
        ariaLabel='Decoded token'
      />
      <CopyButton text={token} label='Copy token' />
    </SpaceBetween>
  );
}

export function TokenView({ tokens }: { tokens: AuthenticationResultType }) {
  const expires = tokens.IdToken ? decodeJwt(tokens.IdToken).payload.exp : undefined;

  return (
    <SpaceBetween size='m'>
      <StatusIndicator type='success'>Signed in · expires {dateOf(expires)}</StatusIndicator>
      <Tabs
        tabs={[
          {
            id: "id",
            label: "ID token",
            content: tokens.IdToken && <TokenClaims token={tokens.IdToken} />,
          },
          {
            id: "access",
            label: "Access token",
            content: tokens.AccessToken && <TokenClaims token={tokens.AccessToken} />,
          },
        ]}
      />
      <KeyValuePairs
        columns={1}
        items={[{ label: "Refresh token", value: <CopyButton text={tokens.RefreshToken} /> }]}
      />
    </SpaceBetween>
  );
}
