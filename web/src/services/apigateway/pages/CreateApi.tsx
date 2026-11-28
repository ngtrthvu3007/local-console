import { useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormInput, FormTiles } from "@shared/components/form/FormFields.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  API_TYPES,
  DEFAULT_ROUTE_SELECTION,
  NAME_MAX_LENGTH,
  apiSchema,
  apigatewayRoutes,
  type ApiForm,
} from "@localconsole/core/apigateway";
import { LambdaFunctionFields } from "../components/LambdaFunctionFields.tsx";
import { useCreateApi } from "../hooks/useApis.ts";
import { apigatewayBaseCrumbs } from "../routes.ts";

const TYPE_ITEMS = [
  {
    value: API_TYPES.http,
    label: API_TYPES.http,
    description: "Routes to Lambda functions or HTTP backends.",
  },
  {
    value: API_TYPES.rest,
    label: API_TYPES.rest,
    description: "Resources and methods, with Lambda and Cognito authorizers.",
  },
  {
    value: API_TYPES.websocket,
    label: API_TYPES.websocket,
    description: "Two-way messages between clients and Lambda functions.",
  },
];

const INITIAL_VALUES: ApiForm = {
  type: API_TYPES.http,
  name: "",
  description: "",
  functionArn: "",
  grant: true,
  routeSelection: DEFAULT_ROUTE_SELECTION,
};

export function CreateApi() {
  useBreadcrumbs([...apigatewayBaseCrumbs, { text: "Create API", href: apigatewayRoutes.create }]);
  const follow = useFollow();
  const navigate = useNavigate();
  const createApi = useCreateApi();
  const form = useZodForm(apiSchema, INITIAL_VALUES);
  const type = useWatch({ control: form.control, name: "type" });

  const submit = form.handleSubmit((values) =>
    createApi.mutate(
      values,
      notifyBulkOutcome({
        success: () => `Created API ${values.name}`,
        errorHeader: `Couldn't create ${values.name}`,
        then: ({ api }) => navigate(apigatewayRoutes.api(api.version, api.apiId)),
      }),
    ),
  );

  const actions = (
    <ResponsiveActions footer>
      <Button variant='link' href={apigatewayRoutes.apis} onFollow={follow}>
        Cancel
      </Button>
      <Button variant='primary' formAction='submit' loading={createApi.isPending}>
        Create API
      </Button>
    </ResponsiveActions>
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Form header={<Header variant='h1'>Create API</Header>} actions={actions}>
        <Container header={<Header variant='h2'>API details</Header>}>
          <SpaceBetween size='l'>
            <FormTiles control={form.control} name='type' label='Type' items={TYPE_ITEMS} />
            <FormInput
              control={form.control}
              name='name'
              label='Name'
              constraintText={`Up to ${NAME_MAX_LENGTH} characters.`}
              placeholder='orders-api'
              autoFocus
            />
            {type === API_TYPES.websocket ? (
              <FormInput
                control={form.control}
                name='routeSelection'
                label='Route selection expression'
                constraintText='Picks the route for each message, for example $request.body.action.'
              />
            ) : (
              <FormInput control={form.control} name='description' label='Description - optional' />
            )}
            {type === API_TYPES.http && (
              <LambdaFunctionFields
                control={form.control}
                functionName='functionArn'
                grantName='grant'
                label='Lambda function - optional'
                description='Sends every request to this function: adds the $default route and stage.'
                optional
              />
            )}
          </SpaceBetween>
        </Container>
      </Form>
    </form>
  );
}
