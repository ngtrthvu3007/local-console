import { useEffect } from "react";
import { useWatch } from "react-hook-form";
import { useNavigate, useParams, useSearchParams } from "react-router";
import Alert from "@cloudscape-design/components/alert";
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
import { isNotFoundError } from "@localconsole/core/shared";
import { TestPatternSection } from "../components/TestPatternSection.tsx";
import {
  EDITOR_HEIGHT_PX,
  DEFAULT_BUS_NAME,
  DEFAULT_EVENT_PATTERN,
  NAME_MAX_LENGTH,
  nameConstraint,
  RULE_TYPES,
  SCHEDULE_PLACEHOLDER,
  ruleType,
  type Rule,
  ruleSchema,
  type RuleForm as RuleFormValues,
  SEARCH_PARAMS,
  eventbridgeRoutes,
} from "@localconsole/core/eventbridge";
import { useBuses } from "../hooks/useBuses.ts";
import { usePutRule, useRule } from "../hooks/useRules.ts";
import { rulesCrumbs } from "../routes.ts";

const SCHEDULE_DESCRIPTION =
  "For new schedules, EventBridge Scheduler offers time zones and one-time runs.";
// Floci 2.4.0 không so khớp các kiểu này (spec mục 7 #8)
const PATTERN_LIMITS =
  "Floci 2.4.0 does not match numeric, wildcard, or array values in events. These patterns never match locally.";

function initialValues(bus: string, existing?: Rule): RuleFormValues {
  return {
    bus,
    name: existing?.name ?? "",
    description: existing?.description ?? "",
    type: existing ? ruleType(existing) : "pattern",
    eventPattern: existing?.eventPattern ?? DEFAULT_EVENT_PATTERN,
    scheduleExpression: existing?.scheduleExpression ?? "",
    enabled: existing?.enabled ?? true,
  };
}

interface FormProps {
  bus: string;
  existing?: Rule; // có thì là sửa: bus và tên bị khóa
}

function RuleFormView({ bus, existing }: FormProps) {
  const follow = useFollow();
  const navigate = useNavigate();
  const buses = useBuses();
  const putRule = usePutRule(existing);
  const form = useZodForm(ruleSchema, initialValues(bus, existing));
  const [selectedBus, watchedType, eventPattern] = useWatch({
    control: form.control,
    name: ["bus", "type", "eventPattern"],
  });
  // Loại hiển thị theo bus đang chọn: useWatch không thấy giá trị do effect bên dưới đặt lại
  const type = selectedBus === DEFAULT_BUS_NAME ? watchedType : "pattern";

  // Rule theo lịch chỉ có trên bus default: đổi sang bus khác thì tile Schedule bị khóa, nên đưa loại về Event pattern
  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      if (name === "bus" && values.bus !== DEFAULT_BUS_NAME && values.type === "schedule")
        form.setValue("type", "pattern");
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const cancelHref = existing
    ? eventbridgeRoutes.rule(existing.bus, existing.name)
    : eventbridgeRoutes.rules(bus);

  const submit = form.handleSubmit((values) =>
    putRule.mutate(
      values,
      notifyOutcome({
        success: existing ? `Saved rule ${values.name}` : `Created rule ${values.name}`,
        errorHeader: `Couldn't save ${values.name}`,
        then: () => navigate(eventbridgeRoutes.rule(values.bus, values.name)),
      }),
    ),
  );

  // Luật của AWS: rule theo lịch chỉ có trên bus default
  const typeItems = [
    {
      value: "pattern",
      label: RULE_TYPES.pattern,
      description: "Match events by their content.",
    },
    {
      value: "schedule",
      label: RULE_TYPES.schedule,
      description: "Run on a rate or cron schedule.",
      disabled: selectedBus !== DEFAULT_BUS_NAME,
    },
  ];
  const busOptions = (buses.data ?? []).map(({ name }) => ({ value: name, label: name }));
  const heading = existing ? `Edit ${existing.name}` : "Create rule";

  const actions = (
    <ResponsiveActions footer>
      <Button variant='link' href={cancelHref} onFollow={follow}>
        Cancel
      </Button>
      <Button variant='primary' formAction='submit' loading={putRule.isPending}>
        {existing ? "Save" : "Create rule"}
      </Button>
    </ResponsiveActions>
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Form header={<Header variant='h1'>{heading}</Header>} actions={actions}>
        <Container header={<Header variant='h2'>Rule details</Header>}>
          <SpaceBetween size='l'>
            {existing ? (
              <SpaceBetween size='l'>
                <FormField label='Event bus'>
                  <Box>{existing.bus}</Box>
                </FormField>
                <FormField label='Name'>
                  <Box>{existing.name}</Box>
                </FormField>
              </SpaceBetween>
            ) : (
              <SpaceBetween size='l'>
                <FormSelect
                  control={form.control}
                  name='bus'
                  label='Event bus'
                  options={busOptions}
                />
                <FormInput
                  control={form.control}
                  name='name'
                  label='Name'
                  constraintText={nameConstraint(NAME_MAX_LENGTH)}
                  placeholder='order-created'
                  autoFocus
                />
              </SpaceBetween>
            )}
            <FormInput control={form.control} name='description' label='Description - optional' />
            <FormTiles control={form.control} name='type' label='Rule type' items={typeItems} />
            {type === "pattern" ? (
              <SpaceBetween size='s'>
                <FormValueEditor
                  control={form.control}
                  name='eventPattern'
                  label='Event pattern'
                  height={EDITOR_HEIGHT_PX}
                />
                <Alert type='info'>{PATTERN_LIMITS}</Alert>
                <TestPatternSection pattern={eventPattern} />
              </SpaceBetween>
            ) : (
              <FormInput
                control={form.control}
                name='scheduleExpression'
                label='Schedule expression'
                description={SCHEDULE_DESCRIPTION}
                placeholder={SCHEDULE_PLACEHOLDER}
              />
            )}
            <FormCheckbox control={form.control} name='enabled' text='Enabled' />
          </SpaceBetween>
        </Container>
      </Form>
    </form>
  );
}

// /rules/create?bus= hoặc /rules/:bus/:rule/edit
export function RuleForm() {
  const { bus: busParam, rule: ruleName } = useParams();
  const [searchParams] = useSearchParams();
  const editing = Boolean(ruleName);
  const bus = busParam ?? searchParams.get(SEARCH_PARAMS.bus) ?? DEFAULT_BUS_NAME;
  const existing = useRule(bus, ruleName ?? "");

  useBreadcrumbs([
    ...rulesCrumbs,
    editing
      ? { text: `Edit ${ruleName}`, href: eventbridgeRoutes.editRule(bus, ruleName ?? "") }
      : { text: "Create rule", href: eventbridgeRoutes.createRule(bus) },
  ]);

  if (!editing) return <RuleFormView bus={bus} />;
  const state = pageState(existing, {
    ready: Boolean(existing.data),
    notFound: existing.isError && isNotFoundError(existing.error),
    title: `Rule ${ruleName} not found`,
    backHref: eventbridgeRoutes.rules(bus),
    backText: "View rules",
  });
  if (state || !existing.data) return state;

  return <RuleFormView bus={bus} existing={existing.data} />;
}
