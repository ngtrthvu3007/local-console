import { useWatch } from "react-hook-form";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormInput, FormRadioGroup, FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  API_TYPES,
  AUTHORIZER_TYPES,
  AUTHORIZER_TYPES_BY_API,
  DEFAULT_IDENTITY_HEADER,
  IDENTITY_SEPARATOR,
  LOCAL_ISSUER_POPOVER,
  POOL_LOCKED,
  authorizerSchema,
  authorizerTypeLabel,
  cognitoPoolIdOfProviderArn,
  functionArnOfUri,
  identityNamesOf,
  isLambdaAuthorizer,
  readsOneSource,
  type ApiType,
  type ApiVersion,
  type AuthorizerForm,
  type AuthorizerRow,
} from "@localconsole/core/apigateway";
import { useUserPools } from "../../cognito/hooks/usePools.ts";
import { useSaveAuthorizer } from "../hooks/useApiDetail.ts";
import { grantIfChanged } from "../grants.ts";
import { LambdaFunctionFields } from "./LambdaFunctionFields.tsx";

const IDENTITY_KIND_ITEMS = [
  { value: "header", label: "Header" },
  { value: "querystring", label: "Query string" },
];

function initialValues(apiType: ApiType, current?: AuthorizerRow): AuthorizerForm {
  if (!current) {
    return {
      name: "",
      type: AUTHORIZER_TYPES_BY_API[apiType][0],
      functionArn: "",
      grant: true,
      poolId: "",
      issuer: "",
      audience: "",
      identityKind: "header",
      identityNames: DEFAULT_IDENTITY_HEADER,
    };
  }
  const { kind, names } = identityNamesOf(current.identitySource);
  return {
    name: current.name,
    type: current.type,
    functionArn: functionArnOfUri(current.target) ?? "",
    grant: true,
    poolId: cognitoPoolIdOfProviderArn(current.providerArns?.[0] ?? ""),
    issuer: current.issuer ?? "",
    audience: (current.audience ?? []).join(IDENTITY_SEPARATOR),
    identityKind: kind,
    identityNames: names.join(IDENTITY_SEPARATOR),
  };
}

interface Props {
  version: ApiVersion;
  apiId: string;
  apiType: ApiType;
  existingNames: readonly string[];
  current?: AuthorizerRow; // có thì là sửa
  onDismiss: () => void;
}

// Chỉ mount khi mở
export function AuthorizerModal(props: Props) {
  const { version, apiId, apiType, existingNames, current, onDismiss } = props;
  const saveAuthorizer = useSaveAuthorizer(version, apiId, apiType);
  const others = existingNames.filter((name) => name !== current?.name);
  const initial = initialValues(apiType, current);
  const form = useZodForm(authorizerSchema(others), initial);
  const [type, identityKind] = useWatch({ control: form.control, name: ["type", "identityKind"] });
  const pools = useUserPools();

  const lambda = isLambdaAuthorizer(type);
  const single = readsOneSource(type);
  const query = identityKind === "querystring";
  // Form tạo REST / HTTP chỉ có header (spec 3.7); authorizer có sẵn đọc query string thì vẫn sửa được
  const readsQueryString =
    apiType === API_TYPES.websocket || initial.identityKind === "querystring";
  const identityLabel = query ? "Query string parameters" : "Headers";

  const submit = form.handleSubmit((values) =>
    saveAuthorizer.mutate(
      { current, values: grantIfChanged(values, initial.functionArn) },
      notifyBulkOutcome({
        success: () => `${current ? "Saved" : "Created"} authorizer ${values.name}`,
        errorHeader: `Couldn't save authorizer ${values.name}`,
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header={current ? "Edit authorizer" : "Create authorizer"}
      actionText={current ? "Save" : "Create"}
      loading={saveAuthorizer.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput control={form.control} name='name' label='Name' autoFocus />
      <FormSelect
        control={form.control}
        name='type'
        label='Type'
        options={AUTHORIZER_TYPES_BY_API[apiType].map((value) => ({
          value,
          label: authorizerTypeLabel(value),
        }))}
        disabled={Boolean(current)}
      />
      {lambda && (
        <LambdaFunctionFields
          control={form.control}
          functionName='functionArn'
          grantName='grant'
          label='Lambda function'
          currentArn={initial.functionArn}
        />
      )}
      {type === AUTHORIZER_TYPES.cognito && (
        <FormSelect
          control={form.control}
          name='poolId'
          label='User pool'
          description={current ? POOL_LOCKED : undefined}
          placeholder='Choose a user pool'
          empty='No user pools'
          options={(pools.data ?? []).map((pool) => ({
            value: pool.Id ?? "",
            label: pool.Name ?? pool.Id,
          }))}
          disabled={Boolean(current)}
        />
      )}
      {type === AUTHORIZER_TYPES.jwt && (
        <SpaceBetween size='m'>
          <FormInput
            control={form.control}
            name='issuer'
            label='Issuer'
            description={LOCAL_ISSUER_POPOVER}
            placeholder='https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc'
          />
          <FormInput
            control={form.control}
            name='audience'
            label='Audience - optional'
            constraintText='Client IDs, separated by commas.'
          />
        </SpaceBetween>
      )}
      {readsQueryString && (
        <FormRadioGroup
          control={form.control}
          name='identityKind'
          label='Identity source'
          items={IDENTITY_KIND_ITEMS}
        />
      )}
      <FormInput
        control={form.control}
        name='identityNames'
        label={single ? "Token header" : identityLabel}
        constraintText={
          single ? "The header that carries the token." : "Separate names with commas."
        }
      />
    </FormModal>
  );
}
