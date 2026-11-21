import Alert from "@cloudscape-design/components/alert";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { DeletePreview } from "@shared/components/DeletePreview.tsx";
import { pluralize } from "@shared/format.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { useDeleteRules, type RuleRow } from "../hooks/useRules.ts";

interface Props {
  rules: readonly RuleRow[];
  onDismiss: () => void;
  onDone: () => void; // gọi khi thành công, thay cho onDismiss
}

// Chỉ mount khi mở
export function DeleteRulesModal({ rules, onDismiss, onDone }: Props) {
  const deleteRules = useDeleteRules();
  const lostTargets = rules.reduce((total, rule) => total + rule.targets, 0);

  const submit = () =>
    deleteRules.mutate(
      rules,
      notifyBulkOutcome({
        success: (result) => `Deleted ${pluralize(result.count, "rule")}`,
        errorHeader: "Couldn't delete",
        then: onDone,
      }),
    );

  return (
    <ConfirmModal
      visible
      header={`Delete ${pluralize(rules.length, "rule")}?`}
      confirmText={CONFIRM_DELETE}
      actionText='Delete'
      loading={deleteRules.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      <DeletePreview
        lines={rules.map((rule) => `${rule.name} (${pluralize(rule.targets, "target")})`)}
      />
      {lostTargets > 0 && (
        <Alert type='warning'>{pluralize(lostTargets, "target")} are removed with the rules.</Alert>
      )}
    </ConfirmModal>
  );
}
