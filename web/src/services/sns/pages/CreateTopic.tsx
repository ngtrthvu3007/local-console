import { useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import {
  FormToggle,
  FormCheckbox,
  FormInput,
  FormTiles,
} from "@shared/components/form/FormFields.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  FIFO_SUFFIX,
  SNS_KEY_SERVICE,
  TOPIC_NAME_MAX_LENGTH,
  TOPIC_TYPES,
  createTopicSchema,
  type CreateTopicForm,
  snsRoutes,
} from "@localconsole/core/sns";
import { FormKeySelect } from "../../kms/components/KeySelect.tsx";
import { defaultKeyLabel } from "@localconsole/core/kms";
import { useCreateTopic } from "../hooks/useTopics.ts";
import { snsBaseCrumbs } from "../routes.ts";

const NAME_CONSTRAINT = `Up to ${TOPIC_NAME_MAX_LENGTH} characters: letters, numbers, hyphens and underscores. A FIFO topic name ends with ${FIFO_SUFFIX}.`;

const TYPE_ITEMS = [
  {
    value: "standard",
    label: TOPIC_TYPES.standard,
    description: "Best-effort order, at-least-once delivery.",
  },
  {
    value: "fifo",
    label: TOPIC_TYPES.fifo,
    description: "Strict order within a message group, no duplicates.",
  },
];

const INITIAL_VALUES: CreateTopicForm = {
  type: "standard",
  name: "",
  contentBasedDedup: false,
  encrypted: false,
  kmsKeyId: "",
};

export function CreateTopic() {
  useBreadcrumbs([...snsBaseCrumbs, { text: "Create topic", href: snsRoutes.createTopic }]);
  const follow = useFollow();
  const navigate = useNavigate();
  const createTopic = useCreateTopic();
  const form = useZodForm(createTopicSchema, INITIAL_VALUES);
  const type = useWatch({ control: form.control, name: "type" });
  const encrypted = useWatch({ control: form.control, name: "encrypted" });

  const submit = form.handleSubmit((values) =>
    createTopic.mutate(
      values,
      notifyOutcome({
        success: `Created topic ${values.name}`,
        errorHeader: `Couldn't create ${values.name}`,
        then: () => navigate(snsRoutes.topic(values.name)),
      }),
    ),
  );

  const actions = (
    <ResponsiveActions footer>
      <Button variant='link' href={snsRoutes.topics} onFollow={follow}>
        Cancel
      </Button>
      <Button variant='primary' formAction='submit' loading={createTopic.isPending}>
        Create topic
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
      <Form header={<Header variant='h1'>Create topic</Header>} actions={actions}>
        <Container header={<Header variant='h2'>Details</Header>}>
          <SpaceBetween size='l'>
            <FormTiles control={form.control} name='type' label='Type' items={TYPE_ITEMS} />
            <FormInput
              control={form.control}
              name='name'
              label='Name'
              constraintText={NAME_CONSTRAINT}
              placeholder={type === "fifo" ? `order-events${FIFO_SUFFIX}` : "order-events"}
              autoFocus
            />
            {type === "fifo" && (
              <FormCheckbox
                control={form.control}
                name='contentBasedDedup'
                text='Content-based deduplication'
                description='Use a hash of the body as the deduplication ID, so publishers can leave it out.'
              />
            )}
          </SpaceBetween>
        </Container>
        <Container header={<Header variant='h2'>Encryption</Header>}>
          <SpaceBetween size='l'>
            <FormToggle
              control={form.control}
              name='encrypted'
              text='Encrypt messages with a KMS key'
            />
            {encrypted && (
              <FormKeySelect
                control={form.control}
                name='kmsKeyId'
                label='Encryption key'
                defaultLabel={defaultKeyLabel(SNS_KEY_SERVICE)}
              />
            )}
          </SpaceBetween>
        </Container>
      </Form>
    </form>
  );
}
