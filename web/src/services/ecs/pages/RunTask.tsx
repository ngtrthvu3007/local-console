import { useEffect } from "react";
import { Controller, useWatch, type Control } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router";
import type { ContainerOverride } from "@aws-sdk/client-ecs";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormInput, FormSelect } from "@shared/components/form/FormFields.tsx";
import { KeyValueEditor } from "@shared/components/KeyValueEditor.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { pluralize } from "@localconsole/core/shared";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { useSubmitOnce } from "@shared/hooks/useSubmitOnce.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  taskDefinitionRefOf,
  taskIdOf,
  LAUNCH_TYPE,
  TASK_COUNT,
  runTaskSchema,
  type RunTaskForm,
  type RunTaskValues,
  CLUSTER_TABS,
  SEARCH_PARAMS,
  ecsRoutes,
} from "@localconsole/core/ecs";
import { NetworkFields } from "../components/NetworkFields.tsx";
import { TaskDefinitionFields } from "../components/TaskDefinitionFields.tsx";
import { useClusters } from "../hooks/useClusters.ts";
import { useTaskDefinition } from "../hooks/useTaskDefinitions.ts";
import { useRunTask } from "../hooks/useTasks.ts";
import { ecsClusterCrumbs } from "../routes.ts";

const NETWORK_NAMES = { subnets: "subnets", securityGroups: "securityGroups" } as const;
const DEFINITION_NAMES = { family: "family", revision: "revision" } as const;

// Chỉ gửi container có ghi đè; command trống = giữ command của task definition
const containerOverrides = (overrides: RunTaskValues["overrides"]): ContainerOverride[] =>
  overrides
    .filter((override) => override.command || override.environment.length)
    .map((override) => ({
      name: override.container,
      command: override.command,
      environment: override.environment.map(({ key, value }) => ({ name: key, value })),
    }));

function ContainerOverrides({
  control,
}: {
  control: Control<RunTaskForm, unknown, RunTaskValues>;
}) {
  const overrides = useWatch({ control, name: "overrides" });

  return (
    <Container
      header={
        <Header
          variant='h2'
          description='Change the command or add environment variables for this run only.'
        >
          Container overrides - optional
        </Header>
      }
    >
      <SpaceBetween size='l'>
        {overrides.map((override, index) => (
          <SpaceBetween size='s' key={override.container}>
            <FormInput
              control={control}
              name={`overrides.${index}.command`}
              label={`${override.container}: command`}
              placeholder='["sh","-c","echo hi"]'
            />
            <Controller
              control={control}
              name={`overrides.${index}.environment`}
              render={({ field, formState }) => (
                <FormField label={`${override.container}: environment variables`} stretch>
                  <KeyValueEditor
                    items={field.value}
                    onChange={field.onChange}
                    keyError={(row) =>
                      formState.errors.overrides?.[index]?.environment?.[row]?.key?.message
                    }
                    itemLabel='environment variable'
                  />
                </FormField>
              )}
            />
          </SpaceBetween>
        ))}
      </SpaceBetween>
    </Container>
  );
}

// ?cluster= và ?taskDefinition=<family:revision> điền sẵn khi mở từ cluster hoặc revision
export function RunTask() {
  const follow = useFollow();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefilledCluster = searchParams.get(SEARCH_PARAMS.cluster) ?? "";
  const prefilled = taskDefinitionRefOf(searchParams.get(SEARCH_PARAMS.taskDefinition) ?? "");
  const clusters = useClusters();
  const runTask = useRunTask();
  const form = useZodForm(runTaskSchema, {
    cluster: prefilledCluster,
    family: prefilled.family,
    revision: prefilled.revision ? String(prefilled.revision) : "",
    count: String(TASK_COUNT.default),
    subnets: [],
    securityGroups: [],
    overrides: [],
  });
  const { setValue } = form;
  const [family, revision] = useWatch({ control: form.control, name: ["family", "revision"] });
  const definition = useTaskDefinition(family, Number(revision)).data;
  const backHref = prefilledCluster ? ecsRoutes.cluster(prefilledCluster) : ecsRoutes.clusters;

  useBreadcrumbs([...ecsClusterCrumbs, { text: "Run task", href: ecsRoutes.runTask() }]);

  // Mỗi container của revision đang chọn một dòng ghi đè; definition giữ cùng tham chiếu khi dữ liệu
  // không đổi (structural sharing của TanStack Query) nên chỉ đặt lại khi đổi revision
  useEffect(() => {
    setValue(
      "overrides",
      (definition?.containerDefinitions ?? []).map((container) => ({
        container: container.name ?? "",
        command: "",
        environment: [],
      })),
    );
  }, [definition, setValue]);

  const submit = form.handleSubmit((values) =>
    runTask.mutate(
      {
        cluster: values.cluster,
        taskDefinition: `${values.family}:${values.revision}`,
        count: values.count,
        launchType: LAUNCH_TYPE,
        networkConfiguration: {
          awsvpcConfiguration: {
            subnets: values.subnets,
            securityGroups: values.securityGroups.length ? values.securityGroups : undefined,
          },
        },
        overrides: { containerOverrides: containerOverrides(values.overrides) },
      },
      // Chạy được một phần thì vẫn báo từng failure (cảnh báo) và mở task đã chạy
      notifyBulkOutcome({
        success: (result) => `Started ${pluralize(result.count, "task")}`,
        errorHeader: "Couldn't run the task",
        then: ({ tasks }) => {
          const [task] = tasks;
          navigate(
            tasks.length === 1 && task?.taskArn
              ? ecsRoutes.task(values.cluster, taskIdOf(task.taskArn))
              : ecsRoutes.cluster(values.cluster, CLUSTER_TABS.tasks),
          );
        },
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
            description='Floci runs each task as Docker containers on Fargate. The first run of an image waits for the pull.'
          >
            Run task
          </Header>
        }
        actions={
          <ResponsiveActions footer>
            <Button variant='link' href={backHref} onFollow={follow}>
              Cancel
            </Button>
            <Button variant='primary' formAction='submit' loading={runTask.isPending}>
              Run task
            </Button>
          </ResponsiveActions>
        }
      >
        <SpaceBetween size='l'>
          <Container header={<Header variant='h2'>Task</Header>}>
            <SpaceBetween size='l'>
              <FormSelect
                control={form.control}
                name='cluster'
                label='Cluster'
                placeholder='Choose a cluster'
                empty='No clusters'
                options={(clusters.data ?? []).map(({ name }) => ({ value: name, label: name }))}
              />
              <TaskDefinitionFields control={form.control} names={DEFINITION_NAMES} />
              <FormInput
                control={form.control}
                name='count'
                label='Number of tasks'
                constraintText={`From ${TASK_COUNT.min} to ${TASK_COUNT.max}.`}
              />
            </SpaceBetween>
          </Container>
          <Container header={<Header variant='h2'>Networking</Header>}>
            <SpaceBetween size='l'>
              <NetworkFields control={form.control} names={NETWORK_NAMES} />
            </SpaceBetween>
          </Container>
          <ContainerOverrides control={form.control} />
        </SpaceBetween>
      </Form>
    </form>
  );
}
