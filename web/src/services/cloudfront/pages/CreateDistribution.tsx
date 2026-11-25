import { useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormCheckbox, FormInput, FormSelect } from "@shared/components/form/FormFields.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useBuckets } from "../../s3/hooks/useBuckets.ts";
import { s3Routes } from "../../s3/routes.ts";
import { SPA_DESCRIPTION, SPA_TEXT } from "../components/SettingsModal.tsx";
import { DEFAULT_ROOT_OBJECT } from "../constants.ts";
import { newDistributionConfig } from "../distributions.ts";
import { useCreateDistribution } from "../hooks/useDistributions.ts";
import { SEARCH_PARAMS, cloudfrontBaseCrumbs, cloudfrontRoutes } from "../routes.ts";
import { createDistributionSchema } from "../schemas.ts";

// Chỉ origin S3: custom origin thêm ở tab Origins sau khi tạo (spec 3.3)
export function CreateDistribution() {
  useBreadcrumbs([
    ...cloudfrontBaseCrumbs,
    { text: "Create distribution", href: cloudfrontRoutes.createDistribution() },
  ]);
  const follow = useFollow();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { region } = useLoadedConfig();
  const buckets = useBuckets();
  const create = useCreateDistribution();
  const form = useZodForm(createDistributionSchema, {
    // Mở từ trang bucket thì bucket điền sẵn
    bucket: searchParams.get(SEARCH_PARAMS.bucket) ?? "",
    defaultRootObject: DEFAULT_ROOT_OBJECT,
    spa: false,
    description: "",
  });
  // form kiểm tra bất đồng bộ nên isPending bật chậm: ref chặn bấm đúp (như Create key của KMS)
  const submitting = useRef(false);
  const noBuckets = buckets.data?.length === 0;

  const submit = form.handleSubmit((values) =>
    create.mutate(
      newDistributionConfig({ ...values, region }),
      notifyOutcome({
        success: (id) => `Created distribution ${id}`,
        errorHeader: "Couldn't create distribution",
        then: (id) => navigate(cloudfrontRoutes.distribution(id)),
      }),
    ),
  );

  const submitOnce = async () => {
    if (submitting.current) return;
    submitting.current = true;

    try {
      await submit();
    } finally {
      submitting.current = false;
    }
  };

  const actions = (
    <ResponsiveActions footer>
      <Button variant='link' href={cloudfrontRoutes.distributions} onFollow={follow}>
        Cancel
      </Button>
      <Button variant='primary' formAction='submit' loading={create.isPending}>
        Create distribution
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
          <Header
            variant='h1'
            description='Floci serves it at once at a local URL; there is no deploy wait.'
          >
            Create distribution
          </Header>
        }
        actions={actions}
      >
        <SpaceBetween size='l'>
          <Container header={<Header variant='h2'>Origin</Header>}>
            <FormSelect
              control={form.control}
              name='bucket'
              label='Bucket'
              placeholder='Choose a bucket'
              options={(buckets.data ?? []).map(({ Name = "" }) => ({ value: Name, label: Name }))}
              description={
                noBuckets && (
                  <>
                    No buckets yet.{" "}
                    <Link href={s3Routes.createBucket} onFollow={follow}>
                      Create bucket
                    </Link>
                  </>
                )
              }
            />
          </Container>
          <Container header={<Header variant='h2'>Settings</Header>}>
            <SpaceBetween size='l'>
              <FormInput
                control={form.control}
                name='defaultRootObject'
                label='Default root object'
                placeholder={DEFAULT_ROOT_OBJECT}
              />
              <FormCheckbox
                control={form.control}
                name='spa'
                text={SPA_TEXT}
                description={SPA_DESCRIPTION}
              />
              <FormInput control={form.control} name='description' label='Description - optional' />
            </SpaceBetween>
          </Container>
        </SpaceBetween>
      </Form>
    </form>
  );
}
