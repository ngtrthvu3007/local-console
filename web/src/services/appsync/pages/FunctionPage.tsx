import { useWatch } from "react-hook-form";
import { useNavigate, useParams } from "react-router";
import type { DataSource, FunctionConfiguration } from "@aws-sdk/client-appsync";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { LeaveModal } from "@shared/components/LeaveModal.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { FormInput, FormRadioGroup, FormSelect } from "@shared/components/form/FormFields.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { skipLeaveGuard, useLeaveGuard } from "@shared/hooks/useLeaveGuard.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useSubmitOnce } from "@shared/hooks/useSubmitOnce.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  dataSourceOptions,
  formOfFunction,
  DATA_SOURCE_TYPES,
  LAMBDA_INVOKE_NOTE,
  RUNTIME_LABELS,
  RUNTIMES,
  templateFor,
  functionSchema,
  type FunctionForm,
  API_TABS,
  appsyncRoutes,
} from "@localconsole/core/appsync";
import { CodeSection, useCodeTemplate } from "../components/CodeSection.tsx";
import { useDataSources } from "../hooks/useDataSources.ts";
import { useApiFunctions, useSaveFunction } from "../hooks/useFunctions.ts";
import { apiCrumbs } from "../routes.ts";

const RUNTIME_ITEMS = Object.values(RUNTIMES).map((value) => ({
  value,
  label: RUNTIME_LABELS[value],
}));
const CODE_NAMES = { code: "code", request: "request", response: "response" } as const;

interface EditorProps {
  apiId: string;
  fn?: FunctionConfiguration;
  functions: FunctionConfiguration[];
  dataSources: DataSource[];
}

function FunctionEditor({ apiId, fn, functions, dataSources }: EditorProps) {
  const follow = useFollow();
  const navigate = useNavigate();
  const save = useSaveFunction(apiId);
  const backHref = appsyncRoutes.api(apiId, API_TABS.functions);
  const firstDataSource = dataSources[0];
  const otherNames = functions.flatMap(({ name, functionId }) =>
    name && functionId !== fn?.functionId ? [name] : [],
  );
  const initial: FunctionForm = fn
    ? formOfFunction(fn)
    : {
        name: "",
        dataSourceName: firstDataSource?.name ?? "",
        runtime: RUNTIMES.js,
        code: "",
        request: "",
        response: "",
        ...templateFor(firstDataSource?.type ?? DATA_SOURCE_TYPES.none, RUNTIMES.js),
      };
  const form = useZodForm(functionSchema(otherNames), initial);
  const [runtime, dataSourceName] = useWatch({
    control: form.control,
    name: ["runtime", "dataSourceName"],
  });
  const dataSourceType = dataSources.find((dataSource) => dataSource.name === dataSourceName)?.type;

  useCodeTemplate(
    templateFor(dataSourceType ?? DATA_SOURCE_TYPES.none, runtime),
    () => form.getValues(),
    (name, value) => form.setValue(name, value),
  );

  const submit = form.handleSubmit((values) =>
    save.mutate(
      { functionId: fn?.functionId, form: values },
      notifyOutcome({
        success: `Saved function ${values.name.trim()}`,
        errorHeader: "Couldn't save function",
        then: () => navigate(backHref, skipLeaveGuard),
      }),
    ),
  );
  const submitOnce = useSubmitOnce(submit);
  // Code chưa lưu: rời trang (Cancel, breadcrumb, đóng tab) thì hỏi lại; lưu xong đi thẳng
  const leaveBlocker = useLeaveGuard(form.formState.isDirty);

  const actions = (
    <ResponsiveActions footer>
      <Button variant='link' href={backHref} onFollow={follow}>
        Cancel
      </Button>
      <Button variant='primary' formAction='submit' loading={save.isPending}>
        Save
      </Button>
    </ResponsiveActions>
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submitOnce();
      }}
    >
      <Form
        header={<Header variant='h1'>{fn ? `Function ${fn.name}` : "Create function"}</Header>}
        actions={actions}
      >
        <SpaceBetween size='l'>
          <Container header={<Header variant='h2'>Configuration</Header>}>
            <SpaceBetween size='l'>
              <FormInput control={form.control} name='name' label='Name' placeholder='saveTodo' />
              <FormRadioGroup
                control={form.control}
                name='runtime'
                label='Runtime'
                items={RUNTIME_ITEMS}
              />
              <FormSelect
                control={form.control}
                name='dataSourceName'
                label='Data source'
                placeholder='Choose a data source'
                description={
                  dataSourceType === DATA_SOURCE_TYPES.lambda ? LAMBDA_INVOKE_NOTE : undefined
                }
                options={dataSourceOptions(dataSources)}
              />
            </SpaceBetween>
          </Container>
          <CodeSection control={form.control} runtime={runtime} names={CODE_NAMES} />
        </SpaceBetween>
      </Form>
      <LeaveModal blocker={leaveBlocker}>
        Your function changes aren&apos;t saved and will be lost.
      </LeaveModal>
    </form>
  );
}

// Tạo (không có functionId trên route) hoặc sửa function của pipeline
export function FunctionPage() {
  const { apiId = "", functionId } = useParams();
  const functions = useApiFunctions(apiId);
  const dataSources = useDataSources(apiId);
  const fn = functions.data?.find((candidate) => candidate.functionId === functionId);

  useBreadcrumbs([
    ...apiCrumbs(apiId),
    {
      text: fn?.name ?? (functionId ? functionId : "Create function"),
      href: functionId
        ? appsyncRoutes.function(apiId, functionId)
        : appsyncRoutes.createFunction(apiId),
    },
  ]);

  const pending =
    [functions, dataSources].find((query) => query.isLoading || query.isError) ?? functions;
  const state = pageState(pending, {
    ready: Boolean(functions.data && dataSources.data),
    notFound: Boolean(functionId && functions.data && !fn),
    title: `Function ${functionId} not found`,
    backHref: appsyncRoutes.api(apiId, API_TABS.functions),
    backText: "View functions",
  });
  if (state || !functions.data || !dataSources.data) return state;

  return (
    <FunctionEditor
      apiId={apiId}
      fn={fn}
      functions={functions.data}
      dataSources={dataSources.data}
    />
  );
}
