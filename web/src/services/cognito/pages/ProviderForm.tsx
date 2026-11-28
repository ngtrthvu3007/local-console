import { useFieldArray, useWatch, type Control } from "react-hook-form";
import { useNavigate, useParams } from "react-router";
import Alert from "@cloudscape-design/components/alert";
import AttributeEditor from "@cloudscape-design/components/attribute-editor";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import { FormInput, FormSelect, FormTiles } from "@shared/components/form/FormFields.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { HOST_FROM_CONTAINER, isLocalUrl } from "../../sns/constants.ts";
import { HOSTED_UI_PATHS, LOCKED_ATTRIBUTES, PROVIDER_TYPES } from "../constants.ts";
import { isCognitoMissing } from "../hooks/useCognito.ts";
import { useUserPool } from "../hooks/usePools.ts";
import { useCreateProvider, useProvider, useUpdateProvider } from "../hooks/useProviders.ts";
import { POOL_TABS, cognitoRoutes, poolCrumbs } from "../routes.ts";
import {
  providerEditSchema,
  providerFormOf,
  providerSchema,
  toProviderFields,
  type ProviderForm as ProviderFormValues,
} from "../schemas.ts";

const TYPE_ITEMS = [
  { value: PROVIDER_TYPES.OIDC, label: "OIDC" },
  { value: PROVIDER_TYPES.Google, label: "Google" },
];

// Floci gọi 3 URL này từ trong container; authorize URL mở trong trình duyệt nên localhost vẫn đúng
const OIDC_URL_FIELDS = [
  { name: "issuer", label: "Issuer URL", calledFromContainer: false },
  { name: "authorizeUrl", label: "Authorize URL", calledFromContainer: false },
  { name: "tokenUrl", label: "Token URL", calledFromContainer: true },
  { name: "attributesUrl", label: "Userinfo URL", calledFromContainer: true },
  { name: "jwksUri", label: "JWKS URL", calledFromContainer: true },
] as const;

const EMPTY_MAPPING = { poolAttribute: "", idpClaim: "" };

function AttachButton({ poolId }: { poolId: string }) {
  const follow = useFollow();

  return (
    <Button href={cognitoRoutes.pool(poolId, POOL_TABS.clients)} onFollow={follow}>
      Attach to an app client
    </Button>
  );
}

function OidcUrlField({
  control,
  field,
}: {
  control: Control<ProviderFormValues>;
  field: (typeof OIDC_URL_FIELDS)[number];
}) {
  const url = useWatch({ control, name: field.name });

  return (
    <SpaceBetween size='xs'>
      <FormInput control={control} name={field.name} label={field.label} />
      {field.calledFromContainer && isLocalUrl(url) && (
        <Alert type='warning'>
          From the Floci container, this URL points at Floci, not at your machine. Use{" "}
          {HOST_FROM_CONTAINER} instead.
        </Alert>
      )}
    </SpaceBetween>
  );
}

function MappingField({
  control,
  attributes,
}: {
  control: Control<ProviderFormValues>;
  attributes: string[];
}) {
  const rows = useFieldArray({ control, name: "mapping" });
  const options = attributes.map((value) => ({ value, label: value }));

  return (
    <AttributeEditor
      items={rows.fields}
      definition={[
        {
          label: "User pool attribute",
          control: (_row, index) => (
            <FormSelect
              control={control}
              name={`mapping.${index}.poolAttribute`}
              options={options}
            />
          ),
        },
        {
          label: "IdP claim",
          control: (_row, index) => (
            <FormInput control={control} name={`mapping.${index}.idpClaim`} />
          ),
        },
      ]}
      addButtonText='Add mapping'
      removeButtonText='Remove'
      empty='No attribute mapping.'
      onAddButtonClick={() => rows.append(EMPTY_MAPPING)}
      onRemoveButtonClick={({ detail }) => rows.remove(detail.itemIndex)}
    />
  );
}

