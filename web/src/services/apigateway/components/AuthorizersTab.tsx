import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Popover from "@cloudscape-design/components/popover";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { cognitoRoutes } from "@localconsole/core/cognito";
import {
  AUTHORIZER_TYPES,
  INTEGRATION_TYPES,
  JWT_ISSUER_LABEL,
  LOCAL_ISSUER_POPOVER,
  authorizerTypeLabel,
  cognitoPoolIdOfProviderArn,
  isLocalIssuer,
  type AuthorizerRow,
  type ApiVersion,
} from "@localconsole/core/apigateway";
import { useAuthorizers } from "../hooks/useApiDetail.ts";
import { IntegrationValue } from "./IntegrationValue.tsx";

export function AuthorizersTab({ version, apiId }: { version: ApiVersion; apiId: string }) {
  const authorizers = useAuthorizers(version, apiId);
  const follow = useFollow();
  const { flociPublicUrl, flociInternalUrl } = useLoadedConfig();

  const target = (a: AuthorizerRow) => {
    if (a.type === AUTHORIZER_TYPES.cognito) {
      return a.providerArns?.map((arn) => {
        const poolId = cognitoPoolIdOfProviderArn(arn);
        return (
          <div key={arn}>
            {poolId ? (
              <Link href={cognitoRoutes.pool(poolId)} onFollow={follow}>
                {poolId}
              </Link>
            ) : (
              arn
            )}
          </div>
        );
      });
    }
    if (a.type === AUTHORIZER_TYPES.jwt && a.issuer) {
      const text = JWT_ISSUER_LABEL + a.issuer;
      return isLocalIssuer(a.issuer, [flociPublicUrl, flociInternalUrl]) ? (
        // Giữ trigger dạng text (là button) để mở được bằng bàn phím; custom chỉ là span
        <Popover content={LOCAL_ISSUER_POPOVER} dismissButton={false}>
          <StatusIndicator type='warning'>{text}</StatusIndicator>
        </Popover>
      ) : (
        text
      );
    }
    // Lambda: authorizerUri là ARN invoke
    return a.target ? <IntegrationValue type={INTEGRATION_TYPES.aws} uri={a.target} /> : null;
  };

  const columns: TableProps.ColumnDefinition<AuthorizerRow>[] = [
    { id: "name", header: "Name", isRowHeader: true, cell: (a) => a.name },
    { id: "type", header: "Type", cell: (a) => authorizerTypeLabel(a.type) },
    { id: "identity", header: "Identity source", cell: (a) => a.identitySource },
    { id: "target", header: "Target", cell: target },
  ];

  return (
    <Table
      variant='container'
      trackBy='id'
      items={authorizers.data ?? []}
      loading={authorizers.isLoading}
      loadingText='Loading authorizers'
      columnDefinitions={columns}
      empty={emptyOrError(authorizers, <EmptyState title='No authorizers' />)}
      header={
        <Header counter={authorizers.data ? `(${authorizers.data.length})` : undefined}>
          Authorizers
        </Header>
      }
    />
  );
}
