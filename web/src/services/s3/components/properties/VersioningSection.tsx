import { useState } from "react";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import type { RadioGroupProps } from "@cloudscape-design/components/radio-group";
import StatusIndicator, {
  type StatusIndicatorProps,
} from "@cloudscape-design/components/status-indicator";
import { FormRadioGroup } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { LOADING_PLACEHOLDER } from "@shared/constants.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  VERSIONING_DESCRIPTION,
  VERSIONING_STATUS,
  type VersioningStatus,
} from "../../constants.ts";
import { useSetVersioning, useVersioning } from "../../hooks/useBucketSettings.ts";
import { versioningSchema } from "../../schemas.ts";

const STATUS_TYPES: Record<VersioningStatus, StatusIndicatorProps.Type> = {
  Enabled: "success",
  Suspended: "stopped",
  Disabled: "stopped",
};

const CHOICES: RadioGroupProps.RadioButtonDefinition[] = [
  {
    value: VERSIONING_STATUS.suspended,
    label: "Suspend",
    description: "Existing versions are kept; new writes get no version.",
  },
  { value: VERSIONING_STATUS.enabled, label: "Enable" },
];

interface ModalProps {
  bucket: string;
  status?: VersioningStatus;
  onDismiss: () => void;
}

// Chỉ mount khi mở
function VersioningModal({ bucket, status, onDismiss }: ModalProps) {
  const setVersioning = useSetVersioning(bucket);
  // Bucket đang bật thì mặc định giữ "Enable", còn lại gợi ý "Suspend"
  const form = useZodForm(versioningSchema, {
    status:
      status === VERSIONING_STATUS.enabled
        ? VERSIONING_STATUS.enabled
        : VERSIONING_STATUS.suspended,
  });

  const save = form.handleSubmit(({ status: chosen }) =>
    setVersioning.mutate(
      chosen,
      notifyOutcome({
        success: `Versioning ${chosen.toLowerCase()}`,
        errorHeader: "Couldn't change versioning",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Edit bucket versioning'
      actionText='Save changes'
      loading={setVersioning.isPending}
      onSubmit={save}
      onDismiss={onDismiss}
    >
      <FormRadioGroup control={form.control} name='status' items={CHOICES} />
    </FormModal>
  );
}

export function VersioningSection({ bucket }: { bucket: string }) {
  const versioning = useVersioning(bucket);
  const [editing, setEditing] = useState(false);
  const status = versioning.data;

  const statusValue = status ? (
    <StatusIndicator type={STATUS_TYPES[status]}>{status}</StatusIndicator>
  ) : (
    LOADING_PLACEHOLDER
  );

  const header = (
    <Header
      variant='h2'
      description={VERSIONING_DESCRIPTION}
      actions={<Button onClick={() => setEditing(true)}>Edit</Button>}
    >
      Bucket versioning
    </Header>
  );

  return (
    <Container header={header}>
      <KeyValuePairs items={[{ label: "Status", value: statusValue }]} />
      {editing && (
        <VersioningModal bucket={bucket} status={status} onDismiss={() => setEditing(false)} />
      )}
    </Container>
  );
}
