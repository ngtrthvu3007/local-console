import { lazy, Suspense, useMemo } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import type { FunctionConfiguration } from "@aws-sdk/client-lambda";
import { EmptyState, ErrorState } from "@shared/components/TableStates.tsx";
import { formatBytes } from "@shared/format.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { editorLanguageOf, handlerModuleOf, inlineLanguageOf } from "../codeTemplates.ts";
import { INLINE_EDIT_MAX_BYTES, PACKAGE_TYPE_ZIP } from "../constants.ts";
import { useCodePackage } from "../hooks/useFunctionCode.ts";
import { useDeployCode } from "../hooks/useFunctions.ts";
import { textFilesOf, zipPackage, type CodeEdits } from "../zipArchive.ts";

const CodeEditor = lazy(() => import("@shared/components/CodeEditor.tsx"));

const EDITOR_HEIGHT_PX = 480;
const MODIFIED_TAG = "Modified";
const MODULE_EXTENSION_SEPARATOR = ".";
const fileRowStyle = { display: "flex", alignItems: "center" } as const;
const fileSelectStyle = { flex: 1, minWidth: 0 } as const;

// Giống AWS Console: chỉ sửa trên trang khi là gói .zip, Node.js/Python và không quá lớn
const canEditInline = (configuration: FunctionConfiguration) =>
  configuration.PackageType === PACKAGE_TYPE_ZIP &&
  Boolean(inlineLanguageOf(configuration.Runtime)) &&
  (configuration.CodeSize ?? 0) <= INLINE_EDIT_MAX_BYTES;

interface Props {
  configuration: FunctionConfiguration;
  codeLocation?: string;
  edits: CodeEdits;
  onEditsChange: (edits: CodeEdits) => void;
  // File đang mở và bản sửa nằm ở trang cha, để đổi tab rồi quay lại vẫn như cũ
  openPath?: string;
  onOpenPathChange: (path?: string) => void;
}

export function CodeTab(props: Props) {
  const { configuration, codeLocation, edits, onEditsChange, openPath, onOpenPathChange } = props;
  const name = configuration.FunctionName ?? "";
  const editable = canEditInline(configuration);
  const codePackage = useCodePackage(
    name,
    editable ? codeLocation : undefined,
    configuration.CodeSha256,
  );
  const deployCode = useDeployCode(name);

  const textFiles = useMemo(
    () => (codePackage.data ? textFilesOf(codePackage.data) : {}),
    [codePackage.data],
  );
  const paths = Object.keys(textFiles).sort();
  // Mặc định mở file chứa handler (index.handler → index.mjs)
  const handlerPrefix = handlerModuleOf(configuration.Handler) + MODULE_EXTENSION_SEPARATOR;
  const handlerPath = paths.find((path) => path.startsWith(handlerPrefix)) ?? paths[0];
  const path = openPath && paths.includes(openPath) ? openPath : handlerPath;
  const hasUndeployedChanges = Object.keys(edits).length > 0;

  const changeFile = (text: string) => {
    const { [path]: _previous, ...otherEdits } = edits;
    onEditsChange(text === textFiles[path] ? otherEdits : { ...otherEdits, [path]: text });
  };

  const deploy = () =>
    deployCode.mutate(
      zipPackage(codePackage.data!, edits),
      notifyOutcome({
        success: `Deployed ${name}`,
        errorHeader: `Couldn't deploy ${name}`,
        then: () => onEditsChange({}),
      }),
    );

  if (!editable) {
    return (
      <Container header={<Header variant='h2'>Code source</Header>}>
        <EmptyState
          title="Inline editing isn't available for this function"
          description={`Only Node.js and Python functions packaged as .zip, up to ${formatBytes(INLINE_EDIT_MAX_BYTES)}, can be edited here. Deploy this function with your project's tools.`}
        />
      </Container>
    );
  }

  const fileOptions = paths.map((filePath) => ({
    value: filePath,
    label: filePath,
    tags: filePath in edits ? [MODIFIED_TAG] : undefined,
  }));

  // Nhãn đứng cạnh ô chọn, căn giữa theo chiều dọc; ô chọn chiếm phần còn lại
  const fileSelect = (
    <Select
      filteringType='auto'
      options={fileOptions}
      selectedOption={fileOptions.find((option) => option.value === path) ?? null}
      onChange={({ detail }) => onOpenPathChange(detail.selectedOption.value)}
    />
  );
  const fileBar = (
    <FormField label='File' stretch>
      <div style={fileRowStyle}>
        <div style={fileSelectStyle}>{fileSelect}</div>
        {hasUndeployedChanges && (
          <Box margin={{ left: "m" }}>
            <StatusIndicator type='warning'>Changes not deployed</StatusIndicator>
          </Box>
        )}
      </div>
    </FormField>
  );

  const body = codePackage.isLoading ? (
    <Spinner />
  ) : codePackage.isError ? (
    <ErrorState error={codePackage.error} onRetry={() => codePackage.refetch()} />
  ) : (
    <SpaceBetween size='m'>
      {fileBar}
      <Suspense fallback={<Spinner />}>
        <CodeEditor
          key={path}
          value={edits[path] ?? textFiles[path] ?? ""}
          onChange={changeFile}
          language={editorLanguageOf(path)}
          height={EDITOR_HEIGHT_PX}
        />
      </Suspense>
    </SpaceBetween>
  );

  const deployButton = (
    <Button
      variant='primary'
      disabled={!hasUndeployedChanges || !codePackage.data}
      loading={deployCode.isPending}
      onClick={deploy}
    >
      Deploy
    </Button>
  );

  const header = (
    <Header
      variant='h2'
      description='Edit the code, then deploy. Changes take effect from the next invocation.'
      actions={deployButton}
    >
      Code source
    </Header>
  );

  return <Container header={header}>{body}</Container>;
}
