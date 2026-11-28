import Alert from "@cloudscape-design/components/alert";
import { BulkActionModal } from "@shared/components/BulkActionModal.tsx";
import { pluralize } from "@localconsole/core/shared";
import type { RuleRow } from "@localconsole/core/eventbridge";
import { useDeleteRules } from "../hooks/useRules.ts";

interface Props {
  rules: readonly RuleRow[];
  onDismiss: () => void;
  onDone: () => void; // gọi khi thành công, thay cho onDismiss
}

// Chỉ mount khi mở
export function DeleteRulesModal({ rules, onDismiss, onDone }: Props) {
  const deleteRules = useDeleteRules();
  const lostTargets = rules.reduce((total, rule) => total + rule.targets, 0);

  return (
    <BulkActionModal
      mutation={deleteRules}
      items={rules}
      lines={rules.map((rule) => `${rule.name} (${pluralize(rule.targets, "target")})`)}
      noun='rule'
      onDismiss={onDismiss}
      onDone={onDone}
    >
      {lostTargets > 0 && (
        <Alert type='warning'>{pluralize(lostTargets, "target")} are removed with the rules.</Alert>
      )}
    </BulkActionModal>
  );
}
