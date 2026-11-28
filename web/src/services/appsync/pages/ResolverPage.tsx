import { useWatch } from "react-hook-form";
import { useNavigate, useParams } from "react-router";
import type { DataSource, FunctionConfiguration, Resolver } from "@aws-sdk/client-appsync";
import AttributeEditor from "@cloudscape-design/components/attribute-editor";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { Controller } from "react-hook-form";
import { LeaveModal } from "@shared/components/LeaveModal.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { FormRadioGroup, FormSelect, FormTiles } from "@shared/components/form/FormFields.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { skipLeaveGuard, useLeaveGuard } from "@shared/hooks/useLeaveGuard.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useSubmitOnce } from "@shared/hooks/useSubmitOnce.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  dataSourceOptions,
  formOfResolver,
  moveAt,
  DATA_SOURCE_TYPES,
  LAMBDA_INVOKE_NOTE,
  RESOLVER_KINDS,
  RUNTIME_LABELS,
  RUNTIMES,
  PIPELINE_TEMPLATE,
  templateFor,
  resolverSchema,
  type ResolverForm,
  API_TABS,
  appsyncRoutes,
} from "@localconsole/core/appsync";
import { CodeSection, useCodeTemplate } from "../components/CodeSection.tsx";
import { useDataSources } from "../hooks/useDataSources.ts";
import { useApiFunctions } from "../hooks/useFunctions.ts";
import { useResolvers, useSaveResolver } from "../hooks/useResolvers.ts";
import { apiCrumbs } from "../routes.ts";

const KIND_ITEMS = [
  { value: RESOLVER_KINDS.unit, label: "Unit", description: "One data source." },
  { value: RESOLVER_KINDS.pipeline, label: "Pipeline", description: "Functions run in order." },
];
const RUNTIME_ITEMS = Object.values(RUNTIMES).map((value) => ({
  value,
  label: RUNTIME_LABELS[value],
}));
const MOVE = { up: "up", down: "down" } as const;
const CODE_NAMES = { code: "code", request: "request", response: "response" } as const;

interface EditorProps {
  apiId: string;
  typeName: string;
  fieldName: string;
  resolver?: Resolver;
  dataSources: DataSource[];
  functions: FunctionConfiguration[];
}

