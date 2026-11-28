import { EmptyState } from "@shared/components/TableStates.tsx";
import { LogEvents } from "@shared/logs/LogEvents.tsx";
import { ViewInLogsLink } from "../../logs/components/LogGroupLink.tsx";
import { logsRoutes } from "@localconsole/core/logs";

export function MonitorTab({ logGroup }: { logGroup: string }) {
  return (
    <LogEvents
      logGroupName={logGroup}
      title='Log events'
      description={`Log group ${logGroup}`}
      filterPlaceholder='Filter events, e.g. ERROR'
      actions={<ViewInLogsLink href={logsRoutes.group(logGroup)} />}
      empty={
        <EmptyState
          title='No log events in this time range'
          description='Invoke the function from the Test tab, or trigger it from S3 or SQS.'
        />
      }
    />
  );
}
