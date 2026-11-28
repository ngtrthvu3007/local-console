import type { KeyMetadata } from "@aws-sdk/client-kms";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { DETAIL_SEPARATOR, NOT_AVAILABLE, formatDate } from "@localconsole/core/shared";
import { KEY_STATES } from "@localconsole/core/kms";
import { KEY_STATE_STYLES, OTHER_STATE_TYPE } from "../constants.ts";

export function KeyStatus({ meta }: { meta: KeyMetadata }) {
  const state = meta.KeyState;
  if (!state) return <>{NOT_AVAILABLE}</>;

  const style = KEY_STATE_STYLES[state];
  // Chờ xóa thì kèm ngày xóa, như AWS
  const deletion =
    state === KEY_STATES.pendingDeletion && meta.DeletionDate
      ? `${DETAIL_SEPARATOR}${formatDate(meta.DeletionDate)}`
      : "";

  return (
    <StatusIndicator type={style?.type ?? OTHER_STATE_TYPE}>
      {(style?.label ?? state) + deletion}
    </StatusIndicator>
  );
}
