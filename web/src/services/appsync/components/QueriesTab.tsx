import { lazy, Suspense, useState } from "react";
import type { GraphqlApi } from "@aws-sdk/client-appsync";
import type { UserPoolClientType } from "@aws-sdk/client-cognito-identity-provider";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import Link from "@cloudscape-design/components/link";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import { proxyEndpoint } from "@shared/aws.ts";
import { CodeSnippet } from "@shared/components/CodeSnippet.tsx";
import { DETAIL_SEPARATOR, errorMessage, reformatJson } from "@localconsole/core/shared";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useClients } from "../../cognito/hooks/useClients.ts";
import { useSignIn } from "../../cognito/hooks/useTestSignIn.ts";
import { cognitoRoutes } from "@localconsole/core/cognito";
import {
  authTypesOf,
  managedPoolOf,
  operationsOf,
  parseVariables,
  queryAlert,
  tokenExpired,
  AUTH_DIRECTIVES,
  AUTH_LABELS,
  AUTH_TYPES,
  QUERY_ALERTS,
  type AuthType,
  graphqlRequest,
  type QueryAuth,
  isValidKey,
  API_TABS,
  appsyncRoutes,
} from "@localconsole/core/appsync";
import { useApiKeys } from "../hooks/useApiKeys.ts";

const CodeEditor = lazy(() => import("@shared/components/CodeEditor.tsx"));
const QUERY_EDITOR_HEIGHT_PX = 240;
const VARIABLES_EDITOR_HEIGHT_PX = 120;

interface QueryResponse {
  status: number;
  ms: number;
  body: string;
}