function ProviderFormView({
  poolId,
  attributes,
  initial,
  editing,
}: {
  poolId: string;
  attributes: string[];
  initial: ProviderFormValues;
  editing: boolean;
}) {
  const follow = useFollow();
  const navigate = useNavigate();
  const { flociPublicUrl } = useLoadedConfig();
  const create = useCreateProvider(poolId);
  const update = useUpdateProvider(poolId);
  const form = useZodForm(editing ? providerEditSchema : providerSchema, initial);
  const type = useWatch({ control: form.control, name: "type" });
  const backHref = cognitoRoutes.pool(poolId, POOL_TABS.providers);
  const redirectUri = `${flociPublicUrl}${HOSTED_UI_PATHS.idpResponse}`;

  // Giá trị mapping có sẵn mà schema không có vẫn phải là option, kẻo Select trống
  const attributeOptions = [
    ...new Set([...attributes, ...initial.mapping.map((row) => row.poolAttribute)]),
  ];

  const submit = form.handleSubmit((values) => {
    const name = toProviderFields(values).ProviderName;
    const then = () => navigate(backHref);

    if (editing)
      update.mutate(
        values,
        notifyOutcome({
          success: `Saved identity provider ${name}`,
          errorHeader: `Couldn't save ${name}`,
          then,
        }),
      );
    else
      create.mutate(
        values,
        notifyOutcome({
          success: `Created identity provider ${name}`,
          successAction: <AttachButton poolId={poolId} />,
          errorHeader: `Couldn't create ${name}`,
          then,
        }),
      );
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Form
        header={
          <Header variant='h1'>
            {editing ? "Edit identity provider" : "Create identity provider"}
          </Header>
        }
        actions={
          <ResponsiveActions footer>
            <Button variant='link' href={backHref} onFollow={follow}>
              Cancel
            </Button>
            <Button
              variant='primary'
              formAction='submit'
              loading={create.isPending || update.isPending}
            >
              {editing ? "Save identity provider" : "Create identity provider"}
            </Button>
          </ResponsiveActions>
        }
      >
        <SpaceBetween size='l'>
          <Container header={<Header variant='h2'>General</Header>}>
            <SpaceBetween size='l'>
              <FormTiles
                control={form.control}
                name='type'
                label='Type'
                items={TYPE_ITEMS.map((item) => ({ ...item, disabled: editing }))}
              />
              {type === PROVIDER_TYPES.OIDC && (
                <SpaceBetween size='m'>
                  {editing ? (
                    <FormField label='Name'>
                      <Input value={initial.name} disabled />
                    </FormField>
                  ) : (
                    <FormInput control={form.control} name='name' label='Name' autoFocus />
                  )}
                </SpaceBetween>
              )}
              <FormInput control={form.control} name='clientId' label='Client ID' />
              <FormInput control={form.control} name='clientSecret' label='Client secret' />
              <FormInput
                control={form.control}
                name='scopes'
                label='Scopes'
                description='Separated by spaces.'
              />
            </SpaceBetween>
          </Container>
          {type === PROVIDER_TYPES.OIDC ? (
            <Container
              header={
                <Header
                  variant='h2'
                  description={`Floci calls the token, userinfo and JWKS URLs from inside its container. For an IdP on your machine use http://${HOST_FROM_CONTAINER}:<port>; the authorize URL opens in your browser, so localhost works there.`}
                >
                  OIDC endpoints
                </Header>
              }
            >
              <SpaceBetween size='l'>
                {OIDC_URL_FIELDS.map((field) => (
                  <OidcUrlField key={field.name} control={form.control} field={field} />
                ))}
              </SpaceBetween>
            </Container>
          ) : (
            <Container
              header={
                <Header
                  variant='h2'
                  description='Register this redirect URI in your Google OAuth client:'
                >
                  Redirect URI
                </Header>
              }
            >
              <CopyButton variant='inline' text={redirectUri} label={redirectUri} />
            </Container>
          )}
          <Container header={<Header variant='h2'>Attribute mapping</Header>}>
            <MappingField control={form.control} attributes={attributeOptions} />
          </Container>
        </SpaceBetween>
      </Form>
    </form>
  );
}

export function ProviderForm() {
  const { poolId = "", provider: name = "" } = useParams();
  const pool = useUserPool(poolId);
  const provider = useProvider(poolId, name);
  const editing = Boolean(name);

  useBreadcrumbs([
    ...poolCrumbs(poolId, pool.data?.Name ?? poolId),
    editing
      ? { text: "Edit identity provider", href: cognitoRoutes.editProvider(poolId, name) }
      : { text: "Create identity provider", href: cognitoRoutes.createProvider(poolId) },
  ]);

  // sub / identities do Cognito quản lý, không map được
  const attributes = (pool.data?.SchemaAttributes ?? []).flatMap((item) =>
    item.Name && !LOCKED_ATTRIBUTES.some((locked) => locked === item.Name) ? [item.Name] : [],
  );

  if (!editing)
    return (
      <ProviderFormView
        poolId={poolId}
        attributes={attributes}
        initial={providerFormOf()}
        editing={false}
      />
    );

  const state = pageState(provider, {
    ready: Boolean(provider.data),
    notFound: provider.isError && isCognitoMissing(provider.error),
    title: `Identity provider ${name} not found`,
    backHref: cognitoRoutes.pool(poolId, POOL_TABS.providers),
    backText: "View identity providers",
  });

  if (state || !provider.data) return state;

  return (
    <ProviderFormView
      poolId={poolId}
      attributes={attributes}
      initial={providerFormOf(provider.data)}
      editing
    />
  );
}
