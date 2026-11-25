import { useState } from "react";
import Alert from "@cloudscape-design/components/alert";
import type { ButtonDropdownProps } from "@cloudscape-design/components/button-dropdown";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { PENDING_WINDOW_DAYS } from "../constants.ts";
import { useKeyAction, type KeyRow } from "../hooks/useKeys.ts";
import { ACTION_ALLOWED, KEY_ACTIONS, type KeyAction } from "../keys.ts";
import { scheduleDeletionSchema } from "../schemas.ts";

// Floci bỏ qua trạng thái key ở service khác (spec 7 #3): nói trước khi tắt / xóa
const OTHER_SERVICES_NOTE =
  "Secrets, parameters, buckets, queues and other resources keep working with this key on Floci.";

interface ActionConfig {
  text: string;
  done: string; // thông báo thành công: "Disabled 1234…"
  confirm?: { header: (label: string) => string; body: string };
}

const ACTIONS: Record<KeyAction, ActionConfig> = {
  enable: { text: "Enable", done: "Enabled" },
  disable: {
    text: "Disable",
    done: "Disabled",
    confirm: { header: (label) => `Disable ${label}?`, body: OTHER_SERVICES_NOTE },
  },
  scheduleDeletion: {
    text: "Schedule deletion",
    done: "Scheduled deletion of",
    confirm: { header: (label) => `Schedule deletion of ${label}?`, body: OTHER_SERVICES_NOTE },
  },
  cancelDeletion: {
    text: "Cancel deletion",
    done: "Cancelled deletion of",
    confirm: {
      header: (label) => `Cancel deletion of ${label}?`,
      body: "Floci enables the key again; AWS leaves it disabled.",
    },
  },
};

const isKeyAction = (id: string): id is KeyAction =>
  Object.values<string>(KEY_ACTIONS).includes(id);

// Menu Actions dùng chung cho danh sách (dòng đang chọn) và trang chi tiết
export function useKeyActions(row: KeyRow | undefined) {
  const mutation = useKeyAction();
  const [confirming, setConfirming] = useState<KeyAction | null>(null);
  const [days, setDays] = useState(String(PENDING_WINDOW_DAYS.default));
  const [daysError, setDaysError] = useState<string>();
  const keyId = row?.meta.KeyId ?? "";
  const label = row?.aliases[0] ?? keyId;
  const state = row?.meta.KeyState ?? "";

  const menuItems: ButtonDropdownProps.Item[] = Object.values(KEY_ACTIONS).map((action) => ({
    id: action,
    text: ACTIONS[action].text,
    disabled: !row || mutation.isPending || !ACTION_ALLOWED[action](state),
  }));

  const close = () => {
    setConfirming(null);
    setDaysError(undefined);
  };

  const run = (action: KeyAction) => {
    const parsed = scheduleDeletionSchema.safeParse({ days });
    if (action === KEY_ACTIONS.scheduleDeletion && !parsed.success) {
      setDaysError(parsed.error.issues[0]?.message);
      return;
    }

    mutation.mutate(
      { keyId, action, days: parsed.success ? parsed.data.days : undefined },
      notifyOutcome({
        success: `${ACTIONS[action].done} ${label}`,
        errorHeader: `Couldn't ${ACTIONS[action].text.toLowerCase()} ${label}`,
        then: close,
      }),
    );
  };

  const onMenuItemClick = (itemId: string) => {
    if (!isKeyAction(itemId)) return;

    if (ACTIONS[itemId].confirm) setConfirming(itemId);
    else run(itemId);
  };

  const scheduling = confirming === KEY_ACTIONS.scheduleDeletion;
  const confirm = confirming && ACTIONS[confirming].confirm;
  const modal = row && confirming && confirm && (
    <ConfirmModal
      visible
      header={confirm.header(label)}
      confirmText={scheduling ? CONFIRM_DELETE : undefined}
      actionText={ACTIONS[confirming].text}
      loading={mutation.isPending}
      onConfirm={() => run(confirming)}
      onDismiss={close}
    >
      <SpaceBetween size='m'>
        {scheduling && (
          <FormField
            label='Waiting period (days)'
            constraintText={`${PENDING_WINDOW_DAYS.min}–${PENDING_WINDOW_DAYS.max} days.`}
            errorText={daysError}
          >
            <Input type='number' value={days} onChange={({ detail }) => setDays(detail.value)} />
          </FormField>
        )}
        <Alert type='warning'>{confirm.body}</Alert>
      </SpaceBetween>
    </ConfirmModal>
  );

  return { menuItems, onMenuItemClick, modal };
}
