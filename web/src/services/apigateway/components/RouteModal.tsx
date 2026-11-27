import { useWatch } from "react-hook-form";
import Alert from "@cloudscape-design/components/alert";
import SpaceBetween from "@cloudscape-design/components/space-between";
import {
  FormAutosuggest,
  FormCheckbox,
  FormInput,
  FormRadioGroup,
  FormSelect,
} from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  API_TYPES,
  API_VERSIONS,
  AUTH_NONE,
  CONNECT_ROUTE,
  DEFAULT_KEY,
  DEFAULT_METHOD,
  DISCONNECT_ROUTE,
  LOCKED_INTEGRATION,
  MISSING_AUTHORIZER,
  METHOD_ORDER,
  ROUTE_KEY_SEPARATOR,
  TWO_WAY_LABEL,
  TWO_WAY_LOCKED,
  authorizationOf,
  integrationFormOf,
  routeSchema,
  type ApiType,
  type RouteForm,
  type RouteRow,
} from "@localconsole/core/apigateway";
import { useAuthorizers, useSaveRoute } from "../hooks/useApiDetail.ts";
import { grantIfChanged } from "../grants.ts";
import { LambdaFunctionFields } from "./LambdaFunctionFields.tsx";
import { INTEGRATION_ITEMS, authorizationOptions, authorizationValue } from "./MethodModal.tsx";

const ROOT_PATH = "/";
const METHOD_OPTIONS = METHOD_ORDER.map((name) => ({ value: name, label: name }));
const WEBSOCKET_KEYS = [CONNECT_ROUTE, DISCONNECT_ROUTE, DEFAULT_KEY].map((value) => ({ value }));
// $connect / $disconnect không gửi gì về client nên không có two-way
const ONE_WAY_KEYS = [CONNECT_ROUTE, DISCONNECT_ROUTE];

function initialValues(apiType: ApiType, route?: RouteRow): RouteForm {
  const blank: RouteForm = {
    method: DEFAULT_METHOD,
    path: ROOT_PATH,
    isDefault: false,
    routeKey: "",
    integration: "lambda",
    functionArn: "",
    grant: true,
    url: "",
    authorization: AUTH_NONE,
    twoWay: true,
  };
  if (!route) return blank;

  const [method, path = ""] = route.key.split(ROUTE_KEY_SEPARATOR);
  const httpKey = apiType === API_TYPES.http && route.key !== DEFAULT_KEY;
  return {
    ...blank,
    method: httpKey ? method : DEFAULT_METHOD,
    path: httpKey ? path : ROOT_PATH,
    isDefault: apiType === API_TYPES.http && route.key === DEFAULT_KEY,
    routeKey: route.key,
    // Form WebSocket chỉ có đích Lambda: HTTP proxy do IaC tạo thì khóa như loại lạ
    ...integrationFormOf(route.integrationType, route.integrationUri, apiType === API_TYPES.http),
    authorization: authorizationValue(route.authorizerId, route.authorizationType),
    twoWay: route.twoWay,
  };
}

interface Props {
  apiId: string;
  apiType: ApiType;
  existingKeys: readonly string[];
  route?: RouteRow; // có thì là sửa
  onDismiss: () => void;
}

// Chỉ mount khi mở
export function RouteModal({ apiId, apiType, existingKeys, route, onDismiss }: Props) {
  const saveRoute = useSaveRoute(apiId, apiType);
  const authorizers = useAuthorizers(API_VERSIONS.v2, apiId);
  const others = existingKeys.filter((key) => key !== route?.key);
  const initial = initialValues(apiType, route);
  const form = useZodForm(routeSchema(apiType, others), initial);
  const [integration, isDefault, routeKey] = useWatch({
    control: form.control,
    name: ["integration", "isDefault", "routeKey"],
  });
  const webSocket = apiType === API_TYPES.websocket;
  const hasTwoWay = webSocket && !ONE_WAY_KEYS.includes(routeKey);
  // WebSocket: authorizer chỉ gắn ở $connect (luật AWS)
  const hasAuthorizer = !webSocket || routeKey === CONNECT_ROUTE;

  const submit = form.handleSubmit((values) => {
    const authorization = authorizationOf(
      hasAuthorizer ? values.authorization : AUTH_NONE,
      authorizers.data ?? [],
    );
    if (!authorization) {
      form.setError("authorization", { message: MISSING_AUTHORIZER });
      return;
    }
    saveRoute.mutate(
      {
        routeId: route?.id,
        values: {
          // SourceArn của route chứa route key: đổi key thì cấp quyền lại cho key mới
          ...grantIfChanged(values, initial.functionArn, values.routeKey === route?.key),
          twoWay: hasTwoWay && values.twoWay,
        },
        authorization,
      },
      notifyBulkOutcome({
        success: () => `${route ? "Saved" : "Created"} route ${values.routeKey}`,
        errorHeader: `Couldn't save route ${values.routeKey}`,
        then: onDismiss,
      }),
    );
  });

  return (
    <FormModal
      header={route ? "Edit route" : "Create route"}
      actionText={route ? "Save" : "Create"}
      loading={saveRoute.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      {webSocket ? (
        <FormAutosuggest
          control={form.control}
          name='routeKey'
          label='Route key'
          constraintText='$connect, $disconnect, $default, or a value the route selection expression returns.'
          placeholder='sendMessage'
          options={WEBSOCKET_KEYS}
          enteredTextLabel={(value) => `Use: ${value}`}
        />
      ) : (
        <SpaceBetween size='m'>
          <FormCheckbox
            control={form.control}
            name='isDefault'
            text='$default route'
            description='Catches requests no other route matches.'
          />
          {!isDefault && (
            <SpaceBetween size='m'>
              <FormSelect
                control={form.control}
                name='method'
                label='Method'
                options={METHOD_OPTIONS}
              />
              <FormInput
                control={form.control}
                name='path'
                label='Path'
                constraintText='Starts with /. {name} for a path variable, {name+} at the end for the rest of the path.'
                placeholder='/items/{id}'
              />
            </SpaceBetween>
          )}
        </SpaceBetween>
      )}
      {integration === "other" ? (
        <Alert type='info'>{LOCKED_INTEGRATION}</Alert>
      ) : (
        <SpaceBetween size='m'>
          {!webSocket && (
            <FormRadioGroup
              control={form.control}
              name='integration'
              label='Integration'
              items={INTEGRATION_ITEMS}
            />
          )}
          {integration === "lambda" ? (
            <LambdaFunctionFields
              control={form.control}
              functionName='functionArn'
              grantName='grant'
              label='Lambda function'
              currentArn={initial.functionArn}
            />
          ) : (
            <FormInput
              control={form.control}
              name='url'
              label='URL'
              constraintText='HTTP proxy: the request goes to this URL.'
              placeholder='https://example.com'
            />
          )}
        </SpaceBetween>
      )}
      {hasTwoWay && (
        <FormCheckbox
          control={form.control}
          name='twoWay'
          text={TWO_WAY_LABEL}
          description={route?.twoWay ? TWO_WAY_LOCKED : undefined}
          disabled={route?.twoWay}
        />
      )}
      {hasAuthorizer && (
        <FormSelect
          control={form.control}
          name='authorization'
          label='Authorization'
          options={authorizationOptions(authorizers.data)}
        />
      )}
    </FormModal>
  );
}
