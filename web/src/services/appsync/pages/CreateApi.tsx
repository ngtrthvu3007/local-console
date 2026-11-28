import { useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormInput, FormSelect, FormTiles } from "@shared/components/form/FormFields.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useSubmitOnce } from "@shared/hooks/useSubmitOnce.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useUserPools } from "../../cognito/hooks/usePools.ts";
import { cognitoRoutes } from "@localconsole/core/cognito";
import {
  AUTH_LABELS,
  AUTH_TYPES,
  createApiSchema,
  type CreateApiForm,
  appsyncRoutes,
} from "@localconsole/core/appsync";
import { useCreateApi } from "../hooks/useApis.ts";
import { appsyncBaseCrumbs } from "../routes.ts";

const AUTH_DESCRIPTIONS: Record<string, string> = {
  [AUTH_TYPES.apiKey]: "Send x-api-key with each request. A key is created for you.",
  [AUTH_TYPES.cognito]: "Signed-in users of a Cognito user pool.",
  [AUTH_TYPES.iam]: "Requests signed with AWS credentials (SigV4).",
};

const AUTH_ITEMS = Object.values(AUTH_TYPES).map((value) => ({
  value,
  label: AUTH_LABELS[value],
  description: AUTH_DESCRIPTIONS[value],
}));

const INITIAL_VALUES: CreateApiForm = { name: "", authType: AUTH_TYPES.apiKey, userPoolId: "" };

export function CreateApi() {
  useBreadcrumbs([...appsyncBaseCrumbs, { text: "Create API", href: appsyncRoutes.createApi }]);
  const follow = useFollow();
  const navigate = useNavigate();
  const create = useCreateApi();
  const pools = useUserPools();
  const form = useZodForm(createApiSchema, INITIAL_VALUES);
  const authType = useWatch({ control: form.control, name: "authType" });

  const submit = form.handleSubmit((values) =>
    create.mutate(
      values,
      notifyOutcome({
        success: ({ setupError }) =>
          setupError
            ? `Created API ${values.name}, but couldn't finish setting it up: ${setupError}`
            : `Created API ${values.name}`,
        errorHeader: "Couldn't create API",
        then: ({ apiId }) => navigate(appsyncRoutes.api(apiId)),
      }),
    ),
  );
  const submitOnce = useSubmitOnce(submit);

  const actions = (
    <ResponsiveActions footer>
      <Button variant='link' href={appsyncRoutes.apis} onFollow={follow}>
        Cancel
      </Button>
      <Button variant='primary' formAction='submit' loading={create.isPending}>
        Create API
      </Button>
    </ResponsiveActions>
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submitOnce();
      }}
    >
      <Form
        header={
          <Header variant='h1' description='Starts with a sample schema you can edit right away.'>
            Create API
          </Header>
        }
        actions={actions}
      >
        <Container header={<Header variant='h2'>API details</Header>}>
          <SpaceBetween size='l'>
            <FormInput control={form.control} name='name' label='Name' placeholder='todo-api' />
            <FormTiles
              control={form.control}
              name='authType'
              label='Authorization'
              items={AUTH_ITEMS}
            />
            {authType === AUTH_TYPES.cognito && (
              <FormSelect
                control={form.control}
                name='userPoolId'
                label='User pool'
                placeholder='Choose a user pool'
                options={(pools.data ?? []).flatMap(({ Id, Name }) =>
                  Id ? [{ value: Id, label: Name ?? Id, description: Id }] : [],
                )}
                description={
                  pools.data?.length === 0 && (
                    <>
                      No user pools yet.{" "}
                      <Link href={cognitoRoutes.pools} onFollow={follow}>
                        Create user pool
                      </Link>
                    </>
                  )
                }
              />
            )}
          </SpaceBetween>
        </Container>
      </Form>
    </form>
  );
}
