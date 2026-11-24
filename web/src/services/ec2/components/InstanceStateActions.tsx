import { useState } from "react";
import type { Instance } from "@aws-sdk/client-ec2";
import Alert from "@cloudscape-design/components/alert";
import type { ButtonDropdownProps } from "@cloudscape-design/components/button-dropdown";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useInstanceAction } from "../hooks/useInstances.ts";
import {
  ACTION_ALLOWED,
  INSTANCE_ACTIONS,
  instanceId,
  stateOf,
  type InstanceAction,
} from "../instances.ts";

interface ActionConfig {
  text: string;
  progress: string; // thông báo thành công: "Stopping i-0a1b…"
  confirm?: { header: (id: string) => string; body: string };
}

const ACTIONS: Record<InstanceAction, ActionConfig> = {
  stop: {
    text: "Stop instance",
    progress: "Stopping",
    confirm: {
      header: (id) => `Stop ${id}?`,
      body: "Floci takes about 30 seconds to stop an instance.",
    },
  },
  start: { text: "Start instance", progress: "Starting" },
  reboot: { text: "Reboot instance", progress: "Rebooting" },
  terminate: {
    text: "Terminate instance",
    progress: "Terminating",
    confirm: {
      header: (id) => `Terminate ${id}?`,
      body: "Floci removes the instance's container and its data. This can't be undone.",
    },
  },
};

const isInstanceAction = (id: string): id is InstanceAction =>
  Object.values<string>(INSTANCE_ACTIONS).includes(id);

// Menu "Instance state" dùng chung cho danh sách (dòng đang chọn) và trang chi tiết
export function useInstanceStateActions(instance: Instance | undefined) {
  const mutation = useInstanceAction();
  const [confirming, setConfirming] = useState<InstanceAction | null>(null);
  const id = instance ? instanceId(instance) : "";
  const state = instance ? stateOf(instance) : "";

  const menuItems: ButtonDropdownProps.Item[] = Object.values(INSTANCE_ACTIONS).map((action) => ({
    id: action,
    text: ACTIONS[action].text,
    disabled: !instance || mutation.isPending || !ACTION_ALLOWED[action](state),
  }));

  const run = (action: InstanceAction) =>
    mutation.mutate(
      { id, action },
      notifyOutcome({
        success: `${ACTIONS[action].progress} ${id}`,
        errorHeader: `Couldn't ${action} ${id}`,
        then: () => setConfirming(null),
      }),
    );

  const onMenuItemClick = (itemId: string) => {
    if (!isInstanceAction(itemId)) return;

    if (ACTIONS[itemId].confirm) setConfirming(itemId);
    else run(itemId);
  };

  const confirm = confirming && ACTIONS[confirming].confirm;
  const modal = instance && confirming && confirm && (
    <ConfirmModal
      visible
      header={confirm.header(id)}
      actionText={ACTIONS[confirming].text}
      loading={mutation.isPending}
      onConfirm={() => run(confirming)}
      onDismiss={() => setConfirming(null)}
    >
      {confirming === INSTANCE_ACTIONS.terminate ? (
        <Alert type='warning'>{confirm.body}</Alert>
      ) : (
        confirm.body
      )}
    </ConfirmModal>
  );

  return { menuItems, onMenuItemClick, modal };
}
