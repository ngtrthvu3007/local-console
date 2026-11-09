import { useNavigate } from "react-router";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormInput, FormSelect } from "@shared/components/form/FormFields.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { CODE_TEMPLATES, inlineLanguageOf } from "../codeTemplates.ts";
import {
  DEFAULT_RUNTIME,
  FUNCTION_NAME_MAX_LENGTH,
  MEMORY_LIMITS_MB,
  RUNTIME_OPTIONS,
  TIMEOUT_LIMITS_SECONDS,
} from "../constants.ts";
import { useCreateFunction } from "../hooks/useFunctions.ts";
import { lambdaBaseCrumbs, lambdaRoutes } from "../routes.ts";
import { createFunctionSchema } from "../schemas.ts";
import { zipPackage } from "../zipArchive.ts";

const NAME_CONSTRAINT = `1–${FUNCTION_NAME_MAX_LENGTH} characters: letters, numbers, hyphens and underscores.`;
const MEMORY_CONSTRAINT = `${MEMORY_LIMITS_MB.min}–${MEMORY_LIMITS_MB.max} MB.`;
const TIMEOUT_CONSTRAINT = `${TIMEOUT_LIMITS_SECONDS.min}–${TIMEOUT_LIMITS_SECONDS.max} seconds.`;

export function CreateFunction() {
  useBreadcrumbs([
    ...lambdaBaseCrumbs,
    { text: "Create function", href: lambdaRoutes.createFunction },
  ]);
  const follow = useFollow();
  const navigate = useNavigate();
  const createFunction = useCreateFunction();
  const form = useZodForm(createFunctionSchema, {
    name: "",
    runtime: DEFAULT_RUNTIME,
    memory: String(MEMORY_LIMITS_MB.default),
    timeout: String(TIMEOUT_LIMITS_SECONDS.default),
  });

  // Function mới luôn bắt đầu bằng code Hello world của runtime; sửa tiếp ở tab Code
  const submit = form.handleSubmit(({ name, runtime, memory, timeout }) => {
    const template = CODE_TEMPLATES[inlineLanguageOf(runtime) ?? "javascript"];
    createFunction.mutate(
      {
        name,
        runtime,
        memory,
        timeout,
        handler: template.handler,
        zipFile: zipPackage({}, { [template.fileName]: template.code }),
      },
      notifyOutcome({
        success: `Created function ${name}`,
        errorHeader: `Couldn't create ${name}`,
        then: () => navigate(lambdaRoutes.function(name)),
      }),
    );
  });

  const actions = (
    <SpaceBetween direction='horizontal' size='xs'>
      <Button variant='link' href={lambdaRoutes.functions} onFollow={follow}>
        Cancel
      </Button>
      <Button variant='primary' formAction='submit' loading={createFunction.isPending}>
        Create function
      </Button>
    </SpaceBetween>
  );

  const basicInformation = (
    <Container
      header={
        <Header variant='h2' description='The function starts with Hello world code.'>
          Basic information
        </Header>
      }
    >
      <SpaceBetween size='l'>
        <FormInput
          control={form.control}
          name='name'
          label='Function name'
          constraintText={NAME_CONSTRAINT}
          placeholder='my-function'
          autoFocus
        />
        <FormSelect
          control={form.control}
          name='runtime'
          label='Runtime'
          description='Node.js and Python, so the code can be edited on the page.'
          options={RUNTIME_OPTIONS}
        />
      </SpaceBetween>
    </Container>
  );

  const additionalSettings = (
    <ExpandableSection variant='container' headerText='Additional settings'>
      <ColumnLayout columns={2}>
        <FormInput
          control={form.control}
          name='memory'
          label='Memory (MB)'
          constraintText={MEMORY_CONSTRAINT}
        />
        <FormInput
          control={form.control}
          name='timeout'
          label='Timeout (seconds)'
          constraintText={TIMEOUT_CONSTRAINT}
        />
      </ColumnLayout>
    </ExpandableSection>
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Form header={<Header variant='h1'>Create function</Header>} actions={actions}>
        <SpaceBetween size='l'>
          {basicInformation}
          {additionalSettings}
        </SpaceBetween>
      </Form>
    </form>
  );
}
