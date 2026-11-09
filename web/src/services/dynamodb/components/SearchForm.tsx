import { Controller, useFieldArray, useWatch } from "react-hook-form";
import AttributeEditor from "@cloudscape-design/components/attribute-editor";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import SegmentedControl from "@cloudscape-design/components/segmented-control";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Toggle from "@cloudscape-design/components/toggle";
import type { TableDescription } from "@aws-sdk/client-dynamodb";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  FILTER_OPERATORS,
  FILTER_VALUE_TYPES,
  SEARCH_MODES,
  SORT_KEY_OPERATORS,
  VALUELESS_FILTER_OPERATORS,
  type FilterOperator,
} from "../constants.ts";
import type { ItemSearch } from "../expressions.ts";
import { keySchemaOf } from "../hooks/useTables.ts";
import { itemSearchSchema, type ItemSearchForm } from "../schemas.ts";
import { KeyLabel } from "./KeyLabel.tsx";

const MODE_OPTIONS = [
  { id: SEARCH_MODES.scan, text: "Scan" },
  { id: SEARCH_MODES.query, text: "Query" },
];
const optionsOf = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));
const SORT_KEY_OPERATOR_OPTIONS = optionsOf(SORT_KEY_OPERATORS);
const FILTER_OPERATOR_OPTIONS = optionsOf(FILTER_OPERATORS);
const FILTER_TYPE_OPTIONS = optionsOf(FILTER_VALUE_TYPES);
const TABLE_TARGET = ""; // giá trị "Table or index" khi chọn chính bảng

export const EMPTY_SEARCH: ItemSearchForm = {
  mode: SEARCH_MODES.scan,
  indexName: TABLE_TARGET,
  partitionKeyValue: "",
  sortKey: { operator: "=", value: "", secondValue: "" },
  filters: [],
  descending: false,
};
const EMPTY_FILTER = {
  attribute: "",
  operator: "=" as const,
  type: "S" as const,
  value: "",
  secondValue: "",
};

// Hàng sort key và hàng filter: các ô nằm ngang, tự xuống dòng khi khung hẹp
const FIELD_GAP_PX = 8;
const inlineRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: FIELD_GAP_PX,
  alignItems: "flex-start",
} as const;
// Hàng cuối: công tắc sắp xếp bên trái, Reset/Run bên phải
const footerRowStyle = {
  ...inlineRowStyle,
  justifyContent: "space-between",
  alignItems: "center",
} as const;
const OPERATOR_WIDTH_PX = 150;
const VALUE_MIN_WIDTH_PX = 160;
const operatorStyle = { width: OPERATOR_WIDTH_PX } as const;
const valueStyle = { flex: 1, minWidth: VALUE_MIN_WIDTH_PX } as const;

export const toItemSearch = (form: ItemSearchForm): ItemSearch => ({
  ...form,
  indexName: form.indexName || undefined,
});

interface Props {
  table: TableDescription;
  initial: ItemSearchForm;
  running: boolean;
  onRun: (form: ItemSearchForm) => void;
  onReset: () => void;
}

