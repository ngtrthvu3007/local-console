import { useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import type { Service } from "@aws-sdk/client-ecs";
import Box from "@cloudscape-design/components/box";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { Figure, FigureHeader } from "@shared/components/Figure.tsx";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { TABLE_PAGE_SIZE } from "@shared/constants.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { SERVICE_STATUS_STYLES } from "../constants.ts";
import { useServices } from "../hooks/useServices.ts";
import { ecsRoutes } from "@localconsole/core/ecs";
import { DeleteServicesModal } from "./DeleteServicesModal.tsx";
import { StatusBadge } from "@shared/components/StatusBadge.tsx";
import { TaskDefinitionLink } from "./TaskDefinitionLink.tsx";
import { UpdateServiceModal } from "./UpdateServiceModal.tsx";

const NAME_FIELD = "serviceName";

interface Props {
  cluster: string;
  // Cluster đã chắc có: ListServices với cluster lạ trả 400, "default" thì bị Floci tạo (spec 7 #13)
  enabled: boolean;
}

// Bảng service của cluster
export function ServicesTab({ cluster, enabled }: Props) {
  const follow = useFollow();
  const { ref, compact } = useIsCompact();
  const services = useServices(cluster, enabled);
  const [modal, setModal] = useState<"update" | "delete">();
  const createHref = ecsRoutes.createService(cluster);

  const { items, collectionProps, paginationProps, actions } = useCollection<Service>(
    services.data ?? [],
    {
      filtering: {
        empty: emptyOrError(
          services,
          <EmptyState
            title='No services'
            description='A service keeps a number of tasks running and replaces the ones that stop.'
          />,
        ),
      },
      sorting: { defaultState: { sortingColumn: { sortingField: NAME_FIELD } } },
      pagination: { pageSize: TABLE_PAGE_SIZE },
      selection: { trackBy: NAME_FIELD },
    },
  );
  const selected = collectionProps.selectedItems ?? [];
  const [first] = selected;
  const finish = () => {
    setModal(undefined);
    actions.setSelectedItems([]);
  };

  const nameLink = (service: Service) => (
    <Link href={ecsRoutes.service(cluster, service.serviceName ?? "")} onFollow={follow}>
      {service.serviceName}
    </Link>
  );
  const nameColumn: TableProps.ColumnDefinition<Service> = {
    id: "name",
    header: "Service",
    sortingField: NAME_FIELD,
    isRowHeader: true,
    cell: nameLink,
  };
  const statusColumn: TableProps.ColumnDefinition<Service> = {
    id: "status",
    header: "Status",
    cell: (service) => <StatusBadge status={service.status} styles={SERVICE_STATUS_STYLES} />,
  };

  const wideColumns: TableProps.ColumnDefinition<Service>[] = [
    nameColumn,
    statusColumn,
    {
      id: "desired",
      header: <FigureHeader>Desired</FigureHeader>,
      cell: (service) => <Figure>{service.desiredCount ?? 0}</Figure>,
    },
    {
      id: "running",
      header: <FigureHeader>Running</FigureHeader>,
      cell: (service) => <Figure>{service.runningCount ?? 0}</Figure>,
    },
    {
      id: "definition",
      header: "Task definition",
      cell: (service) => <TaskDefinitionLink arn={service.taskDefinition} />,
    },
  ];
  // Khung hẹp: tầng 2 là running / desired, màu xám
  const compactColumns: TableProps.ColumnDefinition<Service>[] = [
    {
      ...nameColumn,
      cell: (service) => (
        <div>
          {nameLink(service)}
          <Box variant='small' display='block' color='text-body-secondary'>
            {`${service.runningCount ?? 0}/${service.desiredCount ?? 0} running`}
          </Box>
        </div>
      ),
    },
    statusColumn,
  ];

  const barActions: BarAction[] = [
    refreshAction(services),
    { id: "delete", text: "Delete", disabled: !selected.length, onClick: () => setModal("delete") },
    {
      id: "update",
      text: "Update",
      disabled: selected.length !== 1,
      onClick: () => setModal("update"),
    },
    { id: "create", text: "Create", primary: true, href: createHref },
  ];

  return (
    <div ref={ref}>
      <Table
        {...collectionProps}
        selectionType='multi'
        ariaLabels={selectionLabels<Service>("service", (service) => service.serviceName ?? "")}
        trackBy={NAME_FIELD}
        items={items}
        loading={services.isLoading}
        loadingText='Loading services'
        columnDefinitions={compact ? compactColumns : wideColumns}
        wrapLines={compact}
        header={
          <Header
            counter={services.data ? `(${services.data.length})` : undefined}
            actions={<ActionBar compact={compact} actions={barActions} />}
          >
            Services
          </Header>
        }
        pagination={<Pagination {...paginationProps} />}
      />
      {modal === "update" && first && (
        <UpdateServiceModal cluster={cluster} service={first} onDismiss={finish} />
      )}
      {modal === "delete" && (
        <DeleteServicesModal
          cluster={cluster}
          names={selected.map((service) => service.serviceName ?? "")}
          onDismiss={() => setModal(undefined)}
          onDone={finish}
        />
      )}
    </div>
  );
}
