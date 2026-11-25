import StatusIndicator from "@cloudscape-design/components/status-indicator";

// Status của Floci luôn Deployed (spec 7 #1): chỉ hiện bật / tắt
export function DistributionStatus({ enabled }: { enabled?: boolean }) {
  return enabled ? (
    <StatusIndicator type='success'>Enabled</StatusIndicator>
  ) : (
    <StatusIndicator type='stopped'>Disabled</StatusIndicator>
  );
}
