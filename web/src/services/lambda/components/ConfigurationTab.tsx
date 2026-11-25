import { useState } from "react";
import { Controller } from "react-hook-form";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs, {
  type KeyValuePairsProps,
} from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import type { FunctionConfiguration } from "@aws-sdk/client-lambda";
import { FormInput, FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { KeyValueEditor, type KeyValue } from "@shared/components/KeyValueEditor.tsx";
import { EmptyState } from "@shared/components/TableStates.tsx";
import { ConnectCard } from "@shared/components/CodeSamples.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { formatBytes } from "@shared/format.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  LAMBDA_KEY_SERVICE,
  DESCRIPTION_MAX_LENGTH,
  ENVIRONMENT_MAX_BYTES,
  MEGABYTE_UNIT,
  MEMORY_LIMITS_MB,
  RUNTIME_OPTIONS,
  TIMEOUT_LIMITS_SECONDS,
} from "../constants.ts";
import { useUpdateConfiguration } from "../hooks/useFunctions.ts";
import { FormKeySelect } from "../../kms/components/KeySelect.tsx";
import { KeyLink } from "../../kms/components/KeyLink.tsx";
import { defaultKeyLabel } from "../../kms/keys.ts";
import { functionSample } from "../codeSamples.ts";
import { AsyncInvocationBlock } from "./AsyncInvocationBlock.tsx";
import { environmentSchema, generalConfigurationSchema } from "../schemas.ts";

const GENERAL_COLUMNS = 4;
const BYTES_PER_MEGABYTE = 1024 * 1024;
const LIST_SEPARATOR = ", ";

const VARIABLE_COLUMNS: TableProps.ColumnDefinition<KeyValue>[] = [
  { id: "key", header: "Key", isRowHeader: true, cell: (variable) => variable.key },
  { id: "value", header: "Value", cell: (variable) => variable.value },
];

const variablesOf = (configuration: FunctionConfiguration): KeyValue[] =>
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
  const form = useZodForm(environmentSchema, {
    entries: variablesOf(configuration),
    kmsKeyArn: configuration.KMSKeyArn ?? "",
  });
  const listError =
    form.formState.errors.entries?.root?.message ?? form.formState.errors.entries?.message;

  const submit = form.handleSubmit(({ entries: values, kmsKeyArn }) =>
    update.mutate(
      {
        Environment: {
          Variables: Object.fromEntries(values.map((entry) => [entry.key, entry.value])),
        },
        // Chỉ gửi khi đổi key; chuỗi rỗng = gỡ key, về key mặc định aws/lambda (Floci nhận, IT kms)
        ...(kmsKeyArn === (configuration.KMSKeyArn ?? "") ? {} : { KMSKeyArn: kmsKeyArn }),
      },
      notifyOutcome({
        success: `Updated environment variables of ${name}`,
        errorHeader: "Couldn't update environment variables",
        then: onDismiss,
      }),
    ),
  );

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
        <Controller
          control={form.control}
          name='entries'
          render={({ field, formState }) => (
            <KeyValueEditor
              items={field.value}
              onChange={field.onChange}
              keyError={(index) => formState.errors.entries?.[index]?.key?.message}
              itemLabel='environment variable'
            />
          )}
        />
      </FormField>
      <FormKeySelect
        control={form.control}
        name='kmsKeyArn'
        label='Encryption key'
        defaultLabel={defaultKeyLabel(LAMBDA_KEY_SERVICE)}
      />
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
    {
      label: "Environment encryption",
      value: configuration.KMSKeyArn ? (
        <KeyLink value={configuration.KMSKeyArn} />
      ) : (
        defaultKeyLabel(LAMBDA_KEY_SERVICE)
      ),
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
      {configuration.FunctionName && (
        <ConnectCard sample={functionSample(configuration.FunctionName)} />
      )}
      <Table
        variant='container'
        items={variables}
        trackBy='key'
        columnDefinitions={VARIABLE_COLUMNS}
        wrapLines
        empty={<EmptyState title='No environment variables' />}
        header={environmentHeader}
      />
      {configuration.FunctionName && <AsyncInvocationBlock name={configuration.FunctionName} />}
      {openModal === MODALS.general && (
        <GeneralConfigurationModal configuration={configuration} onDismiss={closeModal} />
      )}
      {openModal === MODALS.environment && (
        <EnvironmentModal configuration={configuration} onDismiss={closeModal} />
      )}
    </SpaceBetween>
  );
}
