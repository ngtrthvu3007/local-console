import { useMutation, useQueryClient } from "@tanstack/react-query";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { fetchJson } from "@shared/api.ts";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { TerminalBlock } from "@shared/components/TerminalBlock.tsx";
import { FLOCI_PATHS, FLOCI_RESTART_COMMAND } from "@shared/constants.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";

const CONFIRM_RESET = "reset";

// Không resetQueries: nó xóa cả config, Layout tháo trang nên modal mất trước khi kịp báo thành công
function useResetFloci() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => fetchJson(FLOCI_PATHS.reset, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export function ResetFlociModal({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) {
  const reset = useResetFloci();

  const confirm = () =>
    reset.mutate(
      undefined,
      notifyOutcome({
        success: "Reset Floci: all data deleted",
        errorHeader: "Couldn't reset Floci",
        then: onDismiss,
      }),
    );

  return (
    <ConfirmModal
      visible={visible}
      header='Reset all Floci data?'
      confirmText={CONFIRM_RESET}
      actionText='Reset'
      loading={reset.isPending}
      onConfirm={confirm}
      onDismiss={onDismiss}
    >
      <SpaceBetween size='m'>
        <Box>
          Deletes everything in every region: buckets, functions, tables, queues, topics, caches,
          brokers, the SES mailbox and text messages. This can't be undone.
        </Box>
        {/* Floci 2.4.0 dừng container Lambda khi reset nhưng bỏ quên container
            Valkey / RabbitMQ; restart Floci mới dọn (đã kiểm 2026-11-20) */}
        <Alert type='info'>
          <SpaceBetween size='xs'>
            <Box>
              Containers of deleted caches and brokers keep running until Floci restarts. To stop
              them:
            </Box>
            <TerminalBlock code={FLOCI_RESTART_COMMAND} prompt />
          </SpaceBetween>
        </Alert>
      </SpaceBetween>
    </ConfirmModal>
  );
}
