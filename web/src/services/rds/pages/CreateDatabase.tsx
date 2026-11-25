import { useEffect } from "react";
import { useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import {
  FormToggle,
  FormInput,
  FormRadioGroup,
  FormTiles,
} from "@shared/components/form/FormFields.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  RDS_KEY_SERVICE,
  CREDENTIAL_TYPES,
  DEFAULT_ENGINE,
  DEFAULT_USERNAMES,
  ENGINE_LABELS,
  IDENTIFIER_MAX_LENGTH,
  PASSWORD_MAX_LENGTHS,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RULE,
  USERNAME_MAX_LENGTH,
} from "../constants.ts";
import { FormKeySelect } from "../../kms/components/KeySelect.tsx";
import { defaultKeyLabel } from "../../kms/keys.ts";
import { SECRETS_KEY_SERVICE } from "../../secretsmanager/constants.ts";
import { useCreateDatabase } from "../hooks/useDatabases.ts";
import { rdsBaseCrumbs, rdsRoutes } from "../routes.ts";
import { createDatabaseSchema, type CreateDatabaseForm } from "../schemas.ts";

const IDENTIFIER_CONSTRAINT = `1–${IDENTIFIER_MAX_LENGTH} characters: lowercase letters, numbers and hyphens. Start with a letter.`;
const USERNAME_CONSTRAINT = `1–${USERNAME_MAX_LENGTH} characters: letters, numbers and underscores. Start with a letter.`;

const ENGINE_ITEMS = Object.entries(ENGINE_LABELS).map(([value, label]) => ({ value, label }));
const CREDENTIAL_ITEMS = [
  { value: "selfManaged", label: CREDENTIAL_TYPES.selfManaged },
  {
    value: "secretsManager",
    label: CREDENTIAL_TYPES.secretsManager,
    description: "Floci generates the password and stores it in a secret named rds!db-….",
  },
];

const INITIAL_VALUES: CreateDatabaseForm = {
  engine: DEFAULT_ENGINE,
  identifier: "",
  username: DEFAULT_USERNAMES[DEFAULT_ENGINE],
  credentials: "selfManaged",
  password: "",
  confirmPassword: "",
  databaseName: "",
  storageEncrypted: false,
  kmsKeyId: "",
  secretKmsKeyId: "",
};

export function CreateDatabase() {
  useBreadcrumbs([...rdsBaseCrumbs, { text: "Create database", href: rdsRoutes.createDatabase }]);
  const follow = useFollow();
  const navigate = useNavigate();
  const createDatabase = useCreateDatabase();
  const form = useZodForm(createDatabaseSchema, INITIAL_VALUES);
  const engine = useWatch({ control: form.control, name: "engine" });
  const selfManaged = useWatch({ control: form.control, name: "credentials" }) === "selfManaged";
  const storageEncrypted = useWatch({ control: form.control, name: "storageEncrypted" });
  const { getFieldState, setValue } = form;

  // Đổi engine thì đổi username mặc định theo, trừ khi người dùng đã tự gõ
  useEffect(() => {
    if (!getFieldState("username").isDirty) setValue("username", DEFAULT_USERNAMES[engine]);
  }, [engine, getFieldState, setValue]);

  const submit = form.handleSubmit((values) =>
    createDatabase.mutate(
      values,
      notifyOutcome({
        // Floci báo available khi container vừa chạy; MySQL cần thêm vài giây (đã đo 2026-11-23)
        success: `Created database ${values.identifier}. It can take a few seconds before it accepts connections.`,
        errorHeader: `Couldn't create ${values.identifier}`,
        then: () => navigate(rdsRoutes.database(values.identifier)),
      }),
    ),
  );

  const actions = (
    <ResponsiveActions footer>
      <Button variant='link' href={rdsRoutes.databases} onFollow={follow}>
        Cancel
      </Button>
      <Button variant='primary' formAction='submit' loading={createDatabase.isPending}>
        Create database
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
          <Header
            variant='h1'
            description='Floci starts a real database container. The first time can take a minute while it pulls the image.'
          >
            Create database
          </Header>
        }
        actions={actions}
      >
        <SpaceBetween size='l'>
          <Container header={<Header variant='h2'>Engine</Header>}>
            <FormTiles
              control={form.control}
              name='engine'
              label='Engine type'
              items={ENGINE_ITEMS}
            />
          </Container>
          <Container header={<Header variant='h2'>Settings</Header>}>
            <SpaceBetween size='l'>
              <FormInput
                control={form.control}
                name='identifier'
                label='DB identifier'
                constraintText={IDENTIFIER_CONSTRAINT}
                placeholder='app-db'
              />
              <FormInput
                control={form.control}
                name='username'
                label='Master username'
                constraintText={USERNAME_CONSTRAINT}
              />
              <FormRadioGroup
                control={form.control}
                name='credentials'
                label='Credentials management'
                items={CREDENTIAL_ITEMS}
              />
              {/* SpaceBetween chỉ giãn cách con trực tiếp nên không gom hai ô vào một fragment */}
              {selfManaged && (
                <FormInput
                  control={form.control}
                  name='password'
                  label='Master password'
                  type='password'
                  constraintText={`${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTHS[engine]} characters. ${PASSWORD_RULE}`}
                />
              )}
              {selfManaged && (
                <FormInput
                  control={form.control}
                  name='confirmPassword'
                  label='Confirm master password'
                  type='password'
                />
              )}
              {!selfManaged && (
                <FormKeySelect
                  control={form.control}
                  name='secretKmsKeyId'
                  label='Secret encryption key'
                  defaultLabel={defaultKeyLabel(SECRETS_KEY_SERVICE)}
                />
              )}
              <FormInput
                control={form.control}
                name='databaseName'
                label='Initial database name'
                constraintText='Optional. Letters, numbers and underscores. Start with a letter.'
                placeholder='appdb'
              />
            </SpaceBetween>
          </Container>
          <Container header={<Header variant='h2'>Encryption</Header>}>
            <SpaceBetween size='l'>
              <FormToggle control={form.control} name='storageEncrypted' text='Encrypt storage' />
              {storageEncrypted && (
                <FormKeySelect
                  control={form.control}
                  name='kmsKeyId'
                  label='Encryption key'
                  defaultLabel={defaultKeyLabel(RDS_KEY_SERVICE)}
                />
              )}
            </SpaceBetween>
          </Container>
        </SpaceBetween>
      </Form>
    </form>
  );
}
