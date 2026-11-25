import jsonHighlight from "@cloudscape-design/code-view/highlight/json";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { CodeSnippet } from "@shared/components/CodeSnippet.tsx";
import { ErrorState } from "@shared/components/TableStates.tsx";
import { useKeyPolicy } from "../hooks/useKeys.ts";

// Chỉ xem: Floci không bắt buộc quyền nên sửa policy không có tác dụng (spec mục 2)
export function PolicyTab({ keyId }: { keyId: string }) {
  const policy = useKeyPolicy(keyId);

  const body = policy.isError ? (
    <ErrorState error={policy.error} onRetry={() => policy.refetch()} />
  ) : policy.data === undefined ? (
    <StatusIndicator type='loading'>Loading key policy</StatusIndicator>
  ) : (
    <CodeSnippet code={policy.data} highlight={jsonHighlight} ariaLabel='Key policy' />
  );

  return (
    <Container
      header={
        <Header variant='h2' description="Floci doesn't enforce key policies.">
          Key policy
        </Header>
      }
    >
      {body}
    </Container>
  );
}
