import Box from "@cloudscape-design/components/box";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useDeleteDestination } from "../hooks/useConfigurationSets.ts";

interface Props {
  set: string;
  destination: string;
  onDismiss: () => void;
}

// Chỉ mount khi mở. Nằm ở trang, không ở panel: panel bị mount lại khi khung đổi cỡ và sẽ đóng modal
export function DeleteDestinationModal({ set, destination, onDismiss }: Props) {
  const remove = useDeleteDestination(set);
  return (
    <ConfirmModal
      visible
      header='Delete event destination?'
      actionText='Delete'
      loading={remove.isPending}
      onConfirm={() =>
        remove.mutate(
          destination,
          notifyOutcome({
            success: `Deleted destination ${destination}`,
            errorHeader: "Couldn't delete the destination",
            then: onDismiss,
          }),
        )
      }
      onDismiss={onDismiss}
    >
      <Box>
        Events stop going to <b>{destination}</b>.
      </Box>
    </ConfirmModal>
  );
}
