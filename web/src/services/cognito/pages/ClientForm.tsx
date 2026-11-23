import { Controller, useFieldArray, useWatch, type Control } from "react-hook-form";
import { useNavigate, useParams } from "react-router";
import AttributeEditor from "@cloudscape-design/components/attribute-editor";
import Checkbox from "@cloudscape-design/components/checkbox";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Tiles from "@cloudscape-design/components/tiles";
import { FormInput, FormMultiselect } from "@shared/components/form/FormFields.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  AUTH_FLOWS,
  CLIENT_SECRET_MODES,
  COGNITO_PROVIDER,
  OAUTH_FLOWS,
  OAUTH_SCOPES,
} from "../constants.ts";
import { useClient, useCreateClient, useUpdateClient } from "../hooks/useClients.ts";
import { isCognitoMissing } from "../hooks/useCognito.ts";
import { useUserPool } from "../hooks/usePools.ts";
import { useProviders } from "../hooks/useProviders.ts";
import { POOL_TABS, cognitoRoutes, poolCrumbs } from "../routes.ts";
import { clientFormOf, clientSchema, type ClientForm as ClientFormValues } from "../schemas.ts";

const SECRET_ITEMS = [
  {
    value: CLIENT_SECRET_MODES.none,
    label: "No secret",
    description: "For web and mobile apps that can't keep a secret.",
  },
  {
    value: CLIENT_SECRET_MODES.generate,
    label: "Generate secret",
    description: "For backend apps. Can't be changed after the client is created.",
  },
];

// Giá trị có sẵn của client mà danh sách chuẩn không có (vd scope custom) vẫn phải hiện để Edit không gỡ
const optionsWith = (standard: readonly string[], current: string[]) =>
  [...new Set([...standard, ...current])].map((value) => ({ value, label: value }));

const EMPTY_URL = { value: "" };

function UrlListField({
  control,
  name,
  label,
  description,
  addText,
  errorText,
}: {
  control: Control<ClientFormValues>;
  name: "callbackUrls" | "logoutUrls";
  label: string;
  description?: string;
  addText: string;
  errorText?: string;
}) {
  const rows = useFieldArray({ control, name });
  return (
    <FormField label={label} description={description} errorText={errorText}>
      <AttributeEditor
        items={rows.fields}
        definition={[
          {
            label: "URL",
            control: (_row, index) => (
              <Controller
                control={control}
                name={`${name}.${index}.value`}
                render={({ field, fieldState }) => (
                  <FormField errorText={fieldState.error?.message}>
                    <Input
                      ariaLabel={`${label} ${index + 1}`}
                      invalid={Boolean(fieldState.error)}
                      value={field.value}
                      onChange={({ detail }) => field.onChange(detail.value)}
                    />
                  </FormField>
                )}
              />
            ),
          },
        ]}
        addButtonText={addText}
        removeButtonText='Remove'
        empty='No URLs.'
        onAddButtonClick={() => rows.append(EMPTY_URL)}
        onRemoveButtonClick={({ detail }) => rows.remove(detail.itemIndex)}
      />
    </FormField>
  );
}

