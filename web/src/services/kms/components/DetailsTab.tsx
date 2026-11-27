import { useState } from "react";
import type { KeyMetadata } from "@aws-sdk/client-kms";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { ConnectCard } from "@shared/components/CodeSamples.tsx";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import { FormInput } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { LIST_SEPARATOR, NOT_AVAILABLE, formatDate } from "@localconsole/core/shared";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { keySample } from "../codeSamples.ts";
import {
  KEY_MANAGERS,
  keyTypeLabel,
  keyUsageLabel,
  descriptionSchema,
} from "@localconsole/core/kms";
import { useUpdateDescription, type KeyRow } from "../hooks/useKeys.ts";
import { KeyStatus } from "./KeyStatus.tsx";

const DETAILS_COLUMNS = 3;

// Chỉ mount khi mở
function EditDescriptionModal({ meta, onDismiss }: { meta: KeyMetadata; onDismiss: () => void }) {
  const update = useUpdateDescription();
  const form = useZodForm(descriptionSchema, { description: meta.Description ?? "" });

  const submit = form.handleSubmit(({ description }) =>
    update.mutate(
      { keyId: meta.KeyId ?? "", description },
      notifyOutcome({
        success: "Updated description",
        errorHeader: "Couldn't update description",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Edit description'
      actionText='Save'
      loading={update.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput control={form.control} name='description' label='Description' autoFocus />
    </FormModal>
  );
}

export function DetailsTab({ row, compact }: { row: KeyRow; compact: boolean }) {
  const [editing, setEditing] = useState(false);
  const { meta } = row;
  const keyId = meta.KeyId ?? "";
  const arn = meta.Arn ?? "";
  const customer = meta.KeyManager === KEY_MANAGERS.customer;
  const algorithms = [
    ...(meta.EncryptionAlgorithms ?? []),
    ...(meta.SigningAlgorithms ?? []),
    ...(meta.MacAlgorithms ?? []),
  ];

  const header = (
    <Header
      variant='h2'
      actions={customer && <Button onClick={() => setEditing(true)}>Edit description</Button>}
    >
      Details
    </Header>
  );

  return (
    <SpaceBetween size='l'>
      <Container header={header}>
        <KeyValuePairs
          columns={compact ? 1 : DETAILS_COLUMNS}
          items={[
            { label: "Key ID", value: <CopyButton variant='inline' text={keyId} label={keyId} /> },
            { label: "ARN", value: <CopyButton variant='inline' text={arn} label={arn} /> },
            { label: "Status", value: <KeyStatus meta={meta} /> },
            { label: "Key type", value: keyTypeLabel(meta) },
            { label: "Key usage", value: keyUsageLabel(meta.KeyUsage) },
            { label: "Algorithms", value: algorithms.join(LIST_SEPARATOR) || NOT_AVAILABLE },
            { label: "Origin", value: meta.Origin ?? NOT_AVAILABLE },
            { label: "Created", value: formatDate(meta.CreationDate) },
            { label: "Description", value: meta.Description || NOT_AVAILABLE },
          ]}
        />
      </Container>
      <ConnectCard sample={keySample(meta, row.aliases[0] ?? keyId)} />
      {editing && <EditDescriptionModal meta={meta} onDismiss={() => setEditing(false)} />}
    </SpaceBetween>
  );
}
