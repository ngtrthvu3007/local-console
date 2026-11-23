import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { UserPoolClientType, UserPoolType } from "@aws-sdk/client-cognito-identity-provider";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs, { type KeyValuePairsProps } from "@cloudscape-design/components/key-value-pairs";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { ActionBar } from "@shared/components/ActionBar.tsx";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { ITEM_LIST_WIDTH_PX, NOT_AVAILABLE } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { hostedUiBlocker } from "../auth.ts";
import { OpenHostedUiModal } from "../components/OpenHostedUiModal.tsx";
import { CLIENT_GENERAL_COLUMNS } from "../constants.ts";
import { isCognitoMissing } from "../hooks/useCognito.ts";
import { useClient, useDeleteClients } from "../hooks/useClients.ts";
import { useUserPool } from "../hooks/usePools.ts";
import { POOL_TABS, cognitoRoutes, poolCrumbs } from "../routes.ts";

const GENERAL_COLUMNS = CLIENT_GENERAL_COLUMNS;
// Secret 51 ký tự không có chỗ ngắt: cho xuống dòng, kẻo tràn trang
const WRAP_STYLE = { overflowWrap: "anywhere", minWidth: 0 } as const;
const SECRET_MASK = "••••••••••••••••";

// Danh sách rỗng hiện NOT_AVAILABLE thay vì ô trống
const listValue = (values?: string[]) =>
  values?.length ? (
    <SpaceBetween size='xxs'>
      {values.map((value) => (
        <span key={value}>{value}</span>
      ))}
    </SpaceBetween>
  ) : (
    NOT_AVAILABLE
  );

function ClientView({ client, pool, poolId }: { client: UserPoolClientType; pool?: UserPoolType; poolId: string }) {
  const follow = useFollow();
  const navigate = useNavigate();
  const { ref, compact } = useIsCompact(ITEM_LIST_WIDTH_PX);
  const deleteClients = useDeleteClients(poolId);
  const [deleting, setDeleting] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [openingHostedUi, setOpeningHostedUi] = useState(false);
  // Pool chưa tải xong thì coi như chưa có domain: nút khóa thay vì mở URL hỏng
  const hostedUiReason = hostedUiBlocker({
    hasDomain: Boolean(pool?.Domain),
    callbackUrls: client.CallbackURLs ?? [],
    oauthFlows: client.AllowedOAuthFlows ?? [],
  });
  const clientId = client.ClientId ?? "";
  const name = client.ClientName ?? clientId;

  const secretValue = client.ClientSecret ? (
    <SpaceBetween size='xs' direction='horizontal' alignItems='center'>
      <code style={WRAP_STYLE}>{showSecret ? client.ClientSecret : SECRET_MASK}</code>
      <Button variant='inline-link' onClick={() => setShowSecret((shown) => !shown)}>
        {showSecret ? "Hide" : "Show"}
      </Button>
      <CopyButton text={client.ClientSecret} variant='icon' label='Copy client secret' />
    </SpaceBetween>
  ) : (
    NOT_AVAILABLE
  );

  const generalItems: KeyValuePairsProps.Item[] = [
    {
      label: "Client ID",
      value: (
        <SpaceBetween size='xs' direction='horizontal' alignItems='center'>
          <code style={WRAP_STYLE}>{clientId}</code>
          <CopyButton text={clientId} variant='icon' label='Copy client ID' />
        </SpaceBetween>
      ),
    },
    { label: "Client secret", value: secretValue },
    { label: "Auth flows", value: listValue(client.ExplicitAuthFlows) },
  ];
  const oauthItems: KeyValuePairsProps.Item[] = [
    { label: "Callback URLs", value: listValue(client.CallbackURLs) },
    { label: "Sign-out URLs", value: listValue(client.LogoutURLs) },
    { label: "OAuth flows", value: listValue(client.AllowedOAuthFlows) },
    { label: "OAuth scopes", value: listValue(client.AllowedOAuthScopes) },
    {
      label: "Identity providers",
      value: client.SupportedIdentityProviders?.length ? (
        <Link href={cognitoRoutes.pool(poolId, POOL_TABS.providers)} onFollow={follow}>
          {client.SupportedIdentityProviders.join(", ")}
        </Link>
      ) : (
        NOT_AVAILABLE
      ),
    },
  ];

  return (
    <div ref={ref}>
      <ContentLayout
        header={
          <Header
            variant='h1'
            actions={
              <ActionBar
                compact={compact}
                actions={[
                  { id: "delete", text: "Delete", onClick: () => setDeleting(true) },
                  {
                    id: "open-hosted-ui",
                    text: "Open hosted UI",
                    disabled: Boolean(hostedUiReason),
                    disabledReason: hostedUiReason,
                    onClick: () => setOpeningHostedUi(true),
                  },
                  { id: "edit", text: "Edit", primary: true, href: cognitoRoutes.editClient(poolId, clientId) },
                ]}
              />
            }
          >
            {name}
          </Header>
        }
      >
        <SpaceBetween size='l'>
          <Container header={<Header variant='h2'>General</Header>}>
            <KeyValuePairs columns={compact ? 1 : GENERAL_COLUMNS} items={generalItems} />
          </Container>
          <Container header={<Header variant='h2'>OAuth</Header>}>
            <KeyValuePairs columns={compact ? 1 : GENERAL_COLUMNS} items={oauthItems} />
          </Container>
        </SpaceBetween>
      </ContentLayout>
      {openingHostedUi && <OpenHostedUiModal client={client} onDismiss={() => setOpeningHostedUi(false)} />}
      {deleting && (
        <ConfirmModal
          visible
          header='Delete app client?'
          confirmText={CONFIRM_DELETE}
          actionText='Delete'
          loading={deleteClients.isPending}
          onDismiss={() => setDeleting(false)}
          onConfirm={() =>
            deleteClients.mutate(
              [clientId],
              notifyBulkOutcome({
                success: (result) => `Deleted ${pluralize(result.count, "app client")}`,
                errorHeader: "Couldn't delete",
                then: () => navigate(cognitoRoutes.pool(poolId, POOL_TABS.clients)),
              }),
            )
          }
        >
          {name}
        </ConfirmModal>
      )}
    </div>
  );
}

export function ClientDetail() {
  const { poolId = "", clientId = "" } = useParams();
  const client = useClient(poolId, clientId);
  const pool = useUserPool(poolId);

  useBreadcrumbs([
    ...poolCrumbs(poolId, pool.data?.Name ?? poolId),
    { text: client.data?.ClientName ?? clientId, href: cognitoRoutes.client(poolId, clientId) },
  ]);

  const state = pageState(client, {
    ready: Boolean(client.data),
    notFound: client.isError && isCognitoMissing(client.error),
    title: `App client ${clientId} not found`,
    backHref: cognitoRoutes.pool(poolId, POOL_TABS.clients),
    backText: "View app clients",
  });
  if (state || !client.data) return state;

  return <ClientView client={client.data} pool={pool.data} poolId={poolId} />;
}
