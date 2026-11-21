import Alert from "@cloudscape-design/components/alert";
import Spinner from "@cloudscape-design/components/spinner";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { CodeSnippet } from "@shared/components/CodeSnippet.tsx";
import { errorMessage } from "@shared/hooks/useNotify.ts";
import { HTML_PREVIEW_HEIGHT } from "../constants.ts";
import { useTemplate } from "../hooks/useTemplates.ts";
import { HtmlPreview } from "./HtmlPreview.tsx";

const previewFrameStyle = { maxHeight: HTML_PREVIEW_HEIGHT, overflow: "auto" } as const;

export function TemplatePanel({ name }: { name: string }) {
  const template = useTemplate(name);

  if (template.error) return <Alert type='error'>{errorMessage(template.error)}</Alert>;
  if (!template.data) return <Spinner />;

  const { Html: html, Text: text } = template.data;
  const tabs: TabsProps.Tab[] = [];
  if (html) {
    tabs.push({
      id: "html",
      label: "HTML",
      content: <HtmlPreview html={html} title='Template HTML' />,
    });
  }
  if (text) {
    tabs.push({
      id: "text",
      label: "Text",
      content: (
        <div style={previewFrameStyle}>
          <CodeSnippet code={text} wrap />
        </div>
      ),
    });
  }
  if (!tabs.length) return <Alert type='warning'>This template has no content</Alert>;
  return <Tabs tabs={tabs} />;
}
