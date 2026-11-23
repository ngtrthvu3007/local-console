import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormInput } from "@shared/components/form/FormFields.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { FormValueEditor } from "@shared/components/ValueEditor.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { errorMessage, notifyInfo } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  EDIT_TEMPLATE_NOTE,
  LOADING_EDIT_LOCK_REASON,
  NO_CHANGES_NOTICE,
  STARTER_TEMPLATE,
  TEMPLATE_EDITOR_HEIGHT_PX,
} from "../constants.ts";
import {
  useDeployStack,
  useStack,
  useStackResources,
  useStackTemplate,
} from "../hooks/useStacks.ts";
import { cloudformationRoutes, stackCrumbs, stacksCrumbs } from "../routes.ts";
import { stackTemplateSchema } from "../schemas.ts";
import { isStackMissing } from "../stacks.ts";
import { editLockReason, isNoUpdatesError } from "../status.ts";

interface ViewProps {
  stack?: string; // có thì là sửa: tên stack bị khóa
  template: string;
  lockReason?: string; // có thì không cho Deploy (vd: stack của CDK)
}

function StackTemplateFormView({ stack, template, lockReason }: ViewProps) {
  const follow = useFollow();
  const navigate = useNavigate();
  const editing = stack !== undefined;
  // Rời trang khi đang deploy: hook báo kết quả bằng flash thay cho trang
  const open = useRef(true);

  useEffect(() => {
    open.current = true;

    return () => {
      open.current = false;
    };
  }, []);

  const deploy = useDeployStack(editing, () => open.current);
  const form = useZodForm(stackTemplateSchema(editing), { name: stack ?? "", template });

  const submit = form.handleSubmit((values) =>
    deploy.mutate(values, {
      onSuccess: () => navigate(cloudformationRoutes.stack(values.name)),
      // Lỗi gốc của Floci nằm dưới editor, nội dung đang soạn giữ nguyên
      onError: (error) =>
        isNoUpdatesError(error)
          ? notifyInfo(NO_CHANGES_NOTICE)
          : form.setError("template", { message: errorMessage(error) }),
    }),
  );

  const actions = (
    <ResponsiveActions footer>
      <Button
        variant='link'
        href={editing ? cloudformationRoutes.stack(stack) : cloudformationRoutes.stacks}
        onFollow={follow}
      >
        Cancel
      </Button>
      <Button
        variant='primary'
        formAction='submit'
        loading={deploy.isPending}
        disabled={Boolean(lockReason)}
        disabledReason={lockReason}
      >
        Deploy
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
      <Form
        header={<Header variant='h1'>{editing ? `Edit ${stack}` : "Create stack"}</Header>}
        actions={actions}
      >
        <Container>
          <SpaceBetween size='l'>
            {lockReason && lockReason !== LOADING_EDIT_LOCK_REASON && (
              <Alert type='warning'>{lockReason}</Alert>
            )}

            {editing ? (
              <FormField label='Stack name'>
                <Box>{stack}</Box>
              </FormField>
            ) : (
              <FormInput control={form.control} name='name' label='Stack name' autoFocus />
            )}

            <FormValueEditor
              control={form.control}
              name='template'
              label='Template (YAML)'
              language='yaml'
              height={TEMPLATE_EDITOR_HEIGHT_PX}
              description={editing ? EDIT_TEMPLATE_NOTE : undefined}
            />
          </SpaceBetween>
        </Container>
      </Form>
    </form>
  );
}

function EditStackTemplate({ stack }: { stack: string }) {
  const template = useStackTemplate(stack);
  // Cùng điều kiện khóa với nút Edit template: người dùng có thể gõ thẳng URL
  const status = useStack(stack).data?.StackStatus;
  const resources = useStackResources(stack, false).data;

  const state = pageState(template, {
    ready: template.data !== undefined,
    notFound: template.isError && isStackMissing(template.error),
    title: `Stack ${stack} not found`,
    backHref: cloudformationRoutes.stacks,
    backText: "View stacks",
  });

  if (state || template.data === undefined) return state;

  return (
    <StackTemplateFormView
      stack={stack}
      template={template.data}
      lockReason={editLockReason(status, resources)}
    />
  );
}

export function StackTemplateForm() {
  const { stack } = useParams();

  useBreadcrumbs(
    stack
      ? [
          ...stackCrumbs(stack),
          { text: "Edit template", href: cloudformationRoutes.editStack(stack) },
        ]
      : [...stacksCrumbs, { text: "Create stack", href: cloudformationRoutes.createStack }],
  );

  return stack ? (
    <EditStackTemplate stack={stack} />
  ) : (
    <StackTemplateFormView template={STARTER_TEMPLATE} />
  );
}
