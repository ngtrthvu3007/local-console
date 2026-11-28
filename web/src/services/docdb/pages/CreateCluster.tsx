import { useNavigate } from "react-router";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormInput, FormSelect } from "@shared/components/form/FormFields.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { useSubmitOnce } from "@shared/hooks/useSubmitOnce.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  CLASS_OPTIONS,
  DEFAULT_INSTANCE_CLASS,
  INSTANCE_COUNT,
  CLUSTER_IDENTIFIER_RULE,
  PASSWORD_RULE,
  USERNAME_RULE,
  createClusterSchema,
  type CreateClusterForm,
  docdbRoutes,
} from "@localconsole/core/docdb";
import { TEXT } from "../constants.ts";
import { useCreateCluster } from "../hooks/useClusters.ts";
import { docdbBaseCrumbs } from "../routes.ts";

const INITIAL_VALUES: CreateClusterForm = {
  identifier: "",
  username: "",
  password: "",
  confirmPassword: "",
  instanceClass: DEFAULT_INSTANCE_CLASS,
  instanceCount: String(INSTANCE_COUNT.default),
};

export function CreateCluster() {
  const follow = useFollow();
  const navigate = useNavigate();
  const createCluster = useCreateCluster();
  const form = useZodForm(createClusterSchema, INITIAL_VALUES);

  useBreadcrumbs([...docdbBaseCrumbs, { text: "Create cluster", href: docdbRoutes.createCluster }]);

  const submit = form.handleSubmit((values) =>
    createCluster.mutate(
      values,
      // Instance lỗi thì vẫn mở trang cluster (đã tạo), cảnh báo kèm instance lỗi
      notifyBulkOutcome({
        success: () => `Created cluster ${values.identifier}`,
        errorHeader: `Couldn't create ${values.identifier}`,
        then: ({ id }) => navigate(docdbRoutes.cluster(id)),
      }),
    ),
  );
  const submitOnce = useSubmitOnce(submit);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submitOnce();
      }}
    >
      <Form
        header={
          <Header variant='h1' description={TEXT.firstCluster}>
            Create cluster
          </Header>
        }
        actions={
          <ResponsiveActions footer>
            <Button variant='link' href={docdbRoutes.clusters} onFollow={follow}>
              Cancel
            </Button>
            <Button variant='primary' formAction='submit' loading={createCluster.isPending}>
              Create cluster
            </Button>
          </ResponsiveActions>
        }
      >
        <SpaceBetween size='l'>
          <Container header={<Header variant='h2'>Cluster</Header>}>
            <SpaceBetween size='l'>
              <FormInput
                control={form.control}
                name='identifier'
                label='Cluster identifier'
                constraintText={CLUSTER_IDENTIFIER_RULE}
                placeholder='orders-db'
              />
              <FormSelect
                control={form.control}
                name='instanceClass'
                label='Instance class'
                options={CLASS_OPTIONS}
              />
              <FormInput
                control={form.control}
                name='instanceCount'
                label='Number of instances'
                constraintText={`From ${INSTANCE_COUNT.min} to ${INSTANCE_COUNT.max}.`}
              />
            </SpaceBetween>
          </Container>
          <Container
            header={
              <Header variant='h2' description={TEXT.password}>
                Authentication
              </Header>
            }
          >
            <SpaceBetween size='l'>
              <FormInput
                control={form.control}
                name='username'
                label='Master username'
                constraintText={USERNAME_RULE}
              />
              <FormInput
                control={form.control}
                name='password'
                label='Master password'
                type='password'
                constraintText={PASSWORD_RULE}
              />
              <FormInput
                control={form.control}
                name='confirmPassword'
                label='Confirm master password'
                type='password'
              />
            </SpaceBetween>
          </Container>
        </SpaceBetween>
      </Form>
    </form>
  );
}
