import { useState } from "react";
import { useParams } from "react-router";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { TABLE_PAGE_SIZE } from "@shared/constants.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { taskDefinitionLabel, STATUS, type RevisionRow, ecsRoutes } from "@localconsole/core/ecs";
import { REVISION_STATUS_STYLES } from "../constants.ts";
import { RevisionActionModal } from "../components/RevisionActionModal.tsx";
import { StatusBadge } from "@shared/components/StatusBadge.tsx";
import { useRevisions } from "../hooks/useTaskDefinitions.ts";
import { familyCrumbs } from "../routes.ts";

const ARN_FIELD = "arn";

export function TaskDefinitionRevisions() {
  const { family = "" } = useParams();
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const revisions = useRevisions(family);
  const [action, setAction] = useState<"deregister" | "delete">();

  useBreadcrumbs(familyCrumbs(family));

  const { items, collectionProps, paginationProps, actions } = useCollection<RevisionRow>(
    revisions.data ?? [],
    { pagination: { pageSize: TABLE_PAGE_SIZE }, selection: { trackBy: ARN_FIELD } },
  );

  const state = pageState(revisions, {
    ready: Boolean(revisions.data?.length),
    notFound: revisions.data?.length === 0,
    title: `Task definition ${family} not found`,
    backHref: ecsRoutes.taskDefinitions,
    backText: "View task definitions",
  });
  if (state) return state;

  const selected = collectionProps.selectedItems ?? [];
  const allSelected = (status: RevisionRow["status"]) =>
    selected.length > 0 && selected.every((row) => row.status === status);
  const [latest] = revisions.data ?? [];
  const finish = () => {
    setAction(undefined);
    actions.setSelectedItems([]);
  };

  const columns: TableProps.ColumnDefinition<RevisionRow>[] = [
    {
      id: "revision",
      header: "Revision",
      isRowHeader: true,
      cell: (row) => (
        <Link href={ecsRoutes.revision(row.family, row.revision)} onFollow={follow}>
          {taskDefinitionLabel(row.arn)}
        </Link>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} styles={REVISION_STATUS_STYLES} />,
    },
  ];

  // Như AWS: chỉ deregister revision đang Active, chỉ xóa revision đã Inactive
  const barActions: BarAction[] = [
    refreshAction(revisions),
    {
      id: "delete",
      text: "Delete",
      disabled: !allSelected(STATUS.inactive),
      onClick: () => setAction("delete"),
    },
    {
      id: "deregister",
      text: "Deregister",
      disabled: !allSelected(STATUS.active),
      onClick: () => setAction("deregister"),
    },
    {
      id: "create",
      text: "Create new revision",
      primary: true,
      href: ecsRoutes.createTaskDefinition(latest && taskDefinitionLabel(latest.arn)),
    },
  ];

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        variant='full-page'
        selectionType='multi'
        ariaLabels={selectionLabels<RevisionRow>("revision", (row) => taskDefinitionLabel(row.arn))}
        trackBy={ARN_FIELD}
        items={items}
        columnDefinitions={columns}
        header={
          <Header
            variant='awsui-h1-sticky'
            counter={`(${revisions.data?.length ?? 0})`}
            description='Revisions of this task definition, newest first.'
            actions={<ActionBar compact={compact} actions={barActions} />}
          >
            {family}
          </Header>
        }
        pagination={<Pagination {...paginationProps} />}
      />
      {action && (
        <RevisionActionModal
          action={action}
          arns={selected.map((row) => row.arn)}
          onDismiss={() => setAction(undefined)}
          onDone={finish}
        />
      )}
    </div>
  );
}
