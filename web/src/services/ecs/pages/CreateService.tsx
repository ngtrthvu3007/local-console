import { useNavigate, useParams } from "react-router";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormInput } from "@shared/components/form/FormFields.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useSubmitOnce } from "@shared/hooks/useSubmitOnce.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { NetworkFields } from "../components/NetworkFields.tsx";
import { TaskDefinitionFields } from "../components/TaskDefinitionFields.tsx";
import {
  DESIRED_COUNT,
  RESOURCE_NAME_RULE,
  serviceSchema,
  ecsRoutes,
} from "@localconsole/core/ecs";
import { useCreateService } from "../hooks/useServices.ts";
import { clusterCrumbs } from "../routes.ts";

const NETWORK_NAMES = { subnets: "subnets", securityGroups: "securityGroups" } as const;
const DEFINITION_NAMES = { family: "family", revision: "revision" } as const;

export function CreateService() {
  const { cluster = "" } = useParams();
  const follow = useFollow();
  const navigate = useNavigate();
  const createService = useCreateService(cluster);
  const form = useZodForm(serviceSchema, {
    name: "",
    family: "",
    revision: "",
    desiredCount: String(DESIRED_COUNT.default),
    subnets: [],
    securityGroups: [],
  });
  const backHref = ecsRoutes.cluster(cluster);

  useBreadcrumbs([
    ...clusterCrumbs(cluster),
    { text: "Create service", href: ecsRoutes.createService(cluster) },
  ]);

  const submit = form.handleSubmit((values) =>
    createService.mutate(
      values,
      notifyOutcome({
        success: `Created service ${values.name}`,
        errorHeader: `Couldn't create ${values.name}`,
        then: (name) => navigate(ecsRoutes.service(cluster, name)),
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
          <Header
            variant='h1'
            description={`Keeps a number of tasks running on ${cluster} (Fargate) and replaces the ones that stop.`}
          >
            Create service
          </Header>
        }
        actions={
          <ResponsiveActions footer>
            <Button variant='link' href={backHref} onFollow={follow}>
              Cancel
            </Button>
            <Button variant='primary' formAction='submit' loading={createService.isPending}>
              Create service
            </Button>
          </ResponsiveActions>
        }
      >
        <SpaceBetween size='l'>
          <Container header={<Header variant='h2'>Service</Header>}>
            <SpaceBetween size='l'>
              <FormInput
                control={form.control}
                name='name'
                label='Service name'
                constraintText={RESOURCE_NAME_RULE}
                placeholder='api'
              />
              <TaskDefinitionFields control={form.control} names={DEFINITION_NAMES} />
              <FormInput control={form.control} name='desiredCount' label='Desired tasks' />
            </SpaceBetween>
          </Container>
          <Container header={<Header variant='h2'>Networking</Header>}>
            <SpaceBetween size='l'>
              <NetworkFields control={form.control} names={NETWORK_NAMES} />
            </SpaceBetween>
          </Container>
        </SpaceBetween>
      </Form>
    </form>
  );
}
