import Box from "@cloudscape-design/components/box";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import type { ApiRow } from "@localconsole/core/apigateway";
import { useDeleteApi } from "../hooks/useApis.ts";

interface Props {
  api: ApiRow;
  onDismiss: () => void;
  onDone: () => void; // gọi khi thành công, thay cho onDismiss
}

// Chỉ mount khi mở
export function DeleteApiModal({ api, onDismiss, onDone }: Props) {
  const deleteApi = useDeleteApi();

  const submit = () =>
    deleteApi.mutate(
      { version: api.version, apiId: api.id },
      notifyOutcome({
        success: `Deleted API ${api.name}`,
        errorHeader: "Couldn't delete",
        then: onDone,
      }),
    );

  return (
    <ConfirmModal
      visible
      header='Delete API?'
      confirmText={CONFIRM_DELETE}
      actionText='Delete'
      loading={deleteApi.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      <Box>
        {api.name} ({api.id})
      </Box>
    </ConfirmModal>
  );
}
