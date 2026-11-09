import { useState } from "react";
import { Controller, useFieldArray } from "react-hook-form";
import AttributeEditor from "@cloudscape-design/components/attribute-editor";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import KeyValuePairs, {
  type KeyValuePairsProps,
} from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import type { FunctionConfiguration } from "@aws-sdk/client-lambda";
import { FormInput, FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { EmptyState } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { formatBytes } from "@shared/format.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  DESCRIPTION_MAX_LENGTH,
  ENVIRONMENT_MAX_BYTES,
  MEGABYTE_UNIT,
  MEMORY_LIMITS_MB,
  RUNTIME_OPTIONS,
  TIMEOUT_LIMITS_SECONDS,
} from "../constants.ts";
import { useUpdateConfiguration } from "../hooks/useFunctions.ts";
import { environmentSchema, generalConfigurationSchema } from "../schemas.ts";

const GENERAL_COLUMNS = 4;
const BYTES_PER_MEGABYTE = 1024 * 1024;
const EMPTY_VARIABLE = { key: "", value: "" };
const LIST_SEPARATOR = ", ";

interface Variable {
  key: string;
  value: string;
}

const VARIABLE_COLUMNS: TableProps.ColumnDefinition<Variable>[] = [
  { id: "key", header: "Key", isRowHeader: true, cell: (variable) => variable.key },
  { id: "value", header: "Value", cell: (variable) => variable.value },
];

const variablesOf = (configuration: FunctionConfiguration): Variable[] =>
  Object.entries(configuration.Environment?.Variables ?? {}).map(([key, value]) => ({
    key,
    value,
  }));

interface ModalProps {
  configuration: FunctionConfiguration;
  onDismiss: () => void;
}

