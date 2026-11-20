import CodeView from "@cloudscape-design/code-view/code-view";
import javascriptHighlight from "@cloudscape-design/code-view/highlight/javascript";
import pythonHighlight from "@cloudscape-design/code-view/highlight/python";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Tabs from "@cloudscape-design/components/tabs";
import type { CodeSample } from "../codeSamples.ts";
import { CopyButton } from "./CopyButton.tsx";

const LANGUAGES = [
  { id: "node", label: "Node.js", highlight: javascriptHighlight },
  { id: "python", label: "Python", highlight: pythonHighlight },
] as const;

const CONNECT_DESCRIPTION = "Code for your app, with this resource filled in.";
const COPY_CODE_LABEL = "Copy code";

// Một tab cho mỗi ngôn ngữ: code tô màu cú pháp, nút Copy ở góc trên phải.
// Dòng dài tự xuống dòng (panel hẹp, điện thoại); Copy vẫn chép nguyên văn
export function CodeSamples({ sample }: { sample: CodeSample }) {
  return (
    <Tabs
      disableContentPaddings
      tabs={LANGUAGES.map(({ id, label, highlight }) => ({
        id,
        label,
        content: (
          <CodeView
            content={sample[id]}
            highlight={highlight}
            wrapLines
            ariaLabel={`${label} code`}
            actions={
              <CopyButton
                variant='icon'
                text={sample[id]}
                label={COPY_CODE_LABEL}
              />
            }
          />
        ),
      }))}
    />
  );
}

// Thẻ Connect cho resource chưa có thẻ này (S3, DynamoDB, Lambda, SES)
export function ConnectCard({ sample }: { sample: CodeSample }) {
  return (
    <Container
      header={
        <Header variant='h2' description={CONNECT_DESCRIPTION}>
          Connect
        </Header>
      }
    >
      <CodeSamples sample={sample} />
    </Container>
  );
}
