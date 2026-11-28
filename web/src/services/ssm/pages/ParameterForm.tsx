import { useState } from "react";
import { useWatch } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Checkbox from "@cloudscape-design/components/checkbox";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormInput, FormTextarea, FormTiles } from "@shared/components/form/FormFields.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { FormKeySelect } from "../../kms/components/KeySelect.tsx";
import { awsManagedAlias, defaultKeyLabel } from "../../kms/keys.ts";
import { PARAMETER_TYPES, SECURE_STRING, SSM_KEY_SERVICE } from "../constants.ts";
import { isParameterMissing, useParameter, usePutParameter } from "../hooks/useParameters.ts";
import { SEARCH_PARAMS, parameterCrumbs, ssmBaseCrumbs, ssmRoutes } from "../routes.ts";
import { parameterSchema, type ParameterForm as ParameterValues } from "../schemas.ts";
import "./ParameterForm.css";

const MASKED_CLASS = "ssm-masked-value";

const NAME_CONSTRAINT =
  "Letters, numbers and _ . - /. A name with / is a path and starts with /, like /app/dev/db-host.";

const TYPE_ITEMS = Object.entries(PARAMETER_TYPES).map(([value, { label, description }]) => ({
  value,
  label,
  description,
}));

const NEW_PARAMETER: ParameterValues = {
  name: "",
  description: "",
  type: "String",
  value: "",
  keyId: "",
};

// Sửa thì tên bị khóa, hiện dạng chữ
function ParameterFormView({ initial, editing }: { initial: ParameterValues; editing: boolean }) {
  const follow = useFollow();
  const navigate = useNavigate();
  const put = usePutParameter(editing);
  const form = useZodForm(parameterSchema(editing), initial);
  const type = useWatch({ control: form.control, name: "type" });
  const secure = type === SECURE_STRING;
  const [shown, setShown] = useState(false);
  const action = editing ? "Save changes" : "Create parameter";
  const cancelHref = editing ? ssmRoutes.parameter(initial.name) : ssmRoutes.parameters;

  const submit = form.handleSubmit((values) =>
    put.mutate(
      values,
      notifyOutcome({
        success: `${editing ? "Updated" : "Created"} parameter ${values.name}`,
        errorHeader: `Couldn't save ${values.name}`,
        then: () => navigate(ssmRoutes.parameter(values.name)),
      }),
    ),
  );

  const actions = (
    <ResponsiveActions footer>
      <Button variant='link' href={cancelHref} onFollow={follow}>
        Cancel
      </Button>
      <Button variant='primary' formAction='submit' loading={put.isPending}>
        {action}
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
      <Form
        header={
          <Header variant='h1'>{editing ? `Edit ${initial.name}` : "Create parameter"}</Header>
        }
        actions={actions}
      >
        <Container header={<Header variant='h2'>Parameter details</Header>}>
          <SpaceBetween size='l'>
            {editing ? (
              <FormField label='Name'>
                <Box>{initial.name}</Box>
              </FormField>
            ) : (
              <FormInput
                control={form.control}
                name='name'
                label='Name'
                constraintText={NAME_CONSTRAINT}
                placeholder='/app/dev/db-host'
                autoFocus
              />
            )}
            <FormInput
              control={form.control}
              name='description'
              label='Description'
              constraintText='Optional.'
            />
            <FormTiles control={form.control} name='type' label='Type' items={TYPE_ITEMS} />
            <SpaceBetween size='xs'>
              <div className={secure && !shown ? MASKED_CLASS : undefined}>
                <FormTextarea
                  control={form.control}
                  name='value'
                  label='Value'
                  spellcheck={false}
                />
              </div>
              {secure && (
                <Checkbox checked={shown} onChange={({ detail }) => setShown(detail.checked)}>
                  Show value
                </Checkbox>
              )}
            </SpaceBetween>
            {secure && (
              <FormKeySelect
                control={form.control}
                name='keyId'
                label='Encryption key'
                defaultLabel={defaultKeyLabel(SSM_KEY_SERVICE)}
              />
            )}
          </SpaceBetween>
        </Container>
      </Form>
    </form>
  );
}

function EditParameter({ name }: { name: string }) {
  const details = useParameter(name);

  const state = pageState(details, {
    ready: Boolean(details.data),
    notFound: details.isError && isParameterMissing(details.error),
    title: `Parameter ${name} not found`,
    backHref: ssmRoutes.parameters,
    backText: "View parameters",
  });
  if (state || !details.data) return state;

  const { parameter, description, keyId } = details.data;

  return (
    <ParameterFormView
      editing
      initial={{
        name,
        description,
        type: parameter.Type ?? "String",
        value: parameter.Value ?? "",
        // Key mặc định hiện là option "(default)" của ô chọn
        keyId: keyId === awsManagedAlias(SSM_KEY_SERVICE) ? "" : keyId,
      }}
    />
  );
}

export function ParameterForm() {
  const [searchParams] = useSearchParams();
  const name = searchParams.get(SEARCH_PARAMS.name);

  useBreadcrumbs(
    name
      ? [...parameterCrumbs(name), { text: "Edit", href: ssmRoutes.editParameter(name) }]
      : [...ssmBaseCrumbs, { text: "Create parameter", href: ssmRoutes.createParameter }],
  );

  return name ? (
    <EditParameter name={name} />
  ) : (
    <ParameterFormView initial={NEW_PARAMETER} editing={false} />
  );
}
