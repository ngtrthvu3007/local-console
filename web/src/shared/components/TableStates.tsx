import type { ReactNode } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { errorMessage } from "../hooks/useNotify.ts";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Box textAlign='center' color='inherit' padding={{ vertical: "s" }}>
      <SpaceBetween size='xs'>
        <Box variant='strong' color='inherit'>
          {title}
        </Box>
        {description && <Box color='text-body-secondary'>{description}</Box>}
        {action}
      </SpaceBetween>
    </Box>
  );
}

export interface FailableQuery {
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

// Nội dung khi bảng trống: lỗi tải (kèm Retry) hoặc trạng thái rỗng
export const emptyOrError = (query: FailableQuery, empty: ReactNode) =>
  query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : empty;

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <Box textAlign='center' padding={{ vertical: "s" }}>
      <SpaceBetween size='xs'>
        <StatusIndicator type='error'>{errorMessage(error)}</StatusIndicator>
        <Button onClick={onRetry}>Retry</Button>
      </SpaceBetween>
    </Box>
  );
}
