import { useState } from "react";
import ace from "ace-builds";
import "ace-builds/src-noconflict/ext-language_tools"; // CodeEditor bật autocomplete nên cần extension này
import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/theme-dawn";
import jsonWorkerUrl from "ace-builds/src-noconflict/worker-json?url";
import CodeEditor, { type CodeEditorProps } from "@cloudscape-design/components/code-editor";

const EDITOR_THEME = "dawn";
const DEFAULT_HEIGHT_PX = 320;

ace.config.setModuleUrl("ace/mode/json_worker", jsonWorkerUrl);

interface Props {
  value: string;
  onChange: (value: string) => void;
  height?: number;
}

// Nạp bằng React.lazy vì ace khá nặng
export default function JsonEditor({ value, onChange, height = DEFAULT_HEIGHT_PX }: Props) {
  const [preferences, setPreferences] = useState<CodeEditorProps.Preferences>({
    wrapLines: true,
    theme: EDITOR_THEME,
  });
  return (
    <CodeEditor
      ace={ace}
      language='json'
      value={value}
      onChange={({ detail }) => onChange(detail.value)}
      preferences={preferences}
      onPreferencesChange={({ detail }) => setPreferences(detail)}
      editorContentHeight={height}
      themes={{ light: [EDITOR_THEME], dark: [] }}
    />
  );
}