function ResolverEditor({
  apiId,
  typeName,
  fieldName,
  resolver,
  dataSources,
  functions,
}: EditorProps) {
  const follow = useFollow();
  const navigate = useNavigate();
  const save = useSaveResolver(apiId);
  const backHref = appsyncRoutes.api(apiId, API_TABS.schema);
  const firstDataSource = dataSources[0];
  const initial: ResolverForm = resolver
    ? formOfResolver(resolver)
    : {
        kind: RESOLVER_KINDS.unit,
        dataSourceName: firstDataSource?.name ?? "",
        functionIds: [""],
        runtime: RUNTIMES.js,
        code: "",
        request: "",
        response: "",
        ...templateFor(firstDataSource?.type ?? DATA_SOURCE_TYPES.none, RUNTIMES.js),
      };
  const form = useZodForm(resolverSchema, initial);
  const [kind, runtime, dataSourceName] = useWatch({
    control: form.control,
    name: ["kind", "runtime", "dataSourceName"],
  });
  const dataSourceType = dataSources.find((dataSource) => dataSource.name === dataSourceName)?.type;
  const template =
    kind === RESOLVER_KINDS.pipeline
      ? PIPELINE_TEMPLATE[runtime]
      : templateFor(dataSourceType ?? DATA_SOURCE_TYPES.none, runtime);

  useCodeTemplate(
    template,
    () => form.getValues(),
    (name, value) => form.setValue(name, value),
  );

  const label = `${typeName}.${fieldName}`;
  const submit = form.handleSubmit((values) =>
    save.mutate(
      { typeName, fieldName, exists: Boolean(resolver), form: values },
      notifyOutcome({
        success: `Saved resolver ${label}`,
        errorHeader: "Couldn't save resolver",
        then: () => navigate(backHref, skipLeaveGuard),
      }),
    ),
  );
  const submitOnce = useSubmitOnce(submit);
  // Code chưa lưu: rời trang (Cancel, breadcrumb, đóng tab) thì hỏi lại; lưu xong đi thẳng
  const leaveBlocker = useLeaveGuard(form.formState.isDirty);
  const functionOptions = functions.flatMap(({ functionId, name }) =>
    functionId ? [{ value: functionId, label: name ?? functionId }] : [],
  );

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
      <Form header={<Header variant='h1'>Resolver {label}</Header>} actions={actions}>
        <SpaceBetween size='l'>
          <Container header={<Header variant='h2'>Configuration</Header>}>
            <SpaceBetween size='l'>
              {!resolver && (
                <FormTiles
                  control={form.control}
                  name='kind'
                  label='Resolver type'
                  items={KIND_ITEMS}
                />
              )}
              <FormRadioGroup
                control={form.control}
                name='runtime'
                label='Runtime'
                items={RUNTIME_ITEMS}
              />
              {kind === RESOLVER_KINDS.unit ? (
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
              ) : (
                <Controller
                  control={form.control}
                  name='functionIds'
                  render={({ field, fieldState }) => (
                    <FormField
                      label='Functions'
                      description='They run in this order.'
                      errorText={fieldState.error?.message}
                    >
                      <AttributeEditor
                        items={field.value}
                        addButtonText='Add function'
                        empty='No functions.'
                        onAddButtonClick={() => field.onChange([...field.value, ""])}
                        // Thứ tự dòng = thứ tự chạy: thêm Move up / down cạnh Remove
                        customRowActions={({ item, itemIndex, ref }) => (
                          <ButtonDropdown
                            ref={ref}
                            // Nút mũi tên cần tên cho trình đọc màn hình
                            ariaLabel={`More actions for function ${functionOptions.find((option) => option.value === item)?.label ?? itemIndex + 1}`}
                            items={[
                              { id: MOVE.up, text: "Move up", disabled: itemIndex === 0 },
                              {
                                id: MOVE.down,
                                text: "Move down",
                                disabled: itemIndex === field.value.length - 1,
                              },
                            ]}
                            mainAction={{
                              text: "Remove",
                              onClick: () =>
                                field.onChange(
                                  field.value.filter((_, index) => index !== itemIndex),
                                ),
                            }}
                            onItemClick={({ detail }) =>
                              field.onChange(
                                moveAt(field.value, itemIndex, detail.id === MOVE.up ? -1 : 1),
                              )
                            }
                          />
                        )}
                        definition={[
                          {
                            label: "Function",
                            control: (functionId, index) => (
                              <Select
                                selectedOption={
                                  functionOptions.find((option) => option.value === functionId) ??
                                  null
                                }
                                options={functionOptions}
                                placeholder='Choose a function'
                                onChange={({ detail }) =>
                                  field.onChange(
                                    field.value.map((value, at) =>
                                      at === index ? (detail.selectedOption.value ?? "") : value,
                                    ),
                                  )
                                }
                              />
                            ),
                          },
                        ]}
                      />
                    </FormField>
                  )}
                />
              )}
            </SpaceBetween>
          </Container>
          <CodeSection control={form.control} runtime={runtime} names={CODE_NAMES} />
        </SpaceBetween>
      </Form>
      <LeaveModal blocker={leaveBlocker}>
        Your resolver changes aren&apos;t saved and will be lost.
      </LeaveModal>
    </form>
  );
}

// Resolver lấy từ ListResolvers của type, không GetResolver: field chưa có resolver thì 404 (spec 7 #17)
export function ResolverPage() {
  const { apiId = "", typeName = "", fieldName = "" } = useParams();
  const resolvers = useResolvers(apiId, [typeName]);
  const dataSources = useDataSources(apiId);
  const functions = useApiFunctions(apiId);

  useBreadcrumbs([
    ...apiCrumbs(apiId),
    { text: `${typeName}.${fieldName}`, href: appsyncRoutes.resolver(apiId, typeName, fieldName) },
  ]);

  // Ba truy vấn: lấy cái đang tải / lỗi đầu tiên để hiện trạng thái trang (API không có → not found)
  const pending =
    [resolvers, dataSources, functions].find((query) => query.isLoading || query.isError) ??
    resolvers;
  const state = pageState(pending, {
    ready: Boolean(resolvers.data && dataSources.data && functions.data),
    title: `API ${apiId} not found`,
    backHref: appsyncRoutes.apis,
    backText: "View APIs",
  });
  if (state || !resolvers.data || !dataSources.data || !functions.data) return state;

  return (
    <ResolverEditor
      apiId={apiId}
      typeName={typeName}
      fieldName={fieldName}
      resolver={resolvers.data.find((resolver) => resolver.fieldName === fieldName)}
      dataSources={dataSources.data}
      functions={functions.data}
    />
  );
}
