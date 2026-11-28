import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import jsonHighlight from "@cloudscape-design/code-view/highlight/json";
import { CodeSnippet } from "@shared/components/CodeSnippet.tsx";
import { reformatJson } from "@localconsole/core/shared";

// Definition chỉ đọc: workflow viết trong CDK, sửa ở console sẽ bị deploy sau ghi đè
export function DefinitionTab({ definition }: { definition: string }) {
  return (
    <Container header={<Header variant='h2'>Definition</Header>}>
      <CodeSnippet code={reformatJson(definition)} highlight={jsonHighlight} wrap />
    </Container>
  );
}
