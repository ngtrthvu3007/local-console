import Alert from "@cloudscape-design/components/alert";
import type { EmailTemplateMetadata } from "@aws-sdk/client-sesv2";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { DeletePreview } from "@shared/components/DeletePreview.tsx";
import { pluralize } from "@shared/format.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
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

  const submit = () =>
    deleteTemplates.mutate(
      names,
      notifyBulkOutcome({
        success: (result) => `Deleted ${pluralize(result.count, "template")}`,
        errorHeader: "Couldn't delete",
        then: () => onDone(names),
      }),
    );

  return (
    <ConfirmModal
      visible
      header={`Delete ${pluralize(names.length, "template")}?`}
      confirmText={CONFIRM_DELETE}
      actionText='Delete'
      loading={deleteTemplates.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      <DeletePreview lines={names} />
      <Alert type='warning'>Your app can't send with these templates after you delete them.</Alert>
    </ConfirmModal>
  );
}
