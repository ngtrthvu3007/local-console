import { Controller, useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormInput, FormTiles } from "@shared/components/form/FormFields.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { FormValueEditor } from "@shared/components/ValueEditor.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { KeyValueEditor } from "@shared/components/KeyValueEditor.tsx";
import { FormKeySelect } from "../../kms/components/KeySelect.tsx";
import { defaultKeyLabel } from "@localconsole/core/kms";
import {
  SECRETS_KEY_SERVICE,
  SECRET_NAME_MAX_LENGTH,
  SECRET_TYPES,
  createSecretSchema,
  type CreateSecretForm,
  textOfKeyValue,
  secretsRoutes,
} from "@localconsole/core/secretsmanager";
import { useCreateSecret } from "../hooks/useSecrets.ts";
import { secretsBaseCrumbs } from "../routes.ts";

const NAME_CONSTRAINT = `1–${SECRET_NAME_MAX_LENGTH} characters: letters, numbers and / _ + = . @ -`;

const TYPE_ITEMS = [
  {
    value: "keyValue",
    label: SECRET_TYPES.keyValue,
    description: "Saved as a JSON object, like database credentials.",
  },
  {
    value: "plaintext",
    label: SECRET_TYPES.plaintext,
    description: "Any text, saved as typed, like an API key.",
  },
];

const INITIAL_VALUES: CreateSecretForm = {
  type: "keyValue",
  entries: [],
  plaintext: "",
  name: "",
  description: "",
  kmsKeyId: "",
};

export function CreateSecret() {
  useBreadcrumbs([
    ...secretsBaseCrumbs,
    { text: "Store a new secret", href: secretsRoutes.createSecret },
  ]);
  const follow = useFollow();
  const navigate = useNavigate();
  const createSecret = useCreateSecret();
  const form = useZodForm(createSecretSchema, INITIAL_VALUES);
  const type = useWatch({ control: form.control, name: "type" });

  const submit = form.handleSubmit(
    ({ type: secretType, entries, plaintext, name, description, kmsKeyId }) =>
      createSecret.mutate(
        {
          name,
          description,
          kmsKeyId,
          value: secretType === "keyValue" ? textOfKeyValue(entries) : plaintext,
        },
        notifyOutcome({
          success: `Stored secret ${name}`,
          errorHeader: `Couldn't store ${name}`,
          then: () => navigate(secretsRoutes.secret(name)),
        }),
      ),
  );

  const actions = (
    <ResponsiveActions footer>
      <Button variant='link' href={secretsRoutes.secrets} onFollow={follow}>
        Cancel
      </Button>
      <Button variant='primary' formAction='submit' loading={createSecret.isPending}>
        Store secret
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
      <Form header={<Header variant='h1'>Store a new secret</Header>} actions={actions}>
        <SpaceBetween size='l'>
          <Container header={<Header variant='h2'>Secret value</Header>}>
            <SpaceBetween size='l'>
              <FormTiles
                control={form.control}
                name='type'
                label='Secret type'
                items={TYPE_ITEMS}
              />
              {type === "keyValue" ? (
                <Controller
                  control={form.control}
                  name='entries'
                  render={({ field, formState }) => (
                    <KeyValueEditor
                      items={field.value}
                      onChange={field.onChange}
                      keyError={(index) => formState.errors.entries?.[index]?.key?.message}
                    />
                  )}
                />
              ) : (
                <FormValueEditor
                  control={form.control}
                  name='plaintext'
                  label='Plaintext'
                  language='text'
                />
              )}
            </SpaceBetween>
          </Container>
          <Container header={<Header variant='h2'>Details</Header>}>
            <SpaceBetween size='l'>
              <FormInput
                control={form.control}
                name='name'
                label='Secret name'
                constraintText={NAME_CONSTRAINT}
                placeholder='app/dev/db'
              />
              <FormInput
                control={form.control}
                name='description'
                label='Description'
                constraintText='Optional.'
              />
            </SpaceBetween>
          </Container>
          <Container header={<Header variant='h2'>Encryption</Header>}>
            <FormKeySelect
              control={form.control}
              name='kmsKeyId'
              label='Encryption key'
              defaultLabel={defaultKeyLabel(SECRETS_KEY_SERVICE)}
            />
          </Container>
        </SpaceBetween>
      </Form>
    </form>
  );
}
