import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import type { EmailTemplateMetadata } from "@aws-sdk/client-sesv2";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { DELETE_PREVIEW_COUNT } from "@shared/constants.ts";
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
  const hiddenCount = names.length - DELETE_PREVIEW_COUNT;

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
      <Box>
        {names.slice(0, DELETE_PREVIEW_COUNT).map((name) => (
          <div key={name}>{name}</div>
        ))}
        {hiddenCount > 0 && <Box color='text-body-secondary'>…and {hiddenCount} more</Box>}
      </Box>
      <Alert type='warning'>Your app can't send with these templates after you delete them.</Alert>
    </ConfirmModal>
  );
}
