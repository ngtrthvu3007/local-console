import Box from "@cloudscape-design/components/box";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { servicePath, services, type ServiceDefinition } from "../../registry.ts";
import { ServiceIcon } from "@shared/components/ServiceIcon.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFlociStatus } from "@shared/hooks/useFlociStatus.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";

function ServiceCell({
  service,
  showCount = false,
}: {
  service: ServiceDefinition;
  showCount?: boolean;
}) {
  const follow = useFollow();
  return (
    <div className='console-service'>
      <ServiceIcon service={service} />
      <div>
        <Link href={servicePath(service)} onFollow={follow}>
          {service.fullName}
        </Link>
        <Box variant='small' display='block' color='text-body-secondary'>
          {service.description}
        </Box>
        {showCount && (
          <div className='console-service__count'>
            <ResourceCountCell service={service} />
          </div>
        )}
      </div>
    </div>
  );
}

// Component riêng để gọi hook đếm của service (cell của Table không được gọi hook)
function ResourceCountCell({ service }: { service: ServiceDefinition }) {
  const resources = service.useResourceCount?.();
  const live = useFlociStatus().state === "running";
  if (!resources || !live || resources.count === undefined) {
    return <Box color='text-status-inactive'>{NOT_AVAILABLE}</Box>;
  }
  const color = resources.count > 0 ? "inherit" : "text-status-inactive";
  return (
    <Box color={color}>
      <span className='console-count'>{pluralize(resources.count, resources.noun)}</span>
    </Box>
  );
}

function QuickLinksCell({ service }: { service: ServiceDefinition }) {
  const follow = useFollow();
  return (
    <SpaceBetween direction='horizontal' size='m'>
      {service.quickLinks.map((link) => (
        <Link key={link.href} href={link.href} onFollow={follow}>
          {link.text}
        </Link>
      ))}
    </SpaceBetween>
  );
}

const serviceColumn: TableProps.ColumnDefinition<ServiceDefinition> = {
  id: "service",
  header: "Service",
  isRowHeader: true,
  cell: (service) => <ServiceCell service={service} />,
};
const resourcesColumn: TableProps.ColumnDefinition<ServiceDefinition> = {
  id: "resources",
  header: "Resources",
  cell: (service) => <ResourceCountCell service={service} />,
};
const quickLinksColumn: TableProps.ColumnDefinition<ServiceDefinition> = {
  id: "quick-links",
  header: "Quick links",
  cell: (service) => <QuickLinksCell service={service} />,
};

const WIDE_COLUMNS = [serviceColumn, resourcesColumn, quickLinksColumn];
const COMPACT_COLUMNS: TableProps.ColumnDefinition<ServiceDefinition>[] = [
  {
    ...serviceColumn,
    cell: (service) => <ServiceCell service={service} showCount />,
  },
];

export function ServicesTable() {
  const { region } = useLoadedConfig();
  const { ref, compact } = useIsCompact();

  const header = (
    <Header counter={`(${services.length})`} description={`Resources are counted in ${region}.`}>
      Services
    </Header>
  );

  return (
    <div ref={ref}>
      <Table
        variant='container'
        items={services}
        trackBy='id'
        wrapLines
        columnDefinitions={compact ? COMPACT_COLUMNS : WIDE_COLUMNS}
        header={header}
      />
    </div>
  );
}
