import { useNavigate, useSearchParams } from "react-router";
import type { RegisterTaskDefinitionCommandInput } from "@aws-sdk/client-ecs";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import { LeaveModal } from "@shared/components/LeaveModal.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { FormValueEditor } from "@shared/components/ValueEditor.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { skipLeaveGuard, useLeaveGuard } from "@shared/hooks/useLeaveGuard.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useSubmitOnce } from "@shared/hooks/useSubmitOnce.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  taskDefinitionRefOf,
  taskDefinitionFormSchema,
  newTaskDefinitionText,
  revisionText,
  SEARCH_PARAMS,
  ecsRoutes,
} from "@localconsole/core/ecs";
import { useRegisterTaskDefinition, useTaskDefinition } from "../hooks/useTaskDefinitions.ts";
import { ecsTaskDefinitionCrumbs } from "../routes.ts";

const EDITOR_HEIGHT_PX = 480;

interface EditorProps {
  title: string;
  initialText: string;
  backHref: string;
}

function Editor({ title, initialText, backHref }: EditorProps) {
  const follow = useFollow();
  const navigate = useNavigate();
  const register = useRegisterTaskDefinition();
  const form = useZodForm(taskDefinitionFormSchema, { json: initialText });

  const submit = form.handleSubmit(({ json }) =>
    register.mutate(
      // Schema chỉ kiểm family + containerDefinitions; trường còn lại gửi nguyên văn, Floci tự báo lỗi
      json as RegisterTaskDefinitionCommandInput,
      notifyOutcome({
        success: ({ family, revision }) => `Registered ${family}:${revision}`,
        errorHeader: "Couldn't register the task definition",
        then: ({ family, revision }) =>
          navigate(ecsRoutes.revision(family, revision), skipLeaveGuard),
      }),
    ),
  );
  const submitOnce = useSubmitOnce(submit);
  // JSON chưa lưu: rời trang thì hỏi lại; đăng ký xong đi thẳng
  const leaveBlocker = useLeaveGuard(form.formState.isDirty);

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
            description='The input of RegisterTaskDefinition. Saving registers a new revision.'
          >
            {title}
          </Header>
        }
        actions={
          <ResponsiveActions footer>
            <Button variant='link' href={backHref} onFollow={follow}>
              Cancel
            </Button>
            <Button variant='primary' formAction='submit' loading={register.isPending}>
              Create
            </Button>
          </ResponsiveActions>
        }
      >
        <Container>
          <FormValueEditor
            control={form.control}
            name='json'
            label='Task definition JSON'
            language='json'
            height={EDITOR_HEIGHT_PX}
          />
        </Container>
      </Form>
      <LeaveModal blocker={leaveBlocker}>
        Your task definition isn&apos;t registered and will be lost.
      </LeaveModal>
    </form>
  );
}

// ?from=<family:revision>: điền sẵn revision đó, bỏ trường chỉ đọc; không có thì dùng mẫu
export function TaskDefinitionEditor() {
  const [searchParams] = useSearchParams();
  const from = searchParams.get(SEARCH_PARAMS.from) ?? "";
  const source = taskDefinitionRefOf(from);
  const { region } = useLoadedConfig();
  const existing = useTaskDefinition(source.family, source.revision);

  useBreadcrumbs([
    ...ecsTaskDefinitionCrumbs,
    { text: from ? "Create new revision" : "Create", href: ecsRoutes.createTaskDefinition(from) },
  ]);

  if (!from) {
    return (
      <Editor
        title='Create new task definition'
        initialText={newTaskDefinitionText(region)}
        backHref={ecsRoutes.taskDefinitions}
      />
    );
  }

  const state = pageState(existing, {
    ready: Boolean(existing.data),
    notFound: existing.data === null,
    title: `Task definition ${from} not found`,
    backHref: ecsRoutes.taskDefinitions,
    backText: "View task definitions",
  });
  if (state || !existing.data) return state;

  return (
    <Editor
      title={`Create new revision of ${source.family}`}
      initialText={revisionText(existing.data)}
      backHref={ecsRoutes.revision(source.family, source.revision)}
    />
  );
}