function CognitoSignIn({
  poolId,
  token,
  onToken,
}: {
  poolId: string;
  token?: { username: string };
  onToken: (token?: { username: string; idToken: string }) => void;
}) {
  const follow = useFollow();
  const clients = useClients(poolId);
  const signIn = useSignIn();
  const [clientId, setClientId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const client: UserPoolClientType | undefined = clients.data?.find(
    (item) => item.ClientId === clientId,
  );

  if (token) {
    return (
      <Box>
        Signed in as {token.username}
        {DETAIL_SEPARATOR}
        <Link onFollow={() => onToken(undefined)}>Sign out</Link>
      </Box>
    );
  }

  const submit = () =>
    client &&
    signIn.mutate(
      { client, username, password },
      {
        onSuccess: (result) => {
          if (result.kind === "tokens" && result.tokens.IdToken) {
            setError(undefined);
            onToken({ username, idToken: result.tokens.IdToken });
          } else setError("Finish signing in on the user pool page.");
        },
        onError: (signInError) => setError(errorMessage(signInError)),
      },
    );

  return (
    <SpaceBetween size='s'>
      <ColumnLayout columns={3} minColumnWidth={160}>
        <FormField label='App client'>
          <Select
            selectedOption={
              client
                ? { value: client.ClientId, label: client.ClientName ?? client.ClientId }
                : null
            }
            options={(clients.data ?? []).map((item) => ({
              value: item.ClientId,
              label: item.ClientName ?? item.ClientId,
            }))}
            placeholder='Choose an app client'
            statusType={clients.isLoading ? "loading" : "finished"}
            onChange={({ detail }) => setClientId(detail.selectedOption.value ?? "")}
          />
        </FormField>
        <FormField label='Username'>
          <Input value={username} onChange={({ detail }) => setUsername(detail.value)} />
        </FormField>
        <FormField label='Password'>
          <Input
            type='password'
            value={password}
            onChange={({ detail }) => setPassword(detail.value)}
          />
        </FormField>
      </ColumnLayout>
      <Button
        disabled={!client || !username || !password}
        loading={signIn.isPending}
        onClick={submit}
      >
        Sign in
      </Button>
      {error && (
        <Alert type='error'>
          {error}{" "}
          <Link href={cognitoRoutes.pool(poolId)} onFollow={follow}>
            Open the user pool
          </Link>
        </Alert>
      )}
    </SpaceBetween>
  );
}

export interface QueryDraft {
  query: string;
  variables: string;
}

interface Props {
  api: GraphqlApi;
  // Giữ ở trang chi tiết: đổi tab (vd sang Settings tạo API key) không mất query đang gõ
  draft: QueryDraft;
  onDraftChange: (draft: QueryDraft) => void;
}

export function QueriesTab({ api, draft, onDraftChange }: Props) {
  const follow = useFollow();
  const { region } = useLoadedConfig();
  const apiId = api.apiId ?? "";
  const keys = useApiKeys(apiId);
  const authTypes = authTypesOf(api);
  const [authType, setAuthType] = useState<AuthType | undefined>(authTypes[0]);
  const [keyId, setKeyId] = useState<string>();
  const [cognitoToken, setCognitoToken] = useState<{ username: string; idToken: string }>();
  const { query, variables } = draft;
  const setQuery = (value: string) => onDraftChange({ ...draft, query: value });
  const setVariables = (value: string) => onDraftChange({ ...draft, variables: value });
  const [operationName, setOperationName] = useState<string>();
  const [response, setResponse] = useState<QueryResponse>();
  const [alert, setAlert] = useState<string>();
  const [running, setRunning] = useState(false);

  const validKeys = (keys.data ?? []).filter((key) => isValidKey(key, Date.now()));
  const chosenKey = validKeys.find((key) => key.id === keyId) ?? validKeys[0];
  const operations = operationsOf(query);
  const operation = operations.find((item) => item.name === operationName) ?? operations[0];
  const parsedVariables = parseVariables(variables);
  const poolId = managedPoolOf(api);

  if (!authType) {
    return (
      <Alert type='info'>
        The console can&apos;t call this API: it uses OpenID Connect or Lambda authorization.
      </Alert>
    );
  }

  const auth = (): QueryAuth | undefined => {
    if (authType === AUTH_TYPES.apiKey)
      return chosenKey?.id ? { type: authType, key: chosenKey.id } : undefined;
    if (authType === AUTH_TYPES.cognito)
      return cognitoToken ? { type: authType, token: cognitoToken.idToken } : undefined;
    return { type: authType, region };
  };
  const requestAuth = auth();

  const run = async () => {
    if (!requestAuth || parsedVariables.error) return;
    if (operation?.kind === "subscription") {
      setAlert(QUERY_ALERTS.subscription);
      return;
    }
    // Token Cognito chỉ sống khoảng 1 giờ: hết hạn thì đăng xuất để hiện lại form đăng nhập
    if (
      cognitoToken &&
      authType === AUTH_TYPES.cognito &&
      tokenExpired(cognitoToken.idToken, Date.now())
    ) {
      setCognitoToken(undefined);
      setAlert(QUERY_ALERTS.signInExpired);
      return;
    }

    setAlert(undefined);
    setRunning(true);
    const body = JSON.stringify({
      query,
      variables: parsedVariables.value,
      operationName: operation?.name,
    });

    try {
      const { url, headers } = await graphqlRequest({
        graphqlUri: api.uris?.GRAPHQL ?? "",
        proxyBase: proxyEndpoint(),
        auth: requestAuth,
        body,
      });
      const started = performance.now();
      const result = await fetch(url, { method: "POST", headers, body });
      const text = await result.text();
      const ms = Math.round(performance.now() - started);
      setResponse({ status: result.status, ms, body: reformatJson(text) });
      setAlert(queryAlert(result.status, text));
    } catch (error) {
      setAlert(errorMessage(error));
    } finally {
      setRunning(false);
    }
  };

  const authOptions = authTypes.map((type) => ({ value: type, label: AUTH_LABELS[type] }));
  const header = (
    <Header
      variant='h2'
      description='Runs against the API in Floci, like your app would.'
      actions={
        <Button
          variant='primary'
          disabled={!requestAuth || Boolean(parsedVariables.error)}
          loading={running}
          onClick={() => void run()}
        >
          Run
        </Button>
      }
    >
      Query
    </Header>
  );

  return (
    <SpaceBetween size='l'>
      <Container header={header}>
        <SpaceBetween size='m'>
          <ColumnLayout columns={2} minColumnWidth={200}>
            <FormField
              label='Authorization'
              description={
                authType !== api.authenticationType &&
                `Additional authorization: fields need ${AUTH_DIRECTIVES[authType]} in the schema.`
              }
            >
              <Select
                selectedOption={authOptions.find((option) => option.value === authType) ?? null}
                options={authOptions}
                onChange={({ detail }) =>
                  setAuthType(authTypes.find((type) => type === detail.selectedOption.value))
                }
              />
            </FormField>
            {authType === AUTH_TYPES.apiKey && (
              <FormField
                label='API key'
                description={
                  validKeys.length === 0 && (
                    <>
                      No valid API key.{" "}
                      <Link href={appsyncRoutes.api(apiId, API_TABS.settings)} onFollow={follow}>
                        Create one in Settings
                      </Link>
                    </>
                  )
                }
              >
                <Select
                  selectedOption={
                    chosenKey?.id ? { value: chosenKey.id, label: chosenKey.id } : null
                  }
                  options={validKeys.map((key) => ({
                    value: key.id,
                    label: key.id,
                    description: key.description,
                  }))}
                  placeholder='Choose an API key'
                  onChange={({ detail }) => setKeyId(detail.selectedOption.value)}
                />
              </FormField>
            )}
          </ColumnLayout>
          {authType === AUTH_TYPES.cognito && poolId && (
            <CognitoSignIn poolId={poolId} token={cognitoToken} onToken={setCognitoToken} />
          )}
          {operations.length > 1 && (
            <FormField label='Operation'>
              <Select
                selectedOption={operation ? { value: operation.name, label: operation.name } : null}
                options={operations.map((item) => ({
                  value: item.name,
                  label: item.name ?? item.kind,
                }))}
                onChange={({ detail }) => setOperationName(detail.selectedOption.value)}
              />
            </FormField>
          )}
          <Suspense fallback={<Spinner />}>
            <CodeEditor
              value={query}
              onChange={setQuery}
              language='graphqlschema'
              height={QUERY_EDITOR_HEIGHT_PX}
            />
            <ExpandableSection headerText='Variables (JSON)' defaultExpanded={Boolean(variables)}>
              <FormField errorText={parsedVariables.error}>
                <CodeEditor
                  value={variables}
                  onChange={setVariables}
                  language='json'
                  height={VARIABLES_EDITOR_HEIGHT_PX}
                />
              </FormField>
            </ExpandableSection>
          </Suspense>
        </SpaceBetween>
      </Container>
      {alert && <Alert type='warning'>{alert}</Alert>}
      {response && (
        <Container
          header={
            <Header
              variant='h2'
              description={`HTTP ${response.status}${DETAIL_SEPARATOR}${response.ms} ms`}
            >
              Response
            </Header>
          }
        >
          <CodeSnippet code={response.body} wrap />
        </Container>
      )}
    </SpaceBetween>
  );
}
