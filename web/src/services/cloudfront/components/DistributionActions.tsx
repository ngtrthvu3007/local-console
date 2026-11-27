import { useState } from "react";
import type { ButtonDropdownProps } from "@cloudscape-design/components/button-dropdown";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { withEnabled } from "@localconsole/core/cloudfront";
import { useDeleteDistribution, useUpdateDistribution } from "../hooks/useDistributions.ts";

const ACTIONS = { enable: "enable", disable: "disable", delete: "delete" } as const;
type DistributionAction = (typeof ACTIONS)[keyof typeof ACTIONS];

const isAction = (id: string): id is DistributionAction =>
  Object.values<string>(ACTIONS).includes(id);

export interface ActionTarget {
  id: string;
  enabled: boolean;
}

// Menu Actions dùng chung cho danh sách (dòng đang chọn) và trang chi tiết (như EC2).
// CloudFront chỉ xóa distribution đã tắt: khóa Delete kèm lý do, không gộp "tắt rồi xóa" (user chốt)
export function useDistributionActions(target: ActionTarget | undefined, onDeleted?: () => void) {
  const id = target?.id ?? "";
  const update = useUpdateDistribution(id);
  const remove = useDeleteDistribution();
  const [confirming, setConfirming] = useState<DistributionAction | null>(null);
  const busy = update.isPending || remove.isPending;

  const menuItems: ButtonDropdownProps.Item[] = [
    { id: ACTIONS.enable, text: "Enable", disabled: !target || busy || target.enabled },
    { id: ACTIONS.disable, text: "Disable", disabled: !target || busy || !target.enabled },
    {
      id: ACTIONS.delete,
      text: "Delete",
      disabled: !target || busy || target.enabled,
      disabledReason: target?.enabled
        ? "Disable the distribution first. CloudFront only deletes disabled distributions."
        : undefined,
    },
  ];

  const close = () => setConfirming(null);

  const setEnabled = (enabled: boolean) =>
    update.mutate(
      (config) => withEnabled(config, enabled),
      notifyOutcome({
        success: `${enabled ? "Enabled" : "Disabled"} ${id}`,
        errorHeader: `Couldn't ${enabled ? "enable" : "disable"} ${id}`,
        then: close,
      }),
    );

  const deleteDistribution = () =>
    remove.mutate(
      id,
      notifyOutcome({
        success: `Deleted ${id}`,
        errorHeader: `Couldn't delete ${id}`,
        then: () => {
          close();
          onDeleted?.();
        },
      }),
    );

  const onMenuItemClick = (itemId: string) => {
    if (!isAction(itemId)) return;

    if (itemId === ACTIONS.enable) setEnabled(true);
    else setConfirming(itemId);
  };

  const modal = target && confirming === ACTIONS.disable && (
    <ConfirmModal
      visible
      header={`Disable ${id}?`}
      actionText='Disable'
      loading={update.isPending}
      onConfirm={() => setEnabled(false)}
      onDismiss={close}
    >
      The local URL answers 404 until you enable it again.
    </ConfirmModal>
  );

  const deleteModal = target && confirming === ACTIONS.delete && (
    <ConfirmModal
      visible
      header={`Delete ${id}?`}
      confirmText={CONFIRM_DELETE}
      actionText='Delete'
      loading={remove.isPending}
      onConfirm={deleteDistribution}
      onDismiss={close}
    />
  );

  return { menuItems, onMenuItemClick, modal: modal || deleteModal };
}
