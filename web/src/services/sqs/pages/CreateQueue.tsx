import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormCheckbox, FormInput, FormTiles } from "@shared/components/form/FormFields.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { FIFO_SUFFIX, QUEUE_NAME_MAX_LENGTH, QUEUE_TYPES } from "../constants.ts";
import { useCreateQueue } from "../hooks/useQueues.ts";
import { sqsBaseCrumbs, sqsRoutes } from "../routes.ts";
import { createQueueSchema, type CreateQueueForm } from "../schemas.ts";

const NAME_CONSTRAINT = `Up to ${QUEUE_NAME_MAX_LENGTH} characters: letters, numbers, hyphens and underscores. A FIFO queue name ends with ${FIFO_SUFFIX}.`;

const TYPE_ITEMS = [
  {
    value: "standard",
    label: QUEUE_TYPES.standard,
    description: "At-least-once delivery, best-effort order.",
  },
  {
    value: "fifo",
    label: QUEUE_TYPES.fifo,
    description: "Exactly-once processing, in order within a message group.",
  },
];

const INITIAL_VALUES: CreateQueueForm = { type: "standard", name: "", contentBasedDedup: false };

export function CreateQueue() {
  useBreadcrumbs([...sqsBaseCrumbs, { text: "Create queue", href: sqsRoutes.createQueue }]);
  const follow = useFollow();
  const navigate = useNavigate();
  const createQueue = useCreateQueue();
  const form = useZodForm(createQueueSchema, INITIAL_VALUES);
  const type = useWatch({ control: form.control, name: "type" });

  const submit = form.handleSubmit((values) =>
    createQueue.mutate(
      values,
      notifyOutcome({
        success: `Created queue ${values.name}`,
        errorHeader: `Couldn't create ${values.name}`,
        then: () => navigate(sqsRoutes.queue(values.name)),
      }),
    ),
  );

  const actions = (
    <ResponsiveActions footer>
      <Button variant='link' href={sqsRoutes.queues} onFollow={follow}>
        Cancel
      </Button>
      <Button variant='primary' formAction='submit' loading={createQueue.isPending}>
        Create queue
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
      <Form header={<Header variant='h1'>Create queue</Header>} actions={actions}>
        <Container
          header={
            <Header variant='h2' description='Default SQS settings. Change them later in Settings.'>
              Details
            </Header>
          }
        >
          <SpaceBetween size='l'>
            <FormTiles control={form.control} name='type' label='Type' items={TYPE_ITEMS} />
            <FormInput
              control={form.control}
              name='name'
              label='Name'
              constraintText={NAME_CONSTRAINT}
              placeholder={type === "fifo" ? `orders${FIFO_SUFFIX}` : "orders"}
              autoFocus
            />
            {type === "fifo" && (
              <FormCheckbox
                control={form.control}
                name='contentBasedDedup'
                text='Content-based deduplication'
                description='Use a hash of the body as the deduplication ID, so senders can leave it out.'
              />
            )}
          </SpaceBetween>
        </Container>
      </Form>
    </form>
  );
}
