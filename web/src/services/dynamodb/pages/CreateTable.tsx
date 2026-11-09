import { useFieldArray } from "react-hook-form";
import { useNavigate } from "react-router";
import AttributeEditor from "@cloudscape-design/components/attribute-editor";
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
import { KeyFields } from "../components/KeyFields.tsx";
import { TABLE_NAME_LENGTH } from "../constants.ts";
import { useCreateTable, type IndexKeys, type KeyAttribute } from "../hooks/useTables.ts";
import { dynamodbBaseCrumbs, dynamodbRoutes } from "../routes.ts";
import { createTableSchema, type CreateTableForm } from "../schemas.ts";

const NAME_CONSTRAINT = `${TABLE_NAME_LENGTH.min}–${TABLE_NAME_LENGTH.max} characters: letters, numbers, underscores, hyphens and dots.`;
const EMPTY_KEY = { name: "", type: "S" as const };
const EMPTY_INDEX = { name: "", partitionKey: EMPTY_KEY, sortKey: EMPTY_KEY };

const INITIAL_VALUES: CreateTableForm = {
  name: "",
  partitionKey: EMPTY_KEY,
  sortKey: EMPTY_KEY,
  indexes: [],
};

// Sort key để trống tên thì bỏ qua
const toIndexKeys = (partitionKey: KeyAttribute, sortKey: KeyAttribute): IndexKeys => ({
  partitionKey,
  sortKey: sortKey.name ? sortKey : undefined,
});

export function CreateTable() {
  useBreadcrumbs([
    ...dynamodbBaseCrumbs,
    { text: "Create table", href: dynamodbRoutes.createTable },
  ]);
  const follow = useFollow();
  const navigate = useNavigate();
  const createTable = useCreateTable();
  const form = useZodForm(createTableSchema, INITIAL_VALUES);
  const indexes = useFieldArray({ control: form.control, name: "indexes" });
  const indexErrors = form.formState.errors.indexes;

  const submit = form.handleSubmit((values) =>
    createTable.mutate(
      {
        name: values.name,
        keys: toIndexKeys(values.partitionKey, values.sortKey),
        indexes: values.indexes.map((index) => ({
          name: index.name,
          keys: toIndexKeys(index.partitionKey, index.sortKey),
        })),
      },
      notifyOutcome({
        success: `Created table ${values.name}`,
        errorHeader: `Couldn't create ${values.name}`,
        then: () => navigate(dynamodbRoutes.table(values.name)),
      }),
    ),
  );

  const actions = (
    <SpaceBetween direction='horizontal' size='xs'>
      <Button variant='link' href={dynamodbRoutes.tables} onFollow={follow}>
        Cancel
      </Button>
      <Button variant='primary' formAction='submit' loading={createTable.isPending}>
        Create table
      </Button>
    </SpaceBetween>
  );

  const tableDetails = (
    <Container
      header={
        <Header
          variant='h2'
          description='On-demand capacity. Turn on TTL and streams later in Settings.'
        >
          Table details
        </Header>
      }
    >
      <SpaceBetween size='l'>
        <FormInput
          control={form.control}
          name='name'
          label='Table name'
          constraintText={NAME_CONSTRAINT}
          placeholder='orders'
          autoFocus
        />
        <KeyFields
          control={form.control}
          path='partitionKey'
          label='Partition key'
          placeholder='pk'
        />
        <KeyFields
          control={form.control}
          path='sortKey'
          label='Sort key'
          description='Optional. Leave the name empty for a table with a partition key only.'
          placeholder='sk'
        />
      </SpaceBetween>
    </Container>
  );

  const indexDefinition = [
    {
      label: "Index name",
      control: (_index: unknown, position: number) => (
        <FormInput
          control={form.control}
          name={`indexes.${position}.name`}
          placeholder='status-index'
        />
      ),
    },
    {
      label: "Partition key",
      control: (_index: unknown, position: number) => (
        <KeyFields
          control={form.control}
          path={`indexes.${position}.partitionKey`}
          placeholder='status'
        />
      ),
    },
    {
      label: "Sort key (optional)",
      control: (_index: unknown, position: number) => (
        <KeyFields control={form.control} path={`indexes.${position}.sortKey`} />
      ),
    },
  ];

  const globalIndexes = (
    <Container
      header={
        <Header
          variant='h2'
          counter={`(${indexes.fields.length})`}
          description='Optional. Query items by other attributes. Every attribute is copied to the index.'
        >
          Global secondary indexes
        </Header>
      }
    >
      <AttributeEditor
        items={indexes.fields}
        definition={indexDefinition}
        addButtonText='Add index'
        removeButtonText='Remove'
        empty='No indexes.'
        additionalInfo={indexErrors?.root?.message}
        onAddButtonClick={() => indexes.append(EMPTY_INDEX)}
        onRemoveButtonClick={({ detail }) => indexes.remove(detail.itemIndex)}
      />
    </Container>
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Form header={<Header variant='h1'>Create table</Header>} actions={actions}>
        <SpaceBetween size='l'>
          {tableDetails}
          {globalIndexes}
        </SpaceBetween>
      </Form>
    </form>
  );
}
