import Alert from "@cloudscape-design/components/alert";
import type { EmailTemplateMetadata } from "@aws-sdk/client-sesv2";
import { BulkActionModal } from "@shared/components/BulkActionModal.tsx";
import { useDeleteTemplates } from "../hooks/useTemplates.ts";

interface Props {
  templates: readonly EmailTemplateMetadata[];
  onDismiss: () => void;
  onDone: (names: string[]) => void; // gọi khi thành công, thay cho onDismiss
}

// Chỉ mount khi mở
export function DeleteTemplatesModal({ templates, onDismiss, onDone }: Props) {
  const deleteTemplates = useDeleteTemplates();
  const names = templates.flatMap((template) => template.TemplateName ?? []);

  return (
    <BulkActionModal
      mutation={deleteTemplates}
      items={names}
      lines={names}
      noun='template'
      onDismiss={onDismiss}
      onDone={() => onDone(names)}
    >
      <Alert type='warning'>Your app can't send with these templates after you delete them.</Alert>
    </BulkActionModal>
  );
}
