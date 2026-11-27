import { useState } from "react";
import type { GraphqlApi } from "@aws-sdk/client-appsync";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { isNotFoundError, NOT_AVAILABLE } from "@localconsole/core/shared";
import { ConnectCard } from "@shared/components/CodeSamples.tsx";
import { copyable } from "@shared/components/CopyButton.tsx";
import { FormInput } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { ReferenceLink } from "@shared/components/MissingReference.tsx";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useUserPool } from "../../cognito/hooks/usePools.ts";
import { cognitoRoutes } from "@localconsole/core/cognito";
import {
  authLabel,
  authTypesOf,
  baseUpdate,
  localEndpoint,
  managedPoolOf,
  EDITABLE_AUTH_TYPES,
  renameSchema,
  isValidKey,
} from "@localconsole/core/appsync";
import { apiSample } from "../codeSamples.ts";
import { useApiKeys } from "../hooks/useApiKeys.ts";
import { useUpdateApi } from "../hooks/useApis.ts";
import { ApiKeysTable } from "./ApiKeysTable.tsx";
import { AuthorizationModal } from "./AuthorizationModal.tsx";

const DETAILS_COLUMNS = 2;
const LIST_SEPARATOR = ", ";

// Chỉ mount khi mở
function RenameModal({ api, onDismiss }: { api: GraphqlApi; onDismiss: () => void }) {
  const update = useUpdateApi();
  const form = useZodForm(renameSchema, { name: api.name ?? "" });

  const submit = form.handleSubmit(({ name }) =>
    update.mutate(
      { ...baseUpdate(api), name },
      notifyOutcome({
        success: `Renamed to ${name}`,
        errorHeader: "Couldn't rename",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Edit details'
      actionText='Save'
      loading={update.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput control={form.control} name='name' label='Name' autoFocus />
    </FormModal>
  );
}

function UserPoolLink({ poolId }: { poolId: string }) {
  const pool = useUserPool(poolId);
  return (
    <ReferenceLink
      name={poolId}
      href={cognitoRoutes.pool(poolId)}
      missing={Boolean(pool.error) && isNotFoundError(pool.error)}
    />
  );
}

export function SettingsTab({ api, compact }: { api: GraphqlApi; compact: boolean }) {
  const { flociPublicUrl } = useLoadedConfig();
  const keys = useApiKeys(api.apiId ?? "");
  const [editing, setEditing] = useState<"details" | "authorization" | null>(null);
  const graphqlUri = api.uris?.GRAPHQL ?? "";
  const endpoint = graphqlUri ? localEndpoint(flociPublicUrl, graphqlUri) : "";
  const poolId = managedPoolOf(api);
  const callable = authTypesOf(api);
  // OIDC / Lambda authorizer: console chỉ hiện, sửa bằng CDK
  const authEditable = EDITABLE_AUTH_TYPES.includes(api.authenticationType ?? "");
  const firstKey = keys.data?.find((key) => isValidKey(key, Date.now()))?.id;

  return (
    <SpaceBetween size='l'>
      <Container
        header={
          <Header
            variant='h2'
            actions={<Button onClick={() => setEditing("details")}>Edit</Button>}
          >
            Details
          </Header>
        }
      >
        <KeyValuePairs
          columns={compact ? 1 : DETAILS_COLUMNS}
          items={[
            { label: "Name", value: api.name },
            { label: "API ID", value: copyable(api.apiId) },
            { label: "ARN", value: copyable(api.arn) },
            {
              label: "GraphQL endpoint",
              value: (
                <div>
                  {copyable(endpoint)}
                  <Box variant='small' display='block' color='text-body-secondary'>
                    Inside the same compose: {graphqlUri}
                  </Box>
                </div>
              ),
            },
          ]}
        />
      </Container>
      <Container
        header={
          <Header
            variant='h2'
            actions={
              <Button
                disabled={!authEditable}
                disabledReason='Edit this authorization with CDK.'
                onClick={() => setEditing("authorization")}
              >
                Edit
              </Button>
            }
          >
            Authorization
          </Header>
        }
      >
        <KeyValuePairs
          columns={compact ? 1 : DETAILS_COLUMNS}
          items={[
            { label: "Default", value: authLabel(api.authenticationType) },
            {
              label: "Additional",
              value:
                (api.additionalAuthenticationProviders ?? [])
                  .map((provider) => authLabel(provider.authenticationType))
                  .join(LIST_SEPARATOR) || NOT_AVAILABLE,
            },
            ...(poolId ? [{ label: "User pool", value: <UserPoolLink poolId={poolId} /> }] : []),
          ]}
        />
      </Container>
      <ApiKeysTable apiId={api.apiId ?? ""} compact={compact} />
      <ConnectCard sample={apiSample({ endpoint, authType: callable[0], apiKey: firstKey })} />
      {editing === "details" && <RenameModal api={api} onDismiss={() => setEditing(null)} />}
      {editing === "authorization" && (
        <AuthorizationModal api={api} onDismiss={() => setEditing(null)} />
      )}
    </SpaceBetween>
  );
}
