import { useWatch } from "react-hook-form";
import type { DataSource } from "@aws-sdk/client-appsync";
import Box from "@cloudscape-design/components/box";
import FormField from "@cloudscape-design/components/form-field";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormInput, FormSelect, FormTiles } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useTables } from "../../dynamodb/hooks/useTables.ts";
import { dynamodbRoutes } from "@localconsole/core/dynamodb";
import { useFunctions } from "../../lambda/hooks/useFunctions.ts";
import {
  DATA_SOURCE_LABELS,
  DATA_SOURCE_TYPES,
  LAMBDA_INVOKE_NOTE,
  isDataSourceKind,
  type DataSourceKind,
  dataSourceSchema,
  type DataSourceForm,
} from "@localconsole/core/appsync";
import { useSaveDataSource } from "../hooks/useDataSources.ts";

const TYPE_DESCRIPTIONS: Record<DataSourceKind, string> = {
  NONE: "Return data from the resolver code itself.",
  AMAZON_DYNAMODB: "Read and write a table.",
  AWS_LAMBDA: "Call a function.",
};
const TYPE_ITEMS = Object.values(DATA_SOURCE_TYPES).map((value) => ({
  value,
  label: DATA_SOURCE_LABELS[value],
  description: TYPE_DESCRIPTIONS[value],
}));

function initialValues(dataSource?: DataSource): DataSourceForm {
  return {
    name: dataSource?.name ?? "",
    type: isDataSourceKind(dataSource?.type) ? dataSource.type : DATA_SOURCE_TYPES.dynamodb,
    tableName: dataSource?.dynamodbConfig?.tableName ?? "",
    functionArn: dataSource?.lambdaConfig?.lambdaFunctionArn ?? "",
    description: dataSource?.description ?? "",
  };
}

interface Props {
  apiId: string;
  existingNames: readonly string[];
  dataSource?: DataSource; // có = sửa
  onDismiss: () => void;
}

// Chỉ mount khi mở. Sửa: tên và loại chỉ hiện
export function DataSourceModal({ apiId, existingNames, dataSource, onDismiss }: Props) {
  const follow = useFollow();
  const save = useSaveDataSource(apiId);
  const tables = useTables();
  const functions = useFunctions();
  const editing = Boolean(dataSource);
  const others = existingNames.filter((name) => name !== dataSource?.name);
  const form = useZodForm(dataSourceSchema(others), initialValues(dataSource));
  const type = useWatch({ control: form.control, name: "type" });

  const submit = form.handleSubmit((values) =>
    save.mutate(
      { ...values, editing },
      notifyOutcome({
        success: `Saved data source ${values.name}`,
        errorHeader: "Couldn't save data source",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header={editing ? `Edit data source ${dataSource?.name}` : "Create data source"}
      actionText={editing ? "Save" : "Create data source"}
      loading={save.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <SpaceBetween size='m'>
        {editing ? (
          <FormField label='Name'>
            <Box>{dataSource?.name}</Box>
          </FormField>
        ) : (
          <FormInput
            control={form.control}
            name='name'
            label='Name'
            placeholder='todos_table'
            autoFocus
          />
        )}
        {editing ? (
          <FormField label='Type'>
            <Box>{DATA_SOURCE_LABELS[type]}</Box>
          </FormField>
        ) : (
          <FormTiles control={form.control} name='type' label='Type' items={TYPE_ITEMS} />
        )}
        {type === DATA_SOURCE_TYPES.dynamodb && (
          <FormSelect
            control={form.control}
            name='tableName'
            label='Table'
            placeholder='Choose a table'
            options={(tables.data ?? []).flatMap(({ TableName }) =>
              TableName ? [{ value: TableName, label: TableName }] : [],
            )}
            description={
              tables.data?.length === 0 && (
                <>
                  No tables yet.{" "}
                  <Link href={dynamodbRoutes.createTable} onFollow={follow}>
                    Create table
                  </Link>
                </>
              )
            }
          />
        )}
        {type === DATA_SOURCE_TYPES.lambda && (
          <FormSelect
            control={form.control}
            name='functionArn'
            label='Function'
            placeholder='Choose a function'
            description={LAMBDA_INVOKE_NOTE}
            options={(functions.data ?? []).flatMap(({ FunctionArn, FunctionName }) =>
              FunctionArn ? [{ value: FunctionArn, label: FunctionName ?? FunctionArn }] : [],
            )}
          />
        )}
        <FormInput control={form.control} name='description' label='Description - optional' />
      </SpaceBetween>
    </FormModal>
  );
}
