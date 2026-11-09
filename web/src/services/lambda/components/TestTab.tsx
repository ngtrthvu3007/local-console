import { lazy, Suspense, useState } from "react";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import RadioGroup from "@cloudscape-design/components/radio-group";
import SegmentedControl from "@cloudscape-design/components/segmented-control";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import { CodeSnippet } from "@shared/components/CodeSnippet.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { notifyError, notifySuccess } from "@shared/hooks/useNotify.ts";
import { jsonError, prettyJson } from "@shared/json.ts";
import {
  DEFAULT_EVENT_TEMPLATE,
  INVOCATION_TYPES,
  eventTemplates,
  type EventTemplateName,
  type InvocationType,
} from "../constants.ts";
import { useInvoke, type InvokeResult } from "../hooks/useInvoke.ts";
import { useTestEvents } from "../hooks/useTestEvents.ts";
import { testEventNameSchema } from "../schemas.ts";

const CodeEditor = lazy(() => import("@shared/components/CodeEditor.tsx"));

const EVENT_MODES = { create: "create", saved: "saved" } as const;
type EventMode = (typeof EVENT_MODES)[keyof typeof EVENT_MODES];

const INVOCATION_OPTIONS = [
  { id: INVOCATION_TYPES.sync, text: "Synchronous" },
  { id: INVOCATION_TYPES.async, text: "Asynchronous" },
];

const EDITOR_HEIGHT_PX = 240;
const RESULT_COLUMNS = 2;
const EMPTY_EVENT = "{}";

interface Props {
  functionName: string;
  logGroup: string;
  hasUndeployedChanges: boolean;
  onOpenMonitor: () => void;
}

function InvokeResultView({
  result,
  onOpenMonitor,
}: {
  result: InvokeResult;
  onOpenMonitor: () => void;
}) {
  if (result.status === "accepted") {
    return (
      <Alert type='info' header='Invocation accepted (202)'>
        The function runs in the background.{" "}
        <Button variant='inline-link' onClick={onOpenMonitor}>
          See its logs in Monitor
        </Button>
      </Alert>
    );
  }

  // Handler ném lỗi hay hết giờ là kết quả của lần chạy, không phải lỗi của console
  const succeeded = result.status === "succeeded";
  const summary = [
    { label: "Duration", value: `${result.durationMs} ms (measured in the browser)` },
    { label: "Request ID", value: result.requestId ?? NOT_AVAILABLE },
  ];

  return (
    <Alert
      type={succeeded ? "success" : "error"}
      header={`Execution result: ${succeeded ? "succeeded" : "failed"}`}
    >
      <SpaceBetween size='m'>
        <KeyValuePairs columns={RESULT_COLUMNS} items={summary} />
        {/* Xếp dọc như AWS Console: dòng log và stack trace dài, đặt cạnh nhau thì bị cắt */}
        <FormField label='Response' stretch>
          <CodeSnippet code={result.response} />
        </FormField>
        <FormField label='Log output' stretch>
          <CodeSnippet code={result.logs || "No log output."} />
        </FormField>
      </SpaceBetween>
    </Alert>
  );
}

