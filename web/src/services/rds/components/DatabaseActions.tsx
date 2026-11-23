import { useState, type ReactNode } from "react";
import type { DBInstance } from "@aws-sdk/client-rds";
import Alert from "@cloudscape-design/components/alert";
import type { ButtonDropdownProps } from "@cloudscape-design/components/button-dropdown";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { CONFIRM_DELETE_DATABASE, DB_STATUSES } from "../constants.ts";
import { DATABASE_ACTIONS, useDatabaseAction, type DatabaseAction } from "../hooks/useDatabases.ts";

interface ActionConfig {
  text: string;
  progress: string; // thông báo thành công: "Stopping app-db"
  allowed: (status: string) => boolean; // giống AWS: khóa action không hợp lệ với status
  confirm?: { header: (id: string) => string; body: (database: DBInstance) => ReactNode };
}

const isAvailable = (status: string) => status === DB_STATUSES.available;

const ACTIONS: Record<DatabaseAction, ActionConfig> = {
  stop: {
    text: "Stop temporarily",
    progress: "Stopping",
    allowed: isAvailable,
    confirm: {
      header: (id) => `Stop ${id} temporarily?`,
      // AWS tự bật lại sau 7 ngày; Floci thì không (spec 7 #4)
      body: () => "Floci stops the container and keeps the data. Start it again from Actions.",
    },
  },
  start: {
    text: "Start",
    progress: "Starting",
    allowed: (status) => status === DB_STATUSES.stopped,
  },
  reboot: {
    text: "Reboot",
    progress: "Rebooting",
    allowed: isAvailable,
    confirm: {
      header: (id) => `Reboot ${id}?`,
      body: () => "The database restarts and open connections are dropped.",
    },
  },
  delete: {
    text: "Delete",
    progress: "Deleting",
    allowed: (status) => status !== DB_STATUSES.deleting,
    confirm: {
      header: (id) => `Delete ${id}?`,
      body: (database) => (
        <Alert type='warning'>
          The database and its data are deleted. This can&apos;t be undone.
          {database.MasterUserSecret &&
            " Its master user secret in Secrets Manager is deleted too."}
        </Alert>
      ),
    },
  },
};

const isDatabaseAction = (id: string): id is DatabaseAction =>
  Object.values<string>(DATABASE_ACTIONS).includes(id);

// Menu Actions dùng chung cho danh sách (dòng đang chọn) và trang chi tiết
export function useDatabaseActions(database: DBInstance | undefined, onDeleted: () => void) {
  const mutation = useDatabaseAction();
  const [confirming, setConfirming] = useState<DatabaseAction | null>(null);
  const id = database?.DBInstanceIdentifier ?? "";
  const status = database?.DBInstanceStatus ?? "";

  const menuItems: ButtonDropdownProps.Item[] = Object.values(DATABASE_ACTIONS).map((action) => ({
    id: action,
    text: ACTIONS[action].text,
    disabled: !database || mutation.isPending || !ACTIONS[action].allowed(status),
  }));

  const run = (action: DatabaseAction) =>
    mutation.mutate(
      { id, action },
      notifyOutcome({
        success: `${ACTIONS[action].progress} ${id}`,
        errorHeader: `Couldn't ${action} ${id}`,
        then: () => {
          setConfirming(null);
          if (action === DATABASE_ACTIONS.delete) onDeleted();
        },
      }),
    );

  const onMenuItemClick = (itemId: string) => {
    if (!isDatabaseAction(itemId)) return;

    if (ACTIONS[itemId].confirm) setConfirming(itemId);
    else run(itemId);
  };

  const confirm = confirming && ACTIONS[confirming].confirm;
  const modal = database && confirming && confirm && (
    <ConfirmModal
      visible
      header={confirm.header(id)}
      confirmText={confirming === DATABASE_ACTIONS.delete ? CONFIRM_DELETE_DATABASE : undefined}
      actionText={ACTIONS[confirming].text}
      loading={mutation.isPending}
      onConfirm={() => run(confirming)}
      onDismiss={() => setConfirming(null)}
    >
      {confirm.body(database)}
    </ConfirmModal>
  );

  return { menuItems, onMenuItemClick, modal };
}
