import { useState } from "react";
import Alert from "@cloudscape-design/components/alert";
import Checkbox from "@cloudscape-design/components/checkbox";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { DeletePreview } from "@shared/components/DeletePreview.tsx";
import { ReferencedWarning } from "@shared/components/ReferencedWarning.tsx";
import { LIST_SEPARATOR } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { useReferencedNames } from "../../s3/hooks/useReferencedNames.ts";
import {
  useCognitoTriggerUses,
  useDeleteFunctions,
  useFunctionsWithTriggers,
  useRotationUses,
  type FunctionToDelete,
} from "../hooks/useFunctions.ts";

interface Props {
  functions: FunctionToDelete[];
  onDismiss: () => void;
  onDone: () => void; // gọi khi thành công, thay cho onDismiss
}

// Chỉ mount khi mở. Floci tự xóa code của function nhưng giữ log group (giống AWS)
export function DeleteFunctionsModal({ functions, onDismiss, onDone }: Props) {
  const deleteFunctions = useDeleteFunctions();
  const [deleteLogGroups, setDeleteLogGroups] = useState(true);
  const [deleteTriggers, setDeleteTriggers] = useState(true);
  const withTriggers = useFunctionsWithTriggers(functions.map((item) => item.name)).data ?? [];
  const referenced = useReferencedNames(functions).data ?? [];
  const cognitoUses = useCognitoTriggerUses(functions).data ?? [];
  const rotationUses = useRotationUses(functions).data ?? [];
  const logGroupLabel =
    functions.length === 1 ? `log group ${functions[0].logGroup}` : "their log groups";

  const submit = () =>
    deleteFunctions.mutate(
      { functions, deleteLogGroups, deleteTriggers: deleteTriggers && withTriggers.length > 0 },
      notifyBulkOutcome({
        success: (result) => `Deleted ${pluralize(result.count, "function")}`,
        errorHeader: "Couldn't delete",
        then: onDone,
      }),
    );

  return (
    <ConfirmModal
      visible
      header={`Delete ${pluralize(functions.length, "function")}?`}
      confirmText={CONFIRM_DELETE}
      actionText='Delete'
      loading={deleteFunctions.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      <DeletePreview lines={functions.map((item) => item.name)} />
      <Checkbox
        checked={deleteLogGroups}
        onChange={({ detail }) => setDeleteLogGroups(detail.checked)}
      >
        Also delete {logGroupLabel}
      </Checkbox>
      {withTriggers.length > 0 && (
        <Checkbox
          checked={deleteTriggers}
          onChange={({ detail }) => setDeleteTriggers(detail.checked)}
        >
          Also delete the queue and stream triggers of {withTriggers.join(LIST_SEPARATOR)}
        </Checkbox>
      )}
      {withTriggers.length > 0 && !deleteTriggers && (
        <Alert type='warning'>
          The triggers stay and point at a deleted function. They run again if a function with the
          same name is created.
        </Alert>
      )}
      <ReferencedWarning names={referenced} />
      {cognitoUses.length > 0 && (
        <Alert type='warning'>
          Cognito user pools call{" "}
          {cognitoUses
            .map(({ poolName, label, fn }) => `${fn} as ${poolName}'s ${label} trigger`)
            .join(LIST_SEPARATOR)}
          . Sign-ups and sign-ins in those pools fail until their triggers are changed.
        </Alert>
      )}
      {rotationUses.length > 0 && (
        <Alert type='warning'>
          Secrets Manager rotates{" "}
          {rotationUses.map(({ secret, fn }) => `${secret} with ${fn}`).join(LIST_SEPARATOR)}. Their
          next rotation fails until the rotation function is changed.
        </Alert>
      )}
      <Alert type='warning'>This can't be undone.</Alert>
    </ConfirmModal>
  );
}
