import { useState } from "react";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import type { EventDestination } from "@aws-sdk/client-sesv2";
import Table, { type TableProps } from "@shared/components/ResponsiveTable.tsx";
import { ActionBar, type BarAction } from "@shared/components/ActionBar.tsx";
import { EmptyState } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR } from "@shared/constants.ts";
import { errorMessage, notifyOutcome } from "@shared/hooks/useNotify.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { BusLink } from "../../eventbridge/components/BusLink.tsx";
import { busNameOfArn, resourceNameOfArn } from "../../eventbridge/targets.ts";
import { TopicLink } from "../../sns/components/TopicLink.tsx";
import { eventTypeLabel, toInput } from "../configurationSets.ts";
import { DESTINATION_KIND_LABELS, SIMULATOR_HINTS } from "../constants.ts";
import { useEventDestinations, useUpdateDestination } from "../hooks/useConfigurationSets.ts";

const BUS_HINT =
  'SES sends to the default event bus only, with source "aws.ses" and detail-type like "Email Sent". Create a rule on the default bus for that source to catch them.';

function TargetCell({ destination }: { destination: EventDestination }) {
  const target = toInput(destination);
  if (!target) return <>Other</>;
  return (
    <>
      {DESTINATION_KIND_LABELS[target.kind]}
      {DETAIL_SEPARATOR}
      {target.kind === "sns" ? (
        <TopicLink name={resourceNameOfArn(target.arn)} />
      ) : (
        <BusLink name={busNameOfArn(target.arn)} />
      )}
    </>
  );
}

const COLUMNS: TableProps.ColumnDefinition<EventDestination>[] = [
  { id: "name", header: "Name", isRowHeader: true, cell: (item) => item.Name },
  {
    id: "events",
    header: "Event types",
    cell: (item) => item.MatchingEventTypes?.map(eventTypeLabel).join(", "),
  },
  { id: "target", header: "Destination", cell: (item) => <TargetCell destination={item} /> },
  {
    id: "state",
    header: "State",
    cell: (item) => (
      <StatusIndicator type={item.Enabled ? "success" : "stopped"}>
        {item.Enabled ? "Enabled" : "Disabled"}
      </StatusIndicator>
    ),
  },
];

interface Props {
  name: string;
  // Modal Add / Delete mở ở trang: panel bị mount lại khi khung đổi cỡ nên không giữ được modal
  onAdd: () => void;
  onDelete: (destination: string) => void;
}

export function ConfigurationSetPanel({ name, onAdd, onDelete }: Props) {
  const destinations = useEventDestinations(name);
  const update = useUpdateDestination();
  const [selectedName, setSelectedName] = useState<string>();
  // Chọn theo tên: destination vừa xóa ở modal thì không còn trong danh sách nên tự bỏ chọn
  const single = destinations.data?.find((item) => item.Name === selectedName);
  const selected = single ? [single] : [];
  const input = single && toInput(single);

  if (destinations.error) return <Alert type='error'>{errorMessage(destinations.error)}</Alert>;

  const toggle = () =>
    input &&
    update.mutate(
      { set: name, name: single.Name ?? "", input: { ...input, enabled: !input.enabled } },
      notifyOutcome({
        success: `${input.enabled ? "Disabled" : "Enabled"} destination ${single.Name}`,
        errorHeader: "Couldn't change the destination",
        then: () => setSelectedName(undefined),
      }),
    );

  const actions: BarAction[] = [
    {
      id: "toggle",
      text: single?.Enabled ? "Disable" : "Enable",
      // Destination loại lạ (Kinesis…) form không dựng lại được nên không bật / tắt từ đây
      disabled: !input,
      loading: update.isPending,
      onClick: toggle,
    },
    {
      id: "delete",
      text: "Delete",
      disabled: !single,
      onClick: () => onDelete(single?.Name ?? ""),
    },
    { id: "add", text: "Add destination", primary: true, onClick: onAdd },
  ];

  return (
    <SpaceBetween size='m'>
      <Table
        variant='embedded'
        selectionType='single'
        ariaLabels={selectionLabels<EventDestination>("destination", (item) => item.Name ?? "")}
        trackBy='Name'
        items={destinations.data ?? []}
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelectedName(detail.selectedItems[0]?.Name)}
        loading={destinations.isLoading}
        loadingText='Loading destinations'
        columnDefinitions={COLUMNS}
        wrapLines
        empty={
          <EmptyState
            title='No event destinations'
            description='Add one to receive Send, Delivery, Bounce and Complaint events.'
          />
        }
        header={
          <Header
            variant='h3'
            counter={destinations.data ? `(${destinations.data.length})` : undefined}
            actions={<ActionBar compact={false} actions={actions} />}
          >
            Event destinations
          </Header>
        }
      />
      <Box color='text-body-secondary'>
        Send to{" "}
        {SIMULATOR_HINTS.map(({ address, event }) => (
          <span key={address}>
            <code>{address}</code> for {event},{" "}
          </span>
        ))}
        to get those events. {BUS_HINT}
      </Box>
    </SpaceBetween>
  );
}
