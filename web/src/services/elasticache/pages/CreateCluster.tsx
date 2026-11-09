import { useNavigate } from "react-router";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormInput, FormRadioGroup } from "@shared/components/form/FormFields.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { CLUSTER_NAME_MAX_LENGTH, DEFAULT_ENGINE, ENGINE_LABELS } from "../constants.ts";
import { useCreateCluster } from "../hooks/useClusters.ts";
import { elasticacheBaseCrumbs, elasticacheRoutes } from "../routes.ts";
import { createClusterSchema, type CreateClusterForm } from "../schemas.ts";

const NAME_CONSTRAINT = `1–${CLUSTER_NAME_MAX_LENGTH} characters: lowercase letters, numbers and hyphens. Start with a letter.`;
const INITIAL_VALUES: CreateClusterForm = { name: "", engine: DEFAULT_ENGINE };
const ENGINE_ITEMS = Object.entries(ENGINE_LABELS).map(([value, label]) => ({ value, label }));

export function CreateCluster() {
  useBreadcrumbs([
    ...elasticacheBaseCrumbs,
    { text: "Create cluster", href: elasticacheRoutes.createCluster },
  ]);
  const follow = useFollow();
  const navigate = useNavigate();
  const createCluster = useCreateCluster();
  const form = useZodForm(createClusterSchema, INITIAL_VALUES);

  const submit = form.handleSubmit((values) =>
    createCluster.mutate(
      values,
      notifyOutcome({
        success: `Created cluster ${values.name}`,
        errorHeader: `Couldn't create ${values.name}`,
        then: () => navigate(elasticacheRoutes.cluster(values.name)),
      }),
    ),
  );

  const actions = (
    <SpaceBetween direction='horizontal' size='xs'>
      <Button variant='link' href={elasticacheRoutes.clusters} onFollow={follow}>
        Cancel
      </Button>
      <Button variant='primary' formAction='submit' loading={createCluster.isPending}>
        Create cluster
      </Button>
    </SpaceBetween>
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Form header={<Header variant='h1'>Create cluster</Header>} actions={actions}>
        <Container
          header={
            <Header variant='h2' description='One node, cluster mode off, no password.'>
              Cluster settings
            </Header>
          }
        >
          <SpaceBetween size='l'>
            <FormInput
              control={form.control}
              name='name'
              label='Name'
              constraintText={NAME_CONSTRAINT}
              placeholder='app-cache'
              autoFocus
            />
            <FormRadioGroup
              control={form.control}
              name='engine'
              label='Engine'
              description='Floci always runs Valkey 8. The engine is a label only.'
              items={ENGINE_ITEMS}
            />
          </SpaceBetween>
        </Container>
      </Form>
    </form>
  );
}
