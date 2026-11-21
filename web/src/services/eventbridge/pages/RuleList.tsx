import { useState } from "react";
import { useSearchParams } from "react-router";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import TextFilter from "@cloudscape-design/components/text-filter";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { Figure, FigureHeader } from "@shared/components/Figure.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { BusSenders } from "../components/BusSenders.tsx";
import { EnabledState } from "../components/EnabledState.tsx";
import { DeleteRulesModal } from "../components/DeleteRulesModal.tsx";
import { DEFAULT_BUS_NAME, RULE_TYPES } from "../constants.ts";
import { useBuses } from "../hooks/useBuses.ts";
import { useRules, useSetRulesEnabled, type RuleRow } from "../hooks/useRules.ts";
import { ruleType } from "../rules.ts";
import { SEARCH_PARAMS, eventbridgeRoutes, rulesCrumbs } from "../routes.ts";

const NAME_FIELD = "name";
const PAGE_SIZE = 50;

export function RuleList() {
  useBreadcrumbs(rulesCrumbs);
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const [searchParams, setSearchParams] = useSearchParams();
  const bus = searchParams.get(SEARCH_PARAMS.bus) ?? DEFAULT_BUS_NAME;
  const buses = useBuses();
  const rules = useRules(bus);
  const setEnabled = useSetRulesEnabled();
  const [deleting, setDeleting] = useState(false);

  // Floci trả danh sách rỗng cho bus không có (AWS báo lỗi), nên tự so với danh sách bus
  const unknownBus = Boolean(buses.data) && !buses.data?.some((item) => item.name === bus);
  const createBus = unknownBus ? undefined : bus;
  const busArn = buses.data?.find((item) => item.name === bus)?.arn ?? "";

  const createButton = (
    <Button variant='primary' href={eventbridgeRoutes.createRule(createBus)} onFollow={follow}>
      Create rule
    </Button>
  );

  const { items, collectionProps, filterProps, paginationProps, filteredItemsCount, actions } =
    useCollection<RuleRow>(rules.data ?? [], {
      filtering: {
        empty: emptyOrError(
          rules,
          unknownBus ? (
            <EmptyState
              title={`Event bus ${bus} not found`}
              description='It may have been deleted, or the name is wrong.'
              action={
                <Button href={eventbridgeRoutes.buses} onFollow={follow}>
                  View event buses
                </Button>
              }
            />
          ) : (
            <EmptyState
              title='No rules'
              description={`The ${bus} bus has no rules.`}
              action={createButton}
            />
          ),
        ),
        noMatch: (
          <EmptyState
            title='No matches'
            action={<Button onClick={() => actions.setFiltering("")}>Clear filter</Button>}
          />
        ),
      },
      sorting: { defaultState: { sortingColumn: { sortingField: NAME_FIELD } } },
      pagination: { pageSize: PAGE_SIZE },
      selection: { trackBy: NAME_FIELD },
    });

  const selected = collectionProps.selectedItems ?? [];

  const changeBus = (name: string) => {
    actions.setSelectedItems([]);
    setSearchParams(name === DEFAULT_BUS_NAME ? {} : { [SEARCH_PARAMS.bus]: name });
  };
  const finishDelete = () => {
    setDeleting(false);
    actions.setSelectedItems([]);
  };
  const setState = (enabled: boolean) =>
    setEnabled.mutate(
      { rules: selected, enabled },
      notifyBulkOutcome({
        success: (result) =>
          `${enabled ? "Enabled" : "Disabled"} ${pluralize(result.count, "rule")}`,
        errorHeader: `Couldn't ${enabled ? "enable" : "disable"}`,
      }),
    );

  const nameLink = (rule: RuleRow) => (
    <Link href={eventbridgeRoutes.rule(rule.bus, rule.name)} onFollow={follow}>
      {rule.name}
    </Link>
  );
  const nameColumn: TableProps.ColumnDefinition<RuleRow> = {
    id: "name",
    header: "Name",
    sortingField: NAME_FIELD,
    isRowHeader: true,
    cell: nameLink,
  };
  const wideColumns: TableProps.ColumnDefinition<RuleRow>[] = [
    nameColumn,
    { id: "type", header: "Type", cell: (rule) => RULE_TYPES[ruleType(rule)] },
    { id: "state", header: "State", cell: (rule) => <EnabledState enabled={rule.enabled} /> },
    {
      id: "targets",
      header: <FigureHeader>Targets</FigureHeader>,
      sortingField: "targets",
      cell: (rule) => <Figure>{rule.targets.toLocaleString()}</Figure>,
    },
  ];
  // Khung hẹp: tầng 1 là tên + state, tầng 2 là type + số target
  const compactColumns: TableProps.ColumnDefinition<RuleRow>[] = [
    {
      ...nameColumn,
      cell: (rule) => (
        <div>
          <SpaceBetween size='xs' direction='horizontal'>
            {nameLink(rule)}
            <EnabledState enabled={rule.enabled} />
          </SpaceBetween>
          <Box variant='small' display='block' color='text-body-secondary'>
            {[RULE_TYPES[ruleType(rule)], pluralize(rule.targets, "target")].join(DETAIL_SEPARATOR)}
          </Box>
        </div>
      ),
    },
  ];

  const barActions: BarAction[] = [
    refreshAction(rules),
    {
      id: "enable",
      text: "Enable",
      disabled: !selected.length,
      loading: setEnabled.isPending,
      onClick: () => setState(true),
    },
    {
      id: "disable",
      text: "Disable",
      disabled: !selected.length,
      loading: setEnabled.isPending,
      onClick: () => setState(false),
    },
    { id: "delete", text: "Delete", disabled: !selected.length, onClick: () => setDeleting(true) },
    {
      id: "create",
      text: "Create rule",
      primary: true,
      href: eventbridgeRoutes.createRule(createBus),
    },
  ];

  const busOptions = (buses.data ?? [{ name: bus }]).map(({ name }) => ({
    value: name,
    label: name,
  }));

  const header = (
    <Header
      variant='awsui-h1-sticky'
      counter={rules.data ? `(${rules.data.length})` : undefined}
      description='Rules match events on a bus and send them to targets.'
      actions={<ActionBar compact={compact} actions={barActions} />}
    >
      Rules
    </Header>
  );

  const filter = (
    <SpaceBetween size='s'>
      <FormField label='Event bus'>
        <Select
          selectedOption={
            busOptions.find((option) => option.value === bus) ?? { value: bus, label: bus }
          }
          options={busOptions}
          onChange={({ detail }) => changeBus(detail.selectedOption.value ?? DEFAULT_BUS_NAME)}
        />
      </FormField>
      <TextFilter
        {...filterProps}
        filteringPlaceholder='Find rules by name'
        countText={`${filteredItemsCount ?? 0} matches`}
      />
    </SpaceBetween>
  );

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='multi'
        ariaLabels={selectionLabels<RuleRow>("rule", (rule) => rule.name)}
        trackBy={NAME_FIELD}
        items={items}
        loading={rules.isLoading}
        loadingText='Loading rules'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        header={header}
        filter={filter}
        pagination={<Pagination {...paginationProps} />}
      />
      {!unknownBus && busArn && <BusSenders busArn={busArn} />}
      {deleting && (
        <DeleteRulesModal
          rules={selected}
          onDismiss={() => setDeleting(false)}
          onDone={finishDelete}
        />
      )}
    </div>
  );
}
