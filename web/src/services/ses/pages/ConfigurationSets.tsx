import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE, TABLE_PAGE_SIZE } from "@shared/constants.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { useSplitPanel } from "@shared/hooks/useSplitPanel.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { AddDestinationModal } from "../components/AddDestinationModal.tsx";
import { DeleteDestinationModal } from "../components/DeleteDestinationModal.tsx";
import { ConfigurationSetPanel } from "../components/ConfigurationSetPanel.tsx";
import { CreateConfigurationSetModal } from "../components/CreateConfigurationSetModal.tsx";
import { DeleteConfigurationSetsModal } from "../components/DeleteConfigurationSetsModal.tsx";
import { toInput } from "../configurationSets.ts";
import { DESTINATION_KIND_LABELS } from "../constants.ts";
import { useAllEventDestinations, useConfigurationSets } from "../hooks/useConfigurationSets.ts";
import { useIdentityConfigurationSets } from "../hooks/useIdentities.ts";
import { SEARCH_PARAMS, sesBaseCrumbs, sesRoutes } from "../routes.ts";

interface SetRow {
  name: string;
}

const crumbs = [
  ...sesBaseCrumbs,
  { text: "Configuration sets", href: sesRoutes.configurationSets },
];
const ITEM_SEPARATOR = "; ";

export function ConfigurationSets() {
  useBreadcrumbs(crumbs);
  const { region } = useLoadedConfig();
  const { ref, compact } = useIsCompact();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sets = useConfigurationSets();
  const rows: SetRow[] = (sets.data ?? []).map((name) => ({ name }));
  const destinations = useAllEventDestinations(sets.data ?? []);
  const defaults = useIdentityConfigurationSets();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string[] | null>(null);
  const [destinationModal, setDestinationModal] = useState<
    { kind: "add" } | { kind: "delete"; destination: string } | null
  >(null);

  // Set → các identity dùng nó làm mặc định
  const usedBy = new Map<string, string[]>();
  for (const [identity, set] of defaults)
    if (set) usedBy.set(set, [...(usedBy.get(set) ?? []), identity]);

  const openParam = searchParams.get(SEARCH_PARAMS.configurationSet);
  const openName = sets.data?.find((name) => name === openParam);

  const emptyState = emptyOrError(
    sets,
    <EmptyState
      title='No configuration sets'
      description='A configuration set sends the events of your mail to an SNS topic or an event bus.'
      action={<Button onClick={() => setCreating(true)}>Create configuration set</Button>}
    />,
  );
  const { items, collectionProps, paginationProps, actions } = useCollection<SetRow>(rows, {
    filtering: { empty: emptyState },
    sorting: { defaultState: { sortingColumn: { sortingField: "name" } } },
    pagination: { pageSize: TABLE_PAGE_SIZE },
    selection: { trackBy: "name" },
  });
  const selected = collectionProps.selectedItems ?? [];

  const setHref = (name: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(SEARCH_PARAMS.configurationSet, name);
    return `?${next}`;
  };
  // Đổi set khi panel đang mở thì thay entry, để Back luôn đóng panel
  const openSet = (name: string) => navigate(setHref(name), { replace: Boolean(openName) });
  const closeSet = () =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(SEARCH_PARAMS.configurationSet);
        return next;
      },
      { replace: true },
    );

  useSplitPanel(
    openName
      ? {
          header: openName,
          description: `Events of mail sent with this configuration set. Region: ${region}.`,
          onClose: closeSet,
          body: (
            <ConfigurationSetPanel
              key={openName}
              name={openName}
              onAdd={() => setDestinationModal({ kind: "add" })}
              onDelete={(destination) => setDestinationModal({ kind: "delete", destination })}
            />
          ),
        }
      : null,
  );

  const summary = (name: string) => {
    const list = destinations.get(name);
    if (!list) return NOT_AVAILABLE;
    if (!list.length) return "None";
    return list
      .map((destination) => {
        const target = toInput(destination);
        return `${destination.Name}${target ? ` → ${DESTINATION_KIND_LABELS[target.kind]}` : ""}`;
      })
      .join(ITEM_SEPARATOR);
  };

  const columns: TableProps.ColumnDefinition<SetRow>[] = [
    {
      id: "name",
      header: "Name",
      sortingField: "name",
      isRowHeader: true,
      cell: ({ name }) => (
        <Link
          href={setHref(name)}
          onFollow={(event) => {
            event.preventDefault();
            openSet(name);
          }}
        >
          {name === openName ? <strong>{name}</strong> : name}
        </Link>
      ),
    },
    { id: "destinations", header: "Event destinations", cell: ({ name }) => summary(name) },
    {
      id: "usedBy",
      header: "Used by (identities)",
      cell: ({ name }) => usedBy.get(name)?.join(", ") ?? NOT_AVAILABLE,
    },
  ];

  const barActions: BarAction[] = [
    refreshAction(sets),
    {
      id: "delete",
      text: "Delete",
      disabled: !selected.length,
      onClick: () => setDeleting(selected.map((row) => row.name)),
    },
    {
      id: "create",
      text: "Create configuration set",
      primary: true,
      onClick: () => setCreating(true),
    },
  ];

  const finishDelete = (names: string[]) => {
    setDeleting(null);
    actions.setSelectedItems([]);
    if (openName && names.includes(openName)) closeSet();
  };

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='multi'
        ariaLabels={selectionLabels<SetRow>("configuration set", (item) => item.name)}
        trackBy='name'
        items={items}
        loading={sets.isLoading}
        loadingText='Loading configuration sets'
        columnDefinitions={columns}
        wrapLines={compact}
        header={
          <Header
            variant='awsui-h1-sticky'
            counter={sets.data ? `(${sets.data.length})` : undefined}
            description='Send the events of your mail (send, delivery, bounce, complaint) to an SNS topic or an event bus.'
            actions={<ActionBar compact={compact} actions={barActions} />}
          >
            Configuration sets
          </Header>
        }
        pagination={<Pagination {...paginationProps} />}
      />
      {creating && (
        <CreateConfigurationSetModal onDismiss={() => setCreating(false)} onCreated={openSet} />
      )}
      {openName && destinationModal?.kind === "add" && (
        <AddDestinationModal set={openName} onDismiss={() => setDestinationModal(null)} />
      )}
      {openName && destinationModal?.kind === "delete" && (
        <DeleteDestinationModal
          set={openName}
          destination={destinationModal.destination}
          onDismiss={() => setDestinationModal(null)}
        />
      )}
      {deleting && (
        <DeleteConfigurationSetsModal
          names={deleting}
          usedBy={usedBy}
          onDismiss={() => setDeleting(null)}
          onDone={finishDelete}
        />
      )}
    </div>
  );
}
