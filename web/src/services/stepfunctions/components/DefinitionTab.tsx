import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import { CodeBlock } from "./CodeBlock.tsx";
import { reformatJson } from "@shared/json.ts";

// Definition chỉ đọc: workflow viết trong CDK, sửa ở console sẽ bị deploy sau ghi đè
export function DefinitionTab({ definition }: { definition: string }) {
  return (
    <Container header={<Header variant='h2'>Definition</Header>}>
      <CodeBlock code={reformatJson(definition)} />
    </Container>
  );
}
