import { useEffect } from "react";
import { useWatch } from "react-hook-form";
import { useNavigate, useParams, useSearchParams } from "react-router";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import {
  FormCheckbox,
  FormInput,
  FormSelect,
  FormTiles,
} from "@shared/components/form/FormFields.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { FormValueEditor } from "@shared/components/ValueEditor.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useFunctions } from "../../lambda/hooks/useFunctions.ts";
import { useTopics } from "../../sns/hooks/useTopics.ts";
import { useQueues } from "../../sqs/hooks/useQueues.ts";
import { TargetResource } from "../components/TargetResource.tsx";
import {
  AFTER_COMPLETION,
  DEFAULT_FLEXIBLE_MINUTES,
  DEFAULT_SCHEDULE_GROUP,
  EDITOR_HEIGHT_PX,
  FLEXIBLE_MODES,
  RATE_UNITS,
  SCHEDULE_KINDS,
  NAME_MAX_LENGTH,
  nameConstraint,
  SCHEDULE_STATES,
} from "../constants.ts";
import { useBuses } from "../hooks/useBuses.ts";
import {
  isScheduleMissing,
  useSaveSchedule,
  useSchedule,
  useScheduleGroups,
} from "../hooks/useSchedules.ts";
import { SEARCH_PARAMS, eventbridgeRoutes, schedulesCrumbs } from "../routes.ts";
import { buildExpression, parseExpression } from "../scheduleExpression.ts";
import { scheduleSchema, type ScheduleForm as ScheduleFormValues } from "../schemas.ts";
import { buildTarget, editableTargetKind, toUpdateInput, type Schedule } from "../schedules.ts";
import { SCHEDULE_TARGET_KINDS, TARGET_KINDS, type ScheduleTargetKind } from "../targets.ts";

const CRON_DESCRIPTION = "Example: 0 9 ? * MON-FRI * runs at 9:00 on weekdays.";
// Floci chạy ngay schedule `at` có giờ đã qua (AWS thì từ chối), và xóa nó luôn nếu bật Delete after completion
const AT_DESCRIPTION =
  "Local time in the time zone below. A time that has passed runs right away in Floci.";
const INPUT_DESCRIPTION =
  "Placeholders like <aws.scheduler.scheduled-time> are replaced on each run.";
const FLEXIBLE_DESCRIPTION = "Floci always fires on time.";
const LOCKED_TARGET_NOTE = "This target type can't be edited here.";
const FALLBACK_TIMEZONE = "UTC";

// Trình duyệt chỉ liệt kê tên chuẩn (Asia/Saigon), nhưng schedule có thể lưu tên khác (Asia/Ho_Chi_Minh):
// luôn đưa giá trị đang có vào danh sách, nếu không ô chọn hiện trống
const timezones = (current?: string) => {
  const names = new Set([FALLBACK_TIMEZONE, ...Intl.supportedValuesOf("timeZone")]);
  if (current) names.add(current);
  return [...names].sort();
};
const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const KIND_ITEMS = Object.entries(SCHEDULE_KINDS).map(([value, label]) => ({ value, label }));
const FLEXIBLE_ITEMS = [
  { value: FLEXIBLE_MODES.off, label: "Off" },
  { value: FLEXIBLE_MODES.flexible, label: "Flexible", description: FLEXIBLE_DESCRIPTION },
];
const RATE_UNIT_OPTIONS = RATE_UNITS.map((unit) => ({ value: unit, label: unit }));
const TARGET_KIND_OPTIONS = SCHEDULE_TARGET_KINDS.map((kind) => ({
  value: kind,
  label: TARGET_KINDS[kind],
}));
const EMPTY_TEXT: Record<ScheduleTargetKind, string> = {
  lambda: "No functions",
  sqs: "No queues",
  sns: "No topics",
  eventbus: "No event buses",
};

function initialValues(group: string, existing?: Schedule): ScheduleFormValues {
  const timing = parseExpression(existing?.ScheduleExpression ?? "");
  const target = existing?.Target;
  return {
    name: existing?.Name ?? "",
    group,
    description: existing?.Description ?? "",
    kind: existing ? timing.kind : "rate",
    atTime: timing.atTime,
    rateValue: timing.rateValue,
    rateUnit: timing.rateUnit,
    cron: timing.cron,
    timezone: existing?.ScheduleExpressionTimezone ?? browserTimezone(),
    deleteAfter: existing ? existing.ActionAfterCompletion === AFTER_COMPLETION.delete : true,
    flexMode: existing?.FlexibleTimeWindow?.Mode ?? FLEXIBLE_MODES.off,
    flexMinutes: String(
      existing?.FlexibleTimeWindow?.MaximumWindowInMinutes ?? DEFAULT_FLEXIBLE_MINUTES,
    ),
    targetKind: existing ? (editableTargetKind(target) ?? "other") : "lambda",
    targetArn: target?.Arn ?? "",
    groupId: target?.SqsParameters?.MessageGroupId ?? "",
    source: target?.EventBridgeParameters?.Source ?? "",
    detailType: target?.EventBridgeParameters?.DetailType ?? "",
    input: target?.Input ?? "",
    enabled: existing ? existing.State === SCHEDULE_STATES.enabled : true,
  };
}