function ClientFormView({ poolId, clientId, initial }: { poolId: string; clientId?: string; initial: ClientFormValues }) {
  const follow = useFollow();
  const navigate = useNavigate();
  const create = useCreateClient(poolId);
  const update = useUpdateClient(poolId, clientId ?? "");
  const providers = useProviders(poolId);
  const providerNames = (providers.data ?? []).flatMap((provider) => (provider.ProviderName ? [provider.ProviderName] : []));
  const form = useZodForm(clientSchema, initial);
  const oauthFlows = useWatch({ control: form.control, name: "oauthFlows" });
  const editing = Boolean(clientId);
  const pending = create.isPending || update.isPending;
  const backHref = clientId ? cognitoRoutes.client(poolId, clientId) : cognitoRoutes.pool(poolId, POOL_TABS.clients);
  const errors = form.formState.errors;

  const submit = form.handleSubmit((values) => {
    const options = {
      success: `${editing ? "Saved" : "Created"} app client ${values.name}`,
      errorHeader: `Couldn't ${editing ? "save" : "create"} ${values.name}`,
    };
    if (clientId)
      update.mutate(values, notifyOutcome({ ...options, then: () => navigate(cognitoRoutes.client(poolId, clientId)) }));
    else
      create.mutate(
        values,
        notifyOutcome({ ...options, then: (newClientId: string) => navigate(cognitoRoutes.client(poolId, newClientId)) }),
      );
  });

  const flowItems = Object.entries(OAUTH_FLOWS);
  // client_credentials có sẵn (tạo bằng script / IaC) không có ô, được giữ nguyên trong form
  const keptFlows = oauthFlows.filter((flow) => !(flow in OAUTH_FLOWS));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Form
        header={<Header variant='h1'>{editing ? "Edit app client" : "Create app client"}</Header>}
        actions={
          <ResponsiveActions footer>
            <Button variant='link' href={backHref} onFollow={follow}>
              Cancel
            </Button>
            <Button variant='primary' formAction='submit' loading={pending}>
              {editing ? "Save app client" : "Create app client"}
            </Button>
          </ResponsiveActions>
        }
      >
        <SpaceBetween size='l'>
          <Container header={<Header variant='h2'>General</Header>}>
            <SpaceBetween size='l'>
              <FormInput control={form.control} name='name' label='Name' autoFocus />
              <Controller
                control={form.control}
                name='generateSecret'
                render={({ field }) => (
                  <FormField label='Client secret'>
                    <Tiles
                      items={SECRET_ITEMS.map((item) => ({ ...item, disabled: editing }))}
                      value={field.value ? CLIENT_SECRET_MODES.generate : CLIENT_SECRET_MODES.none}
                      onChange={({ detail }) => field.onChange(detail.value === CLIENT_SECRET_MODES.generate)}
                    />
                  </FormField>
                )}
              />
              <FormMultiselect
                control={form.control}
                name='authFlows'
                label='Auth flows'
                options={optionsWith(AUTH_FLOWS, initial.authFlows)}
              />
            </SpaceBetween>
          </Container>
          <Container header={<Header variant='h2'>OAuth</Header>}>
            <SpaceBetween size='l'>
              <UrlListField
                control={form.control}
                name='callbackUrls'
                label='Callback URLs'
                description='Required to turn on the authorization code or implicit flow.'
                addText='Add callback URL'
                errorText={errors.callbackUrls?.message ?? errors.callbackUrls?.root?.message}
              />
              <UrlListField
                control={form.control}
                name='logoutUrls'
                label='Sign-out URLs'
                addText='Add sign-out URL'
              />
              <Controller
                control={form.control}
                name='oauthFlows'
                render={({ field, fieldState }) => (
                  <FormField
                    errorText={fieldState.error?.message}
                    label='OAuth flows'
                    description={keptFlows.length ? `Kept as is: ${keptFlows.join(", ")}.` : undefined}
                  >
                    <SpaceBetween size='xs'>
                      {flowItems.map(([flow, text]) => (
                        <Checkbox
                          key={flow}
                          checked={field.value.some((value) => value === flow)}
                          onChange={({ detail }) =>
                            field.onChange(
                              detail.checked
                                ? [...field.value, flow]
                                : field.value.filter((value) => value !== flow),
                            )
                          }
                        >
                          {text}
                        </Checkbox>
                      ))}
                    </SpaceBetween>
                  </FormField>
                )}
              />
              <FormMultiselect
                control={form.control}
                name='scopes'
                label='OAuth scopes'
                options={optionsWith(OAUTH_SCOPES, initial.scopes)}
              />
              <FormMultiselect
                control={form.control}
                name='providers'
                label='Identity providers'
                options={optionsWith([COGNITO_PROVIDER, ...providerNames], initial.providers)}
              />
            </SpaceBetween>
          </Container>
        </SpaceBetween>
      </Form>
    </form>
  );
}

export function ClientForm() {
  const { poolId = "", clientId } = useParams();
  const pool = useUserPool(poolId);
  const client = useClient(poolId, clientId ?? "");
  const editing = Boolean(clientId);

  useBreadcrumbs([
    ...poolCrumbs(poolId, pool.data?.Name ?? poolId),
    editing
      ? { text: "Edit app client", href: cognitoRoutes.editClient(poolId, clientId ?? "") }
      : { text: "Create app client", href: cognitoRoutes.createClient(poolId) },
  ]);

  if (!clientId) return <ClientFormView poolId={poolId} initial={clientFormOf()} />;

  const state = pageState(client, {
    ready: Boolean(client.data),
    notFound: client.isError && isCognitoMissing(client.error),
    title: `App client ${clientId} not found`,
    backHref: cognitoRoutes.pool(poolId, POOL_TABS.clients),
    backText: "View app clients",
  });
  if (state || !client.data) return state;

  return <ClientFormView poolId={poolId} clientId={clientId} initial={clientFormOf(client.data)} />;
}