// Chỉ mount khi mở; giá trị ban đầu là điều kiện đang chạy
export function SearchForm({ table, initial, running, onRun, onReset }: Props) {
  const keysFor = (indexName: string) => keySchemaOf(table, indexName || undefined);
  const form = useZodForm(itemSearchSchema(keysFor), initial);
  const filters = useFieldArray({ control: form.control, name: "filters" });
  const [mode, indexName, sortOperator] = useWatch({
    control: form.control,
    name: ["mode", "indexName", "sortKey.operator"],
  });
  const watchedFilters = useWatch({ control: form.control, name: "filters" });
  const keys = keysFor(indexName);
  const isQuery = mode === SEARCH_MODES.query;
  const errors = form.formState.errors;

  const targetOptions = [
    { value: TABLE_TARGET, label: `${table.TableName} (table)` },
    ...(table.GlobalSecondaryIndexes ?? []).map((index) => ({
      value: index.IndexName!,
      label: `${index.IndexName} (GSI)`,
    })),
    ...(table.LocalSecondaryIndexes ?? []).map((index) => ({
      value: index.IndexName!,
      label: `${index.IndexName} (LSI)`,
    })),
  ];

  // Đổi bảng/index thì key khác: xóa giá trị key cũ
  const chooseTarget = (value: string) => {
    form.setValue("indexName", value);
    form.setValue("partitionKeyValue", "");
    form.setValue("sortKey", EMPTY_SEARCH.sortKey);
  };

  const submit = form.handleSubmit(onRun);
  const reset = () => {
    form.reset(EMPTY_SEARCH);
    onReset();
  };

  const modeAndTarget = (
    <div style={inlineRowStyle}>
      <FormField label='Operation'>
        <Controller
          control={form.control}
          name='mode'
          render={({ field }) => (
            <SegmentedControl
              options={MODE_OPTIONS}
              selectedId={field.value}
              onChange={({ detail }) => field.onChange(detail.selectedId)}
            />
          )}
        />
      </FormField>
      <div style={valueStyle}>
        <FormField label='Table or index' stretch>
          <Select
            options={targetOptions}
            selectedOption={targetOptions.find((option) => option.value === indexName) ?? null}
            onChange={({ detail }) => chooseTarget(detail.selectedOption.value ?? TABLE_TARGET)}
          />
        </FormField>
      </div>
    </div>
  );

  const partitionKeyField = (
    <FormField
      label={<KeyLabel attribute={keys.partitionKey} />}
      errorText={errors.partitionKeyValue?.message}
    >
      <Controller
        control={form.control}
        name='partitionKeyValue'
        render={({ field }) => (
          <Input
            value={field.value}
            ariaLabel={`${keys.partitionKey.name} value`}
            placeholder='Enter partition key value'
            onChange={({ detail }) => field.onChange(detail.value)}
          />
        )}
      />
    </FormField>
  );

  const sortKeyField = keys.sortKey && (
    <FormField
      label={<KeyLabel attribute={keys.sortKey} />}
      description='Optional.'
      errorText={
        errors.sortKey?.operator?.message ??
        errors.sortKey?.value?.message ??
        errors.sortKey?.secondValue?.message
      }
      stretch
    >
      <div style={inlineRowStyle}>
        <div style={operatorStyle}>
          <Controller
            control={form.control}
            name='sortKey.operator'
            render={({ field }) => (
              <Select
                ariaLabel='Sort key condition'
                options={SORT_KEY_OPERATOR_OPTIONS}
                selectedOption={
                  SORT_KEY_OPERATOR_OPTIONS.find((option) => option.value === field.value) ?? null
                }
                onChange={({ detail }) => field.onChange(detail.selectedOption.value)}
              />
            )}
          />
        </div>
        <div style={valueStyle}>
          <Controller
            control={form.control}
            name='sortKey.value'
            render={({ field }) => (
              <Input
                value={field.value}
                ariaLabel={`${keys.sortKey!.name} value`}
                onChange={({ detail }) => field.onChange(detail.value)}
              />
            )}
          />
        </div>
        {sortOperator === "between" && (
          <div style={valueStyle}>
            <Controller
              control={form.control}
              name='sortKey.secondValue'
              render={({ field }) => (
                <Input
                  value={field.value}
                  ariaLabel={`${keys.sortKey!.name} end value`}
                  placeholder='and'
                  onChange={({ detail }) => field.onChange(detail.value)}
                />
              )}
            />
          </div>
        )}
      </div>
    </FormField>
  );

  const filterControl =
    (part: "attribute" | "value" | "secondValue", placeholder?: string) =>
    (_filter: unknown, index: number) => (
      <Controller
        control={form.control}
        name={`filters.${index}.${part}`}
        render={({ field, fieldState }) => (
          <Input
            value={field.value}
            placeholder={placeholder}
            invalid={Boolean(fieldState.error)}
            onChange={({ detail }) => field.onChange(detail.value)}
          />
        )}
      />
    );

  const filterSelect =
    (part: "operator" | "type", options: typeof FILTER_TYPE_OPTIONS) =>
    (_filter: unknown, index: number) => (
      <Controller
        control={form.control}
        name={`filters.${index}.${part}`}
        render={({ field }) => (
          <Select
            options={options}
            selectedOption={options.find((option) => option.value === field.value) ?? null}
            onChange={({ detail }) => field.onChange(detail.selectedOption.value)}
          />
        )}
      />
    );

  const filterErrors = errors.filters;
  // Theo dõi filter để ô giá trị đổi ngay khi đổi phép so sánh
  const filterOperatorAt = (index: number): FilterOperator | undefined =>
    watchedFilters[index]?.operator;
  const filterDefinition = [
    {
      label: "Attribute",
      control: filterControl("attribute", "status"),
      errorText: (_filter: unknown, index: number) => filterErrors?.[index]?.attribute?.message,
    },
    { label: "Condition", control: filterSelect("operator", FILTER_OPERATOR_OPTIONS) },
    { label: "Type", control: filterSelect("type", FILTER_TYPE_OPTIONS) },
    {
      label: "Value",
      control: (filter: unknown, index: number) =>
        VALUELESS_FILTER_OPERATORS.includes(filterOperatorAt(index) ?? "=") ? (
          <Box color='text-status-inactive' padding={{ top: "xxs" }}>
            No value needed
          </Box>
        ) : (
          <SpaceBetween size='xs'>
            {filterControl("value")(filter, index)}
            {filterOperatorAt(index) === "between" &&
              filterControl("secondValue", "and")(filter, index)}
          </SpaceBetween>
        ),
      errorText: (_filter: unknown, index: number) =>
        filterErrors?.[index]?.value?.message ?? filterErrors?.[index]?.secondValue?.message,
    },
  ];

  const filterSection = (
    <ExpandableSection
      headerText={`Filters (${filters.fields.length})`}
      defaultExpanded={filters.fields.length > 0}
    >
      <AttributeEditor
        items={filters.fields}
        definition={filterDefinition}
        addButtonText='Add filter'
        removeButtonText='Remove'
        empty='No filters. Filters apply after items are read, so a page can return fewer items.'
        onAddButtonClick={() => filters.append(EMPTY_FILTER)}
        onRemoveButtonClick={({ detail }) => filters.remove(detail.itemIndex)}
      />
    </ExpandableSection>
  );

  const descendingToggle = isQuery && (
    <Controller
      control={form.control}
      name='descending'
      render={({ field }) => (
        <Toggle checked={field.value} onChange={({ detail }) => field.onChange(detail.checked)}>
          Sort descending
        </Toggle>
      )}
    />
  );

  const actions = (
    <SpaceBetween direction='horizontal' size='xs'>
      <Button onClick={reset}>Reset</Button>
      <Button variant='primary' formAction='submit' loading={running}>
        Run
      </Button>
    </SpaceBetween>
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Container header={<Header variant='h2'>Scan or query items</Header>}>
        <SpaceBetween size='m'>
          {modeAndTarget}
          {isQuery && partitionKeyField}
          {isQuery && sortKeyField}
          {filterSection}
          <div style={footerRowStyle}>
            <div>{descendingToggle}</div>
            {actions}
          </div>
        </SpaceBetween>
      </Container>
    </form>
  );
}
