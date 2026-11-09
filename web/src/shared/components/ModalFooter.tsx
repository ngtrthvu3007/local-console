import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";

interface Props {
  actionText: string;
  onAction: () => void;
  onCancel: () => void;
  cancelText?: string;
  disabled?: boolean;
  loading?: boolean;
}

export function ModalFooter({
  actionText,
  onAction,
  onCancel,
  cancelText = "Cancel",
  disabled,
  loading,
}: Props) {
  return (
    <Box float='right'>
      <SpaceBetween direction='horizontal' size='xs'>
        <Button variant='link' onClick={onCancel}>
          {cancelText}
        </Button>
        <Button variant='primary' disabled={disabled} loading={loading} onClick={onAction}>
          {actionText}
        </Button>
      </SpaceBetween>
    </Box>
  );
}