interface FormProps {
  group: string;
  existing?: Schedule; // có thì là sửa: tên và group bị khóa
}

function ScheduleFormView({ group, existing }: FormProps) {
  const follow = useFollow();
  const navigate = useNavigate();
  const groups = useScheduleGroups();
  const functions = useFunctions();
  const queues = useQueues();
  const topics = useTopics();
  const buses = useBuses();
  const save = useSaveSchedule(Boolean(existing));

  const fifoArns = new Set((queues.data ?? []).filter((queue) => queue.fifo).map((q) => q.arn));
  const form = useZodForm(scheduleSchema(fifoArns), initialValues(group, existing));
  const [kind, flexMode, targetKind, targetArn] = useWatch({
    control: form.control,
    name: ["kind", "flexMode", "targetKind", "targetArn"],
  });

  // Người dùng đổi loại đích thì bỏ resource của loại cũ (lúc mở form giữ nguyên giá trị đang sửa)
  useEffect(() => {
    const subscription = form.watch((_values, { name }) => {
      if (name === "targetKind") form.setValue("targetArn", "");
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const cancelHref = existing
    ? eventbridgeRoutes.schedule(group, existing.Name ?? "")
    : eventbridgeRoutes.schedules(group);

  const submit = form.handleSubmit((values) => {
    const changes = {
      Description: values.description || undefined,
      ScheduleExpression: buildExpression(values),
      // Timezone chỉ có nghĩa với at và cron; rate giữ giá trị cũ khi sửa
      ScheduleExpressionTimezone:
        values.kind === "rate" ? existing?.ScheduleExpressionTimezone : values.timezone,
      FlexibleTimeWindow:
        values.flexMode === FLEXIBLE_MODES.flexible
          ? { Mode: FLEXIBLE_MODES.flexible, MaximumWindowInMinutes: Number(values.flexMinutes) }
          : { Mode: FLEXIBLE_MODES.off },
      Target:
        values.targetKind === "other" && existing?.Target
          ? existing.Target
          : buildTarget(
              {
                arn: values.targetArn,
                input: values.input,
                messageGroupId: fifoArns.has(values.targetArn) ? values.groupId : undefined,
                eventBus:
                  values.targetKind === "eventbus"
                    ? { source: values.source, detailType: values.detailType }
                    : undefined,
              },
              existing?.Target,
            ),
      State: values.enabled ? SCHEDULE_STATES.enabled : SCHEDULE_STATES.disabled,
      ActionAfterCompletion:
        values.kind === "at"
          ? values.deleteAfter
            ? AFTER_COMPLETION.delete
            : AFTER_COMPLETION.keep
          : undefined,
    };
    // Sửa: gộp với kết quả GetSchedule để giữ StartDate, EndDate, KmsKeyArn…
    const input = existing
      ? toUpdateInput(existing, changes)
      : { Name: values.name, GroupName: values.group, ...changes };
    save.mutate(
      input,
      notifyOutcome({
        success: existing ? `Saved schedule ${values.name}` : `Created schedule ${values.name}`,
        errorHeader: `Couldn't save ${values.name}`,
        then: () => navigate(eventbridgeRoutes.schedule(values.group, values.name)),
      }),
    );
  });

  const optionsByKind: Record<ScheduleTargetKind, { value: string; label: string }[]> = {
    lambda: (functions.data ?? []).map((fn) => ({
      value: fn.FunctionArn ?? "",
      label: fn.FunctionName ?? "",
    })),
    sqs: (queues.data ?? []).map((queue) => ({ value: queue.arn, label: queue.name })),
    sns: (topics.data ?? []).map((topic) => ({ value: topic.arn, label: topic.name })),
    eventbus: (buses.data ?? []).map((bus) => ({ value: bus.arn, label: bus.name })),
  };
  const groupOptions = (groups.data ?? [DEFAULT_SCHEDULE_GROUP]).map((name) => ({
    value: name,
    label: name,
  }));
  const timezoneOptions = timezones(existing?.ScheduleExpressionTimezone).map((name) => ({
    value: name,
    label: name,
  }));

  const actions = (
    <ResponsiveActions footer>
      <Button variant='link' href={cancelHref} onFollow={follow}>
        Cancel
      </Button>
      <Button variant='primary' formAction='submit' loading={save.isPending}>
        {existing ? "Save" : "Create schedule"}
      </Button>
    </ResponsiveActions>
  );

  const detailsContainer = (
    <Container header={<Header variant='h2'>Schedule details</Header>}>
      <SpaceBetween size='l'>
        {existing ? (
          <SpaceBetween size='l'>
            <FormField label='Name'>
              <Box>{existing.Name}</Box>
            </FormField>
            <FormField label='Schedule group'>
              <Box>{existing.GroupName}</Box>
            </FormField>
          </SpaceBetween>
        ) : (
          <SpaceBetween size='l'>
            <FormInput
              control={form.control}
              name='name'
              label='Name'
              constraintText={nameConstraint(NAME_MAX_LENGTH)}
              placeholder='daily-report'
              autoFocus
            />
            <FormSelect
              control={form.control}
              name='group'
              label='Schedule group'
              options={groupOptions}
            />
          </SpaceBetween>
        )}
        <FormInput control={form.control} name='description' label='Description - optional' />
        <FormCheckbox control={form.control} name='enabled' text='Enabled' />
      </SpaceBetween>
    </Container>
  );

  const scheduleContainer = (
    <Container header={<Header variant='h2'>Schedule</Header>}>
      <SpaceBetween size='l'>
        <FormTiles control={form.control} name='kind' label='Schedule type' items={KIND_ITEMS} />
        {kind === "at" && (
          <SpaceBetween size='l'>
            <FormInput
              control={form.control}
              name='atTime'
              label='Date and time'
              description={AT_DESCRIPTION}
              placeholder='2030-01-31T09:00:00'
            />
            <FormCheckbox
              control={form.control}
              name='deleteAfter'
              text='Delete after completion'
              description='The schedule is removed after it runs once.'
            />
          </SpaceBetween>
        )}
        {kind === "rate" && (
          <SpaceBetween size='l' direction='horizontal'>
            <FormInput control={form.control} name='rateValue' label='Rate' />
            <FormSelect
              control={form.control}
              name='rateUnit'
              label='Unit'
              options={RATE_UNIT_OPTIONS}
            />
          </SpaceBetween>
        )}
        {kind === "cron" && (
          <FormInput
            control={form.control}
            name='cron'
            label='Cron expression'
            description={CRON_DESCRIPTION}
            placeholder='0 9 ? * MON-FRI *'
          />
        )}
        {kind !== "rate" && (
          <FormSelect
            control={form.control}
            name='timezone'
            label='Time zone'
            options={timezoneOptions}
          />
        )}
        <FormTiles
          control={form.control}
          name='flexMode'
          label='Flexible time window'
          items={FLEXIBLE_ITEMS}
        />
        {flexMode === FLEXIBLE_MODES.flexible && (
          <FormInput control={form.control} name='flexMinutes' label='Window (minutes)' />
        )}
      </SpaceBetween>
    </Container>
  );

  const targetContainer = (
    <Container header={<Header variant='h2'>Target</Header>}>
      {targetKind === "other" ? (
        <SpaceBetween size='s'>
          <TargetResource arn={targetArn} />
          <Box color='text-body-secondary'>{LOCKED_TARGET_NOTE}</Box>
        </SpaceBetween>
      ) : (
        <SpaceBetween size='l'>
          <FormSelect
            control={form.control}
            name='targetKind'
            label='Target type'
            options={TARGET_KIND_OPTIONS}
          />
          <FormSelect
            control={form.control}
            name='targetArn'
            label={TARGET_KINDS[targetKind]}
            placeholder='Choose a resource'
            empty={EMPTY_TEXT[targetKind]}
            options={optionsByKind[targetKind]}
          />
          {fifoArns.has(targetArn) && (
            <FormInput control={form.control} name='groupId' label='Message group ID' />
          )}
          {targetKind === "eventbus" && (
            <SpaceBetween size='l'>
              <FormInput control={form.control} name='source' label='Source' />
              <FormInput control={form.control} name='detailType' label='Detail type' />
            </SpaceBetween>
          )}
          <SpaceBetween size='xs'>
            <FormValueEditor
              control={form.control}
              name='input'
              label='Input - optional'
              height={EDITOR_HEIGHT_PX}
            />
            <Box color='text-body-secondary'>{INPUT_DESCRIPTION}</Box>
          </SpaceBetween>
        </SpaceBetween>
      )}
    </Container>
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Form
        header={
          <Header variant='h1'>{existing ? `Edit ${existing.Name}` : "Create schedule"}</Header>
        }
        actions={actions}
      >
        <SpaceBetween size='l'>
          {detailsContainer}
          {scheduleContainer}
          {targetContainer}
        </SpaceBetween>
      </Form>
    </form>
  );
}

// /schedules/create?group= hoặc /schedules/:group/:name/edit
export function ScheduleForm() {
  const { group: groupParam, name = "" } = useParams();
  const [searchParams] = useSearchParams();
  const editing = Boolean(name);
  const group = groupParam ?? searchParams.get(SEARCH_PARAMS.group) ?? DEFAULT_SCHEDULE_GROUP;
  const existing = useSchedule(group, name);

  useBreadcrumbs([
    ...schedulesCrumbs,
    editing
      ? { text: `Edit ${name}`, href: eventbridgeRoutes.editSchedule(group, name) }
      : { text: "Create schedule", href: eventbridgeRoutes.createSchedule(group) },
  ]);

  if (!editing) return <ScheduleFormView group={group} />;
  const state = pageState(existing, {
    ready: Boolean(existing.data),
    notFound: existing.isError && isScheduleMissing(existing.error),
    title: `Schedule ${name} not found`,
    backHref: eventbridgeRoutes.schedules(group),
    backText: "View schedules",
  });
  if (state || !existing.data) return state;

  return <ScheduleFormView group={group} existing={existing.data} />;
}