export function TestTab({ functionName, logGroup, hasUndeployedChanges, onOpenMonitor }: Props) {
  const { region } = useLoadedConfig();
  const templates = eventTemplates(region);
  const testEvents = useTestEvents(functionName);
  const savedNames = Object.keys(testEvents.events).sort();
  const invoke = useInvoke(functionName, logGroup);

  const [savedName, setSavedName] = useState<string>();
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState<string>();
  const [templateName, setTemplateName] = useState<EventTemplateName>(DEFAULT_EVENT_TEMPLATE);
  const [invocationType, setInvocationType] = useState<InvocationType>(INVOCATION_TYPES.sync);
  const [eventJson, setEventJson] = useState(() => prettyJson(templates[DEFAULT_EVENT_TEMPLATE]));

  const syntaxError = jsonError(eventJson);

  const openSaved = (name: string) => {
    setSavedName(name);
    setEventJson(testEvents.events[name]);
  };

  // Có savedName nghĩa là đang sửa event đã lưu
  const chooseMode = (nextMode: EventMode) =>
    nextMode === EVENT_MODES.saved ? openSaved(savedNames[0]) : setSavedName(undefined);

  const chooseTemplate = (name: EventTemplateName) => {
    setTemplateName(name);
    setEventJson(prettyJson(templates[name]));
  };

  const save = () => {
    if (savedName !== undefined) {
      testEvents.save(savedName, eventJson);
      return notifySuccess(`Saved test event ${savedName}`);
    }
    const parsed = testEventNameSchema(savedNames).safeParse(newName);
    if (!parsed.success) return setNameError(parsed.error.issues[0].message);
    testEvents.save(parsed.data, eventJson);
    setNameError(undefined);
    setNewName("");
    setSavedName(parsed.data);
    notifySuccess(`Saved test event ${parsed.data}`);
  };

  const remove = () => {
    if (savedName === undefined) return;
    testEvents.remove(savedName);
    setSavedName(undefined);
    notifySuccess(`Deleted test event ${savedName}`);
  };

  const runTest = () =>
    invoke.mutate(
      { payload: eventJson.trim() || EMPTY_EVENT, invocationType },
      { onError: (error) => notifyError(error, `Couldn't invoke ${functionName}`) },
    );

  const modeItems = [
    { value: EVENT_MODES.create, label: "Create new event" },
    { value: EVENT_MODES.saved, label: "Edit saved event", disabled: !savedNames.length },
  ];
  const savedOptions = savedNames.map((name) => ({ value: name, label: name }));
  const templateOptions = Object.keys(templates).map((name) => ({ value: name, label: name }));

  const eventPicker =
    savedName !== undefined ? (
      <FormField label='Saved event'>
        <Select
          options={savedOptions}
          selectedOption={{ value: savedName, label: savedName }}
          onChange={({ detail }) => openSaved(detail.selectedOption.value!)}
        />
      </FormField>
    ) : (
      <ColumnLayout columns={2}>
        <FormField
          label='Event name'
          constraintText='Needed only to save the event.'
          errorText={nameError}
        >
          <Input
            value={newName}
            placeholder='my-event'
            onChange={({ detail }) => setNewName(detail.value)}
          />
        </FormField>
        <FormField label='Template'>
          <Select
            options={templateOptions}
            selectedOption={{ value: templateName, label: templateName }}
            onChange={({ detail }) =>
              chooseTemplate(detail.selectedOption.value as EventTemplateName)
            }
          />
        </FormField>
      </ColumnLayout>
    );

  const headerActions = (
    <SpaceBetween direction='horizontal' size='xs'>
      <Button disabled={savedName === undefined} onClick={remove}>
        Delete
      </Button>
      <Button disabled={Boolean(syntaxError)} onClick={save}>
        Save
      </Button>
      <Button
        variant='primary'
        disabled={Boolean(syntaxError)}
        loading={invoke.isPending}
        onClick={runTest}
      >
        Test
      </Button>
    </SpaceBetween>
  );

  const header = (
    <Header
      variant='h2'
      description='Saved events are kept in this browser only.'
      actions={headerActions}
    >
      Test event
    </Header>
  );

  return (
    <SpaceBetween size='l'>
      <Container header={header}>
        <SpaceBetween size='l'>
          {hasUndeployedChanges && (
            <Alert type='warning' header='Deploy your changes first'>
              The code tab has changes that aren't deployed. Tests run the deployed code.
            </Alert>
          )}
          <FormField label='Event'>
            <RadioGroup
              direction='horizontal'
              items={modeItems}
              value={savedName === undefined ? EVENT_MODES.create : EVENT_MODES.saved}
              onChange={({ detail }) => chooseMode(detail.value as EventMode)}
            />
          </FormField>
          {eventPicker}
          <FormField label='Invocation'>
            <SegmentedControl
              options={INVOCATION_OPTIONS}
              selectedId={invocationType}
              onChange={({ detail }) => setInvocationType(detail.selectedId as InvocationType)}
            />
          </FormField>
          <FormField label='Event JSON' stretch errorText={syntaxError}>
            <Suspense fallback={<Spinner />}>
              <CodeEditor value={eventJson} onChange={setEventJson} height={EDITOR_HEIGHT_PX} />
            </Suspense>
          </FormField>
          {invoke.isPending && (
            <Box color='text-body-secondary'>
              First run of a runtime may take a while: Floci downloads its image.
            </Box>
          )}
        </SpaceBetween>
      </Container>
      {invoke.data && <InvokeResultView result={invoke.data} onOpenMonitor={onOpenMonitor} />}
    </SpaceBetween>
  );
}
