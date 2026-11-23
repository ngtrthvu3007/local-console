import { useState } from "react";
import ace from "ace-builds";
// CodeEditor bật autocomplete nên cần extension này
import "ace-builds/src-noconflict/ext-language_tools";
import "ace-builds/src-noconflict/mode-javascript";
import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/mode-python";
import "ace-builds/src-noconflict/mode-yaml";
import "ace-builds/src-noconflict/theme-dawn";
import "ace-builds/src-noconflict/theme-cloud_editor_dark";
// Autocomplete tự tải snippet theo đường dẫn tương đối (404 trên Vite): nạp sẵn
import "ace-builds/src-noconflict/snippets/javascript";
import "ace-builds/src-noconflict/snippets/json";
import "ace-builds/src-noconflict/snippets/python";
import "ace-builds/src-noconflict/snippets/text";
import javascriptWorkerUrl from "ace-builds/src-noconflict/worker-javascript?url";
import jsonWorkerUrl from "ace-builds/src-noconflict/worker-json?url";
import CloudscapeCodeEditor, {
  type CodeEditorProps,
} from "@cloudscape-design/components/code-editor";

// Để Cloudscape tự chọn theme theo chế độ sáng / tối; cloud_editor_dark cùng tông nền với trang
const EDITOR_THEMES = { light: ["dawn"], dark: ["cloud_editor_dark"] };
const DEFAULT_HEIGHT_PX = 320;

ace.config.setModuleUrl("ace/mode/json_worker", jsonWorkerUrl);
ace.config.setModuleUrl("ace/mode/javascript_worker", javascriptWorkerUrl);

// Ace nhầm dấu ` đóng ngay sau `${...}` là dấu mở nên chèn thừa ``. Bỏ tự đóng
// cặp cho `, các dấu nháy và ngoặc khác vẫn tự đóng
const JAVASCRIPT_PAIRED_QUOTES = { '"': '"', "'": "'" };
ace.require("ace/mode/javascript").Mode.prototype.$quotes = JAVASCRIPT_PAIRED_QUOTES;

// Worker YAML không hiểu tag của CloudFormation (!Ref, !Sub…) nên báo warning sai trên
// template đúng. Tắt nó: lỗi YAML thật do Floci báo khi deploy
ace.require("ace/mode/yaml").Mode.prototype.createWorker = () => null;

// "text": chế độ chữ thường có sẵn trong ace, không cần nạp thêm
export type EditorLanguage = "json" | "javascript" | "python" | "yaml" | "text";

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

  const [preferences, setPreferences] = useState<Partial<CodeEditorProps.Preferences>>({
    wrapLines: true,
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
      themes={EDITOR_THEMES}
    />
  );
}
