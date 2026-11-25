import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { Controller, useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import type { RadioGroupProps } from "@cloudscape-design/components/radio-group";
import SpaceBetween from "@cloudscape-design/components/space-between";
import TagEditor from "@cloudscape-design/components/tag-editor";
import { FormInput, FormRadioGroup } from "@shared/components/form/FormFields.tsx";
import { activeTags } from "@shared/components/TagsModal.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  DEFAULT_ENCRYPTION_NOTE,
  ENCRYPTION_TYPES,
  S3_KEY_SERVICE,
  BUCKET_NAME_MAX_LENGTH,
  BUCKET_NAME_MIN_LENGTH,
  VERSIONING_DESCRIPTION,
  VERSIONING_STATUS,
} from "../constants.ts";
import { FormKeySelect } from "../../kms/components/KeySelect.tsx";
import { defaultKeyLabel } from "../../kms/keys.ts";
import { useCreateBucket } from "../hooks/useBuckets.ts";
import { s3BaseCrumbs, s3Routes } from "../routes.ts";
import { createBucketSchema } from "../schemas.ts";

const ENCRYPTION_ITEMS: RadioGroupProps.RadioButtonDefinition[] = [
  { value: ENCRYPTION_TYPES.sseS3, label: "SSE-S3", description: "Keys managed by S3." },
  { value: ENCRYPTION_TYPES.sseKms, label: "SSE-KMS", description: "A KMS key you choose." },
];

const VERSIONING_ITEMS: RadioGroupProps.RadioButtonDefinition[] = [
  { value: VERSIONING_STATUS.disabled, label: "Disable" },
  { value: VERSIONING_STATUS.enabled, label: "Enable" },
];

const NAME_CONSTRAINT = `${BUCKET_NAME_MIN_LENGTH}–${BUCKET_NAME_MAX_LENGTH} characters: lowercase letters, numbers, dots and hyphens.`;

export function CreateBucket() {
  useBreadcrumbs([...s3BaseCrumbs, { text: "Create bucket", href: s3Routes.createBucket }]);
  const follow = useFollow();
  const navigate = useNavigate();
  const createBucket = useCreateBucket();
  const form = useZodForm(createBucketSchema, {
    name: "",
    versioning: VERSIONING_STATUS.disabled,
    tags: [],
    tagsValid: true,
    encryption: ENCRYPTION_TYPES.sseS3,
    kmsKeyId: "",
  });
  const encryption = useWatch({ control: form.control, name: "encryption" });

  const submit = form.handleSubmit(({ name, versioning, tags, encryption: type, kmsKeyId }) =>
    createBucket.mutate(
      {
        name,
        versioning: versioning === VERSIONING_STATUS.enabled,
        tags: activeTags(tags),
        kmsKeyId: type === ENCRYPTION_TYPES.sseKms ? kmsKeyId : undefined,
      },
      notifyOutcome({
        success: `Created bucket ${name}`,
        errorHeader: `Couldn't create ${name}`,
        then: () => navigate(s3Routes.bucket(name)),
      }),
    ),
  );

  const actions = (
    <ResponsiveActions footer>
      <Button variant='link' href={s3Routes.buckets} onFollow={follow}>
        Cancel
      </Button>
      <Button variant='primary' formAction='submit' loading={createBucket.isPending}>
        Create bucket
      </Button>
    </ResponsiveActions>
  );

  const tagsEditor = (
    <Controller
      control={form.control}
      name='tags'
      render={({ field }) => (
        <FormField errorText={form.formState.errors.tagsValid?.message}>
          <TagEditor
            tags={field.value}
            onChange={({ detail }) => {
              field.onChange([...detail.tags]);
              form.setValue("tagsValid", detail.valid);
            }}
          />
        </FormField>
      )}
    />
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Form header={<Header variant='h1'>Create bucket</Header>} actions={actions}>
        <SpaceBetween size='l'>
          <Container header={<Header variant='h2'>General configuration</Header>}>
            <FormInput
              control={form.control}
              name='name'
              label='Bucket name'
              constraintText={NAME_CONSTRAINT}
              placeholder='my-uploads'
              autoFocus
            />
          </Container>
          <Container
            header={
              <Header variant='h2' description={VERSIONING_DESCRIPTION}>
                Bucket versioning
              </Header>
            }
          >
            <FormRadioGroup control={form.control} name='versioning' items={VERSIONING_ITEMS} />
          </Container>
          <Container
            header={
              <Header variant='h2' description={DEFAULT_ENCRYPTION_NOTE}>
                Default encryption
              </Header>
            }
          >
            <SpaceBetween size='l'>
              <FormRadioGroup control={form.control} name='encryption' items={ENCRYPTION_ITEMS} />
              {encryption === ENCRYPTION_TYPES.sseKms && (
                <FormKeySelect
                  control={form.control}
                  name='kmsKeyId'
                  label='Encryption key'
                  defaultLabel={defaultKeyLabel(S3_KEY_SERVICE)}
                />
              )}
            </SpaceBetween>
          </Container>
          <Container
            header={
              <Header variant='h2' description='Optional key–value pairs.'>
                Tags
              </Header>
            }
          >
            {tagsEditor}
          </Container>
        </SpaceBetween>
      </Form>
    </form>
  );
}
