import { useState } from "react";
import ace from "ace-builds";
import "ace-builds/src-noconflict/ext-language_tools"; // CodeEditor bật autocomplete nên cần extension này
import "ace-builds/src-noconflict/mode-javascript";
import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/mode-python";
import "ace-builds/src-noconflict/theme-dawn";
// Autocomplete tự tải snippet theo đường dẫn tương đối (404 trên Vite), nên nạp sẵn
import "ace-builds/src-noconflict/snippets/javascript";
import "ace-builds/src-noconflict/snippets/json";
import "ace-builds/src-noconflict/snippets/python";
import "ace-builds/src-noconflict/snippets/text";
import javascriptWorkerUrl from "ace-builds/src-noconflict/worker-javascript?url";
import jsonWorkerUrl from "ace-builds/src-noconflict/worker-json?url";
import CloudscapeCodeEditor, {
  type CodeEditorProps,
} from "@cloudscape-design/components/code-editor";

const EDITOR_THEME = "dawn";
const DEFAULT_HEIGHT_PX = 320;

ace.config.setModuleUrl("ace/mode/json_worker", jsonWorkerUrl);
ace.config.setModuleUrl("ace/mode/javascript_worker", javascriptWorkerUrl);

// Ace nhầm dấu ` đóng ngay sau `${...}` là dấu mở nên chèn thừa ``. Bỏ tự đóng cặp cho `,
// các dấu nháy và ngoặc khác vẫn tự đóng
const JAVASCRIPT_PAIRED_QUOTES = { '"': '"', "'": "'" };
ace.require("ace/mode/javascript").Mode.prototype.$quotes = JAVASCRIPT_PAIRED_QUOTES;

export type EditorLanguage = "json" | "javascript" | "python";

interface Props {
  value: string;
  onChange: (value: string) => void;
  language?: EditorLanguage;
  height?: number;
}

// Nạp bằng React.lazy vì ace khá nặng
export default function CodeEditor({
  value,
  onChange,
  language = "json",
  height = DEFAULT_HEIGHT_PX,
}: Props) {
  // Người dùng kéo được khung editor cao lên
  const [contentHeight, setContentHeight] = useState(height);
  const [preferences, setPreferences] = useState<CodeEditorProps.Preferences>({
    wrapLines: true,
    theme: EDITOR_THEME,
  });
  return (
    <CloudscapeCodeEditor
      ace={ace}
      language={language}
      value={value}
      onChange={({ detail }) => onChange(detail.value)}
      preferences={preferences}
      onPreferencesChange={({ detail }) => setPreferences(detail)}
      editorContentHeight={contentHeight}
      onEditorContentResize={({ detail }) => setContentHeight(detail.height)}
      themes={{ light: [EDITOR_THEME], dark: [] }}
    />
  );
}
