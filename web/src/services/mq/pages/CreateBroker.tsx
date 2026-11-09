import { useNavigate } from "react-router";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormInput } from "@shared/components/form/FormFields.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  BROKER_NAME_MAX_LENGTH,
  PASSWORD_FORBIDDEN_CHARACTERS,
  PASSWORD_LENGTH,
  USERNAME_LENGTH,
} from "../constants.ts";
import { useCreateBroker } from "../hooks/useBrokers.ts";
import { mqBaseCrumbs, mqRoutes } from "../routes.ts";
import { createBrokerSchema, type CreateBrokerForm } from "../schemas.ts";

const INITIAL_VALUES: CreateBrokerForm = { name: "", username: "", password: "" };

export function CreateBroker() {
  useBreadcrumbs([...mqBaseCrumbs, { text: "Create broker", href: mqRoutes.createBroker }]);
  const follow = useFollow();
  const navigate = useNavigate();
  const createBroker = useCreateBroker();
  const form = useZodForm(createBrokerSchema, INITIAL_VALUES);

  const submit = form.handleSubmit((values) =>
    createBroker.mutate(
      values,
      notifyOutcome({
        success: `Creating broker ${values.name}`,
        errorHeader: `Couldn't create ${values.name}`,
        then: (result) => navigate(mqRoutes.broker(result.BrokerId!)),
      }),
    ),
  );

  const actions = (
    <SpaceBetween direction='horizontal' size='xs'>
      <Button variant='link' href={mqRoutes.brokers} onFollow={follow}>
        Cancel
      </Button>
      <Button variant='primary' formAction='submit' loading={createBroker.isPending}>
        Create broker
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
      <Form header={<Header variant='h1'>Create broker</Header>} actions={actions}>
        <Container
          header={
            <Header variant='h2' description='RabbitMQ, single instance.'>
              Broker settings
            </Header>
          }
        >
          <SpaceBetween size='l'>
            <FormInput
              control={form.control}
              name='name'
              label='Name'
              constraintText={`1–${BROKER_NAME_MAX_LENGTH} characters: letters, numbers, hyphens and underscores.`}
              placeholder='orders-mq'
              autoFocus
            />
            <FormInput
              control={form.control}
              name='username'
              label='Username'
              constraintText={`${USERNAME_LENGTH.min}–${USERNAME_LENGTH.max} characters. Can't be "guest".`}
              placeholder='admin'
            />
            <FormInput
              control={form.control}
              name='password'
              label='Password'
              type='password'
              description="AWS doesn't return the password later. Keep it for your app's settings."
              constraintText={`At least ${PASSWORD_LENGTH.min} characters, no ${PASSWORD_FORBIDDEN_CHARACTERS.join(" ")}.`}
            />
          </SpaceBetween>
        </Container>
      </Form>
    </form>
  );
}
