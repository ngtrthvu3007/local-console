import StatusIndicator from "@cloudscape-design/components/status-indicator";

export function EnabledState({ enabled }: { enabled: boolean }) {
  return (
    <StatusIndicator type={enabled ? "success" : "stopped"}>
      {enabled ? "Enabled" : "Disabled"}
    </StatusIndicator>
  );
}
