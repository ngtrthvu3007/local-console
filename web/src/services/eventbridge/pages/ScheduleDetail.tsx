import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs, {
  type KeyValuePairsProps,
} from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { pageState } from "@shared/components/PageState.tsx";
import { ActionBar, type BarAction } from "@shared/components/ActionBar.tsx";
import { copyToClipboard } from "@shared/clipboard.ts";
import { CodeSnippet } from "@shared/components/CodeSnippet.tsx";
import { ConnectCard } from "@shared/components/CodeSamples.tsx";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import { DETAIL_SEPARATOR, ITEM_LIST_WIDTH_PX, NOT_AVAILABLE } from "@shared/constants.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { reformatJson } from "@shared/json.ts";
import { scheduleSample } from "../codeSamples.ts";
import { DeleteSchedulesModal } from "../components/DeleteSchedulesModal.tsx";
import { TargetResource } from "../components/TargetResource.tsx";
import { AFTER_COMPLETION, FLEXIBLE_MODES, SCHEDULE_STATES } from "../constants.ts";
import { isScheduleMissing, useSchedule, useSetSchedulesEnabled } from "../hooks/useSchedules.ts";
import { eventbridgeRoutes, scheduleCrumbs } from "../routes.ts";
import { parseExpression } from "../scheduleExpression.ts";
import { toScheduleRow, type Schedule } from "../schedules.ts";
import { TARGET_KINDS, targetKindOfArn } from "../targets.ts";

const DETAILS_COLUMNS = 3;
const NOT_FOUND_NOTE =
  "One-time schedules with Delete after completion are removed after they run.";

function flexibleWindow(schedule: Schedule): string {
  const window = schedule.FlexibleTimeWindow;
  return window?.Mode === FLEXIBLE_MODES.flexible
    ? `Flexible, ${window.MaximumWindowInMinutes} minutes`
    : "Off";
}

function ScheduleView({ schedule }: { schedule: Schedule }) {
  const navigate = useNavigate();
  const { ref, compact } = useIsCompact();
  // Điện thoại: khối có ARN dài để một cột, giống rule
  const { ref: detailsRef, compact: phone } = useIsCompact(ITEM_LIST_WIDTH_PX);
  const [deleting, setDeleting] = useState(false);
  const setEnabled = useSetSchedulesEnabled();

  const row = toScheduleRow({ ...schedule, Target: schedule.Target });
  const enabled = schedule.State === SCHEDULE_STATES.enabled;
  const kind = parseExpression(schedule.ScheduleExpression ?? "").kind;
  const target = schedule.Target;

  const toggleState = () =>
    setEnabled.mutate(
      { rows: [row], enabled: !enabled },
      notifyOutcome({
        success: enabled ? "Disabled schedule" : "Enabled schedule",
        errorHeader: "Couldn't change the schedule state",
      }),
    );

  const barActions: BarAction[] = [
    { id: "delete", text: "Delete", onClick: () => setDeleting(true) },
    {
      id: "state",
      text: enabled ? "Disable" : "Enable",
      loading: setEnabled.isPending,
      onClick: toggleState,
    },
    {
      id: "edit",
      text: "Edit",
      primary: true,
      href: eventbridgeRoutes.editSchedule(row.group, row.name),
    },
  ];

  const header = (
    <Header
      variant='h1'
      description={[
        kind === "at" ? "One-time" : "Recurring",
        schedule.ScheduleExpression,
        schedule.ScheduleExpressionTimezone,
        enabled ? "Enabled" : "Disabled",
      ]
        .filter(Boolean)
        .join(DETAIL_SEPARATOR)}
      actions={
        <ActionBar
          compact={compact}
          actions={barActions}
          menuItems={[{ id: "copy", text: "Copy ARN" }]}
          onMenuItemClick={() => copyToClipboard(schedule.Arn ?? "", "ARN")}
        />
      }
    >
      {row.name}
    </Header>
  );

  const scheduleItems: KeyValuePairsProps.Item[] = [
    { label: "Expression", value: schedule.ScheduleExpression ?? NOT_AVAILABLE },
    { label: "Time zone", value: schedule.ScheduleExpressionTimezone ?? NOT_AVAILABLE },
    { label: "Flexible time window", value: flexibleWindow(schedule) },
    { label: "State", value: enabled ? "Enabled" : "Disabled" },
    { label: "Group", value: row.group },
    ...(kind === "at"
      ? [
          {
            label: "Delete after completion",
            value: schedule.ActionAfterCompletion === AFTER_COMPLETION.delete ? "Yes" : "No",
          },
        ]
      : []),
    { label: "Description", value: schedule.Description ?? NOT_AVAILABLE },
    {
      label: "ARN",
      value: <CopyButton variant='inline' text={schedule.Arn} label={schedule.Arn} />,
    },
  ];
  const targetItems: KeyValuePairsProps.Item[] = [
    { label: "Type", value: TARGET_KINDS[targetKindOfArn(target?.Arn ?? "")] },
    { label: "Resource", value: <TargetResource arn={target?.Arn ?? ""} /> },
    ...(target?.Input
      ? [{ label: "Input", value: <CodeSnippet code={reformatJson(target.Input)} /> }]
      : []),
  ];

  return (
    <div ref={ref}>
      <ContentLayout header={header}>
        <div ref={detailsRef}>
          <SpaceBetween size='l'>
            <Container header={<Header variant='h2'>Schedule</Header>}>
              <KeyValuePairs columns={phone ? 1 : DETAILS_COLUMNS} items={scheduleItems} />
            </Container>
            <Container header={<Header variant='h2'>Target</Header>}>
              <KeyValuePairs columns={phone ? 1 : DETAILS_COLUMNS} items={targetItems} />
            </Container>
            <ConnectCard sample={scheduleSample(schedule)} />
          </SpaceBetween>
        </div>
      </ContentLayout>
      {deleting && (
        <DeleteSchedulesModal
          schedules={[row]}
          onDismiss={() => setDeleting(false)}
          onDone={() => navigate(eventbridgeRoutes.schedules(row.group))}
        />
      )}
    </div>
  );
}

export function ScheduleDetail() {
  const { group = "", name = "" } = useParams();
  const details = useSchedule(group, name);

  useBreadcrumbs(scheduleCrumbs(group, name));

  const state = pageState(details, {
    ready: Boolean(details.data),
    notFound: details.isError && isScheduleMissing(details.error),
    title: `Schedule ${name} not found`,
    backHref: eventbridgeRoutes.schedules(group),
    backText: "View schedules",
  });
  if (state || !details.data) return state;

  return <ScheduleView schedule={details.data} />;
}
