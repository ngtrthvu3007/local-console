import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { DELETE_PREVIEW_COUNT } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { useUserActions, type UserAction } from "../hooks/useUsers.ts";

const ACTION_COPY: Record<
  UserAction,
  { header: string; verb: string; done: string; description: string }
> = {
  confirm: {
    header: "Confirm sign-up",
    verb: "Confirm",
    done: "Confirmed",
    description: "Marks the user as confirmed so they can sign in.",
  },
  enable: {
    header: "Enable",
    verb: "Enable",
    done: "Enabled",
    description: "Lets the user sign in again.",
  },
  disable: {
    header: "Disable",
    verb: "Disable",
    done: "Disabled",
    description: "The user can't sign in until you enable them again.",
  },
  resetPassword: {
    header: "Reset password",
    verb: "Reset",
    done: "Reset password of",
    description:
      "The user is moved to RESET_REQUIRED and must use forgot password; the code arrives in the SES mailbox. Floci 2.4.0 doesn't email a code at this step.",
  },
  signOut: {
    header: "Sign out everywhere",
    verb: "Sign out",
    done: "Signed out",
    description: "Revokes the user's refresh and access tokens.",
  },
  delete: {
    header: "Delete",
    verb: "Delete",
    done: "Deleted",
    description: "",
  },
};

interface Props {
  poolId: string;
  action: UserAction;
  usernames: readonly string[];
  // Tên hiển thị của từng username (email pool: username là UUID)
  labelOf?: (username: string) => string;
  onDismiss: () => void;
  onDone: () => void; // gọi khi thành công, thay cho onDismiss
}

// Chỉ mount khi mở
export function UserActionModal({ poolId, action, usernames, labelOf, onDismiss, onDone }: Props) {
  const userActions = useUserActions(poolId);
  const copy = ACTION_COPY[action];
  const isDelete = action === "delete";
  const hiddenCount = usernames.length - DELETE_PREVIEW_COUNT;

  const submit = () =>
    userActions.mutate(
      { action, usernames: [...usernames] },
      notifyBulkOutcome({
        success: (result) => `${copy.done} ${pluralize(result.count, "user")}`,
        errorHeader: `Couldn't ${copy.verb.toLowerCase()}`,
        then: onDone,
      }),
    );

  return (
    <ConfirmModal
      visible
      header={isDelete ? `Delete ${pluralize(usernames.length, "user")}` : copy.header}
      confirmText={isDelete ? CONFIRM_DELETE : undefined}
      actionText={copy.verb}
      loading={userActions.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      <Box>
        {usernames.slice(0, DELETE_PREVIEW_COUNT).map((username) => (
          <div key={username}>{labelOf?.(username) ?? username}</div>
        ))}
        {hiddenCount > 0 && <Box color='text-body-secondary'>…and {hiddenCount} more</Box>}
      </Box>
      {isDelete ? (
        <Alert type='warning'>The users and their group memberships are deleted.</Alert>
      ) : (
        <Box color='text-body-secondary'>{copy.description}</Box>
      )}
    </ConfirmModal>
  );
}
