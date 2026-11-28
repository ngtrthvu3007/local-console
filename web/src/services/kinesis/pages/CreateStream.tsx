import { useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormInput, FormTiles } from "@shared/components/form/FormFields.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  DEFAULT_STREAM_MODE,
  SHARD_COUNT,
  STREAM_MODES,
  STREAM_NAME_MAX_LENGTH,
  kinesisRoutes,
  createStreamSchema,
  type CreateStreamForm,
} from "@localconsole/core/kinesis";
import { useCreateStream } from "../hooks/useStreams.ts";
import { kinesisBaseCrumbs } from "../routes.ts";

const NAME_CONSTRAINT = `Up to ${STREAM_NAME_MAX_LENGTH} characters: letters, numbers, underscores (_), periods (.) and hyphens (-).`;

const MODE_ITEMS = [
  {
    value: "ON_DEMAND",
    label: STREAM_MODES.ON_DEMAND,
    description: "Shards are added and removed for you.",
  },
  {
    value: "PROVISIONED",
    label: STREAM_MODES.PROVISIONED,
    description: "You choose the number of shards.",
  },
];

const INITIAL_VALUES: CreateStreamForm = {
  name: "",
  mode: DEFAULT_STREAM_MODE,
  shards: String(SHARD_COUNT.default),
};

export function CreateStream() {
  useBreadcrumbs([
    ...kinesisBaseCrumbs,
    { text: "Create data stream", href: kinesisRoutes.createStream },
  ]);
  const follow = useFollow();
  const navigate = useNavigate();
  const createStream = useCreateStream();
  const form = useZodForm(createStreamSchema, INITIAL_VALUES);
  const mode = useWatch({ control: form.control, name: "mode" });

  const submit = form.handleSubmit((values) =>
    createStream.mutate(
      values,
      notifyOutcome({
        success: `Created data stream ${values.name}`,
        errorHeader: `Couldn't create ${values.name}`,
        then: () => navigate(kinesisRoutes.stream(values.name)),
      }),
    ),
  );

  const actions = (
    <ResponsiveActions footer>
      <Button variant='link' href={kinesisRoutes.streams} onFollow={follow}>
        Cancel
      </Button>
      <Button variant='primary' formAction='submit' loading={createStream.isPending}>
        Create data stream
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
      <Form header={<Header variant='h1'>Create data stream</Header>} actions={actions}>
        <Container header={<Header variant='h2'>Data stream configuration</Header>}>
          <SpaceBetween size='l'>
            <FormInput
              control={form.control}
              name='name'
              label='Data stream name'
              constraintText={NAME_CONSTRAINT}
              placeholder='clicks'
              autoFocus
            />
            <FormTiles
              control={form.control}
              name='mode'
              label='Capacity mode'
              items={MODE_ITEMS}
            />
            {mode === "PROVISIONED" && (
              <FormInput
                control={form.control}
                name='shards'
                label='Provisioned shards'
                constraintText={`At least ${SHARD_COUNT.min}. Each shard keeps records in order by partition key.`}
                type='number'
              />
            )}
          </SpaceBetween>
        </Container>
      </Form>
    </form>
  );
}
