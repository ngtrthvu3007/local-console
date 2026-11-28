import { useWatch } from "react-hook-form";
import Alert from "@cloudscape-design/components/alert";
import SpaceBetween from "@cloudscape-design/components/space-between";
import type { Method } from "@aws-sdk/client-api-gateway";
import { FormInput, FormRadioGroup, FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  API_VERSIONS,
  AUTH_IAM,
  AUTH_NONE,
  DEFAULT_METHOD,
  LOCKED_INTEGRATION,
  MISSING_AUTHORIZER,
  METHOD_ORDER,
  authorizationOf,
  authorizerTypeLabel,
  integrationFormOf,
  methodSchema,
  type AuthorizerRow,
  type MethodForm,
} from "@localconsole/core/apigateway";
import { useAuthorizers, useSaveMethod } from "../hooks/useApiDetail.ts";
import { grantIfChanged } from "../grants.ts";
import { LambdaFunctionFields } from "./LambdaFunctionFields.tsx";

export const INTEGRATION_ITEMS = [
  { value: "lambda", label: "Lambda function" },
  { value: "http", label: "HTTP" },
];

export const authorizationOptions = (authorizers: readonly AuthorizerRow[] = []) => [
  { value: AUTH_NONE, label: "None" },
  { value: AUTH_IAM, label: "AWS IAM" },
  ...authorizers.map((authorizer) => ({
    value: authorizer.id,
    label: `${authorizer.name} (${authorizerTypeLabel(authorizer.type)})`,
  })),
];

// Giá trị ô Authorization: ID authorizer, không có thì loại xác thực
export function authorizationValue(authorizerId?: string, authorizationType?: string) {
  if (authorizerId) return authorizerId;
  return authorizationType || AUTH_NONE;
}

function initialValues(method: Method | undefined, available: readonly string[]): MethodForm {
  if (!method) {
    return {
      httpMethod: available.includes(DEFAULT_METHOD) ? DEFAULT_METHOD : (available[0] ?? ""),
      integration: "lambda",
      functionArn: "",
      grant: true,
      url: "",
      authorization: AUTH_NONE,
    };
  }
  const { type, uri } = method.methodIntegration ?? {};
  return {
    httpMethod: method.httpMethod ?? "",
    ...integrationFormOf(type, uri, true),
    grant: true,
    authorization: authorizationValue(method.authorizerId, method.authorizationType),
  };
}

interface Props {
  apiId: string;
  resource: { id: string; path: string };
  existingMethods: readonly string[];
  method?: Method; // có thì là sửa
  onDismiss: () => void;
}

// Chỉ mount khi mở
export function MethodModal({ apiId, resource, existingMethods, method, onDismiss }: Props) {
  const saveMethod = useSaveMethod(apiId);
  const authorizers = useAuthorizers(API_VERSIONS.rest, apiId);
  const available = method
    ? [method.httpMethod ?? ""]
    : METHOD_ORDER.filter((name) => !existingMethods.includes(name));
  const initial = initialValues(method, available);
  const form = useZodForm(methodSchema, initial);
  const integration = useWatch({ control: form.control, name: "integration" });

  const submit = form.handleSubmit((values) => {
    const authorization = authorizationOf(values.authorization, authorizers.data ?? []);
    if (!authorization) {
      form.setError("authorization", { message: MISSING_AUTHORIZER });
      return;
    }
    saveMethod.mutate(
      {
        resource,
        values: grantIfChanged(values, initial.functionArn),
        authorization,
        isNew: !method,
      },
      notifyBulkOutcome({
        success: () =>
          `${method ? "Saved" : "Created"} method ${values.httpMethod} ${resource.path}`,
        errorHeader: `Couldn't save method ${values.httpMethod} ${resource.path}`,
        then: onDismiss,
      }),
    );
  });

  return (
    <FormModal
      header={method ? "Edit method" : "Create method"}
      actionText={method ? "Save" : "Create"}
      loading={saveMethod.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormSelect
        control={form.control}
        name='httpMethod'
        label='Method'
        description={`On ${resource.path}`}
        options={available.map((name) => ({ value: name, label: name }))}
        disabled={Boolean(method)}
      />
      {integration === "other" ? (
        <Alert type='info'>{LOCKED_INTEGRATION}</Alert>
      ) : (
        <SpaceBetween size='m'>
          <FormRadioGroup
            control={form.control}
            name='integration'
            label='Integration'
            items={INTEGRATION_ITEMS}
          />
          {integration === "lambda" ? (
            <LambdaFunctionFields
              control={form.control}
              functionName='functionArn'
              grantName='grant'
              label='Lambda function'
              currentArn={initial.functionArn}
              description='Lambda proxy: the function gets the whole request and returns the response.'
            />
          ) : (
            <FormInput
              control={form.control}
              name='url'
              label='URL'
              constraintText='HTTP proxy. Use {name} for path variables of this resource.'
              placeholder='https://example.com/{proxy}'
            />
          )}
        </SpaceBetween>
      )}
      <FormSelect
        control={form.control}
        name='authorization'
        label='Authorization'
        options={authorizationOptions(authorizers.data)}
      />
    </FormModal>
  );
}
