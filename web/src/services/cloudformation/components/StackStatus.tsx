import Box from "@cloudscape-design/components/box";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { statusGroup } from "../status.ts";
import "./StackStatus.css";

// Chỉ dùng phần tử inline: Header của Cloudscape đặt description trong <p>
export function StackStatus({ status, reason }: { status?: string; reason?: string }) {
  return (
    <span>
      <span className='cfn-nowrap'>
        <StatusIndicator type={statusGroup(status)}>{status}</StatusIndicator>
      </span>
      {reason && (
        <Box variant='small' display='block' color='text-body-secondary'>
          <span className='cfn-reason'>{reason}</span>
        </Box>
      )}
    </span>
  );
}
