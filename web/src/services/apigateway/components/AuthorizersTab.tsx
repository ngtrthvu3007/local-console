import { useState } from "react";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Popover from "@cloudscape-design/components/popover";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
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
  type ApiType,
  type ApiVersion,
} from "@localconsole/core/apigateway";
import { useAuthorizers, useDeleteAuthorizer } from "../hooks/useApiDetail.ts";
import { AuthorizerModal } from "./AuthorizerModal.tsx";
import { IntegrationValue } from "./IntegrationValue.tsx";

type Dialog = "create" | "edit" | "delete";

interface Props {
  version: ApiVersion;
  apiId: string;
  apiType: ApiType;
}

export function AuthorizersTab({ version, apiId, apiType }: Props) {
  const authorizers = useAuthorizers(version, apiId);
  const deleteAuthorizer = useDeleteAuthorizer(version, apiId);
  const follow = useFollow();
  const [selected, setSelected] = useState<AuthorizerRow[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  // Lấy lại từ dữ liệu mới: đổi tên xong, dòng đã chọn vẫn là bản cũ
  const current = authorizers.data?.find((row) => row.id === selected[0]?.id);
  const close = () => setDialog(null);
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

  const confirmDelete = (authorizer: AuthorizerRow) =>
    deleteAuthorizer.mutate(
      authorizer.id,
      notifyOutcome({
        success: `Deleted authorizer ${authorizer.name}`,
        errorHeader: `Couldn't delete authorizer ${authorizer.name}`,
        then: () => {
          close();
          setSelected([]);
        },
      }),
    );

  return (
    <>
      <Table
        variant='container'
        trackBy='id'
        selectionType='single'
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        ariaLabels={selectionLabels<AuthorizerRow>("authorizer", (row) => row.name)}
        items={authorizers.data ?? []}
        loading={authorizers.isLoading}
        loadingText='Loading authorizers'
        columnDefinitions={columns}
        empty={emptyOrError(authorizers, <EmptyState title='No authorizers' />)}
        header={
          <Header
            counter={authorizers.data ? `(${authorizers.data.length})` : undefined}
            actions={
              <SpaceBetween size='xs' direction='horizontal'>
                <Button disabled={!current} onClick={() => setDialog("edit")}>
                  Edit
                </Button>
                <Button disabled={!current} onClick={() => setDialog("delete")}>
                  Delete
                </Button>
                <Button onClick={() => setDialog("create")}>Create authorizer</Button>
              </SpaceBetween>
            }
          >
            Authorizers
          </Header>
        }
      />
      {(dialog === "create" || dialog === "edit") && (
        <AuthorizerModal
          version={version}
          apiId={apiId}
          apiType={apiType}
          existingNames={(authorizers.data ?? []).map((row) => row.name)}
          current={dialog === "edit" ? current : undefined}
          onDismiss={close}
        />
      )}
      {dialog === "delete" && current && (
        <ConfirmModal
          visible
          header={`Delete authorizer ${current.name}?`}
          actionText='Delete'
          loading={deleteAuthorizer.isPending}
          onConfirm={() => confirmDelete(current)}
          onDismiss={close}
        >
          Methods and routes using it must be changed first.
        </ConfirmModal>
      )}
    </>
  );
}