// Chỉ mount khi mở
function GeneralConfigurationModal({ configuration, onDismiss }: ModalProps) {
  const name = configuration.FunctionName ?? "";
  const update = useUpdateConfiguration(name);
  const form = useZodForm(generalConfigurationSchema, {
    description: configuration.Description ?? "",
    memory: String(configuration.MemorySize ?? MEMORY_LIMITS_MB.default),
    timeout: String(configuration.Timeout ?? TIMEOUT_LIMITS_SECONDS.default),
    runtime: configuration.Runtime ?? "",
    handler: configuration.Handler ?? "",
  });
  // Function deploy bằng tool khác có thể dùng runtime ngoài danh sách: vẫn giữ được runtime đó
  const currentRuntime = configuration.Runtime;
  const runtimeOptions =
    currentRuntime && !RUNTIME_OPTIONS.some((option) => option.value === currentRuntime)
      ? [{ value: currentRuntime, label: currentRuntime }, ...RUNTIME_OPTIONS]
      : RUNTIME_OPTIONS;

  const submit = form.handleSubmit((values) =>
    update.mutate(
      {
        Description: values.description,
        MemorySize: values.memory,
        Timeout: values.timeout,
        Runtime: values.runtime as FunctionConfiguration["Runtime"],
        Handler: values.handler,
      },
      notifyOutcome({
        success: `Updated configuration of ${name}`,
        errorHeader: "Couldn't update the configuration",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Edit general configuration'
      actionText='Save'
      loading={update.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput
        control={form.control}
        name='description'
        label='Description'
        description='Optional.'
        constraintText={`Up to ${DESCRIPTION_MAX_LENGTH} characters.`}
      />
      <ColumnLayout columns={2}>
        <FormInput
          control={form.control}
          name='memory'
          label='Memory (MB)'
          constraintText={`${MEMORY_LIMITS_MB.min}–${MEMORY_LIMITS_MB.max} MB.`}
        />
        <FormInput
          control={form.control}
          name='timeout'
          label='Timeout (seconds)'
          constraintText={`${TIMEOUT_LIMITS_SECONDS.min}–${TIMEOUT_LIMITS_SECONDS.max} seconds.`}
        />
      </ColumnLayout>
      <FormSelect control={form.control} name='runtime' label='Runtime' options={runtimeOptions} />
      <FormInput
        control={form.control}
        name='handler'
        label='Handler'
        description='file.function, e.g. index.handler'
      />
    </FormModal>
  );
}

// Lambda API ghi đè cả danh sách biến môi trường, nên luôn gửi đủ
function EnvironmentModal({ configuration, onDismiss }: ModalProps) {
  const name = configuration.FunctionName ?? "";
  const update = useUpdateConfiguration(name);
  const form = useZodForm(environmentSchema, { entries: variablesOf(configuration) });
  const entries = useFieldArray({ control: form.control, name: "entries" });
  const listError =
    form.formState.errors.entries?.root?.message ?? form.formState.errors.entries?.message;

  const submit = form.handleSubmit(({ entries: values }) =>
    update.mutate(
      {
        Environment: {
          Variables: Object.fromEntries(values.map((entry) => [entry.key, entry.value])),
        },
      },
      notifyOutcome({
        success: `Updated environment variables of ${name}`,
        errorHeader: "Couldn't update environment variables",
        then: onDismiss,
      }),
    ),
  );

  const entryInput = (part: "key" | "value") => (_entry: unknown, index: number) => (
    <Controller
      control={form.control}
      name={`entries.${index}.${part}`}
      render={({ field }) => (
        <Input value={field.value} onChange={({ detail }) => field.onChange(detail.value)} />
      )}
    />
  );

  const definition = [
    {
      label: "Key",
      control: entryInput("key"),
      errorText: (_entry: unknown, index: number) =>
        form.formState.errors.entries?.[index]?.key?.message,
    },
    { label: "Value", control: entryInput("value") },
  ];

  return (
    <FormModal
      size='large'
      header='Edit environment variables'
      actionText='Save'
      loading={update.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormField
        errorText={listError}
        constraintText={`Up to ${formatBytes(ENVIRONMENT_MAX_BYTES)} in total. Keys reserved by Lambda, like AWS_REGION, aren't allowed.`}
      >
        <AttributeEditor
          items={entries.fields}
          definition={definition}
          addButtonText='Add environment variable'
          removeButtonText='Remove'
          empty='No environment variables.'
          onAddButtonClick={() => entries.append(EMPTY_VARIABLE)}
          onRemoveButtonClick={({ detail }) => entries.remove(detail.itemIndex)}
        />
      </FormField>
    </FormModal>
  );
}

const MODALS = { general: "general", environment: "environment" } as const;
type ModalId = (typeof MODALS)[keyof typeof MODALS];

export function ConfigurationTab({ configuration }: { configuration: FunctionConfiguration }) {
  const [openModal, setOpenModal] = useState<ModalId | null>(null);
  const closeModal = () => setOpenModal(null);
  const variables = variablesOf(configuration);
  const ephemeralStorage = configuration.EphemeralStorage?.Size;

  // Ephemeral storage, Role, Architecture chỉ để xem
  const generalItems: KeyValuePairsProps.Item[] = [
    { label: "Description", value: configuration.Description || NOT_AVAILABLE },
    { label: "Memory", value: `${configuration.MemorySize} ${MEGABYTE_UNIT}` },
    { label: "Timeout", value: `${configuration.Timeout} sec` },
    { label: "Runtime", value: configuration.Runtime },
    { label: "Handler", value: configuration.Handler },
    {
      label: "Ephemeral storage",
      value: ephemeralStorage ? formatBytes(ephemeralStorage * BYTES_PER_MEGABYTE) : NOT_AVAILABLE,
    },
    { label: "Role", value: configuration.Role },
    {
      label: "Architecture",
      value: configuration.Architectures?.join(LIST_SEPARATOR) || NOT_AVAILABLE,
    },
  ];

  const generalHeader = (
    <Header
      variant='h2'
      actions={<Button onClick={() => setOpenModal(MODALS.general)}>Edit</Button>}
    >
      General configuration
    </Header>
  );

  const environmentHeader = (
    <Header
      counter={`(${variables.length})`}
      actions={<Button onClick={() => setOpenModal(MODALS.environment)}>Edit</Button>}
    >
      Environment variables
    </Header>
  );

  return (
    <SpaceBetween size='l'>
      <Container header={generalHeader}>
        <KeyValuePairs columns={GENERAL_COLUMNS} items={generalItems} />
      </Container>
      <Table
        variant='container'
        items={variables}
        trackBy='key'
        columnDefinitions={VARIABLE_COLUMNS}
        wrapLines
        empty={<EmptyState title='No environment variables' />}
        header={environmentHeader}
      />
      {openModal === MODALS.general && (
        <GeneralConfigurationModal configuration={configuration} onDismiss={closeModal} />
      )}
      {openModal === MODALS.environment && (
        <EnvironmentModal configuration={configuration} onDismiss={closeModal} />
      )}
    </SpaceBetween>
  );
}
