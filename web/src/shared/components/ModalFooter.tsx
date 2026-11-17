import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import Button from "@cloudscape-design/components/button";

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
    <ResponsiveActions footer>
      <Button variant='link' onClick={onCancel}>
        {cancelText}
      </Button>
      <Button variant='primary' disabled={disabled} loading={loading} onClick={onAction}>
        {actionText}
      </Button>
    </ResponsiveActions>
  );
}
