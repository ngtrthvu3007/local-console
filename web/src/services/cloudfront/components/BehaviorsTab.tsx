import { useState } from "react";
import type { CacheBehavior, Distribution } from "@aws-sdk/client-cloudfront";
import Alert from "@cloudscape-design/components/alert";
import type { ButtonDropdownProps } from "@cloudscape-design/components/button-dropdown";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { ActionBar, type BarAction } from "@shared/components/ActionBar.tsx";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import Table from "@shared/components/ResponsiveTable.tsx";
import { EmptyState } from "@shared/components/TableStates.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { DEFAULT_BEHAVIOR_LABEL, DEFAULT_BEHAVIOR_PATH } from "../constants.ts";
import { behaviorsOf, moveBehavior, withoutBehavior } from "../distributions.ts";
import { useUpdateDistribution } from "../hooks/useDistributions.ts";
import { usePolicyNames } from "../hooks/usePolicyNames.ts";
import { BehaviorModal } from "./BehaviorModal.tsx";

const MENU = { edit: "edit", up: "up", down: "down", delete: "delete" } as const;
type Modal = "create" | typeof MENU.edit | typeof MENU.delete;
// Cấu hình cũ (CDK / CloudFormation còn dùng) thay cho cache policy
const LEGACY_CACHE = "Legacy cache settings";

const pathLabel = (behavior: CacheBehavior) =>
  behavior.PathPattern === DEFAULT_BEHAVIOR_PATH ? DEFAULT_BEHAVIOR_LABEL : behavior.PathPattern;

// Floci nhận cấu hình nhưng không chạy function gắn vào behavior (spec 7 #7)
const hasFunctions = (behavior: CacheBehavior) =>
  Boolean(behavior.FunctionAssociations?.Quantity || behavior.LambdaFunctionAssociations?.Quantity);

export function BehaviorsTab({
  distribution,
  compact,
}: {
  distribution: Distribution;
  compact: boolean;
}) {
  const id = distribution.Id ?? "";
  const config = distribution.DistributionConfig;
  const behaviors = config ? behaviorsOf(config) : [];
  const policies = usePolicyNames().data;
  const update = useUpdateDistribution(id);
  const [selected, setSelected] = useState<CacheBehavior[]>([]);
  const [modal, setModal] = useState<Modal | null>(null);
  // Lấy bản mới nhất của dòng đang chọn sau khi trang tải lại
  const index = behaviors.findIndex(
    (behavior) => behavior.PathPattern === selected[0]?.PathPattern,
  );
  const target = behaviors[index];
  const path = target?.PathPattern ?? "";
  const isDefault = path === DEFAULT_BEHAVIOR_PATH;
  // Behavior phụ đứng trước Default, Default luôn cuối
  const lastExtra = behaviors.length - 2;

  const policyName = (names: Map<string, string> | undefined, policyId?: string) =>
    policyId ? (names?.get(policyId) ?? policyId) : NOT_AVAILABLE;

  const barActions: BarAction[] = [
    { id: "create", text: "Create behavior", primary: true, onClick: () => setModal("create") },
  ];
  // Khóa khi đang lưu: bấm Move hai lần nhanh thì lần sau đọc cấu hình cũ hoặc đổi chỗ hai lần
  const locked = !target || update.isPending;
  const menuItems: ButtonDropdownProps.Item[] = [
    { id: MENU.edit, text: "Edit", disabled: locked },
    { id: MENU.up, text: "Move up", disabled: locked || isDefault || index === 0 },
    { id: MENU.down, text: "Move down", disabled: locked || isDefault || index === lastExtra },
    { id: MENU.delete, text: "Delete", disabled: locked || isDefault },
  ];

  const close = () => setModal(null);
  const save = (change: Parameters<typeof update.mutate>[0], success: string, then?: () => void) =>
    update.mutate(change, notifyOutcome({ success, errorHeader: "Couldn't save behaviors", then }));

  const onMenuItemClick = (itemId: string) => {
    if (itemId === MENU.up || itemId === MENU.down) {
      const offset = itemId === MENU.up ? -1 : 1;
      save((latest) => moveBehavior(latest, path, offset), `Moved ${path}`);
    } else if (itemId === MENU.edit || itemId === MENU.delete) setModal(itemId);
  };

  const confirmDelete = () =>
    save(
      (latest) => withoutBehavior(latest, path),
      `Deleted behavior ${path}`,
      () => {
        close();
        setSelected([]);
      },
    );

  return (
    <SpaceBetween size='l'>
      {behaviors.some(hasFunctions) && (
        <Alert type='info'>
          Floci doesn't run CloudFront Functions or Lambda@Edge attached to these behaviors.
        </Alert>
      )}
      <Table
        items={behaviors}
        trackBy='PathPattern'
        selectionType='single'
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        ariaLabels={selectionLabels<CacheBehavior>(
          "behavior",
          (behavior) => pathLabel(behavior) ?? "",
        )}
        wrapLines={compact}
        header={
          <Header
            counter={`(${behaviors.length})`}
            description="Floci doesn't cache, so cache policies have no effect locally."
            actions={
              <ActionBar
                compact={compact}
                actions={barActions}
                menuItems={menuItems}
                onMenuItemClick={onMenuItemClick}
              />
            }
          >
            Behaviors
          </Header>
        }
        columnDefinitions={[
          {
            id: "precedence",
            header: "Precedence",
            cell: (behavior) => String(behaviors.indexOf(behavior)),
          },
          { id: "path", header: "Path pattern", isRowHeader: true, cell: pathLabel },
          { id: "origin", header: "Origin", cell: (behavior) => behavior.TargetOriginId },
          {
            id: "cache",
            header: "Cache policy",
            cell: (behavior) =>
              behavior.ForwardedValues
                ? LEGACY_CACHE
                : policyName(policies?.cache, behavior.CachePolicyId),
          },
          {
            id: "originRequest",
            header: "Origin request policy",
            cell: (behavior) => policyName(policies?.originRequest, behavior.OriginRequestPolicyId),
          },
          {
            id: "responseHeaders",
            header: "Response headers policy",
            cell: (behavior) =>
              policyName(policies?.responseHeaders, behavior.ResponseHeadersPolicyId),
          },
        ]}
        empty={<EmptyState title='No behaviors' />}
      />
      {config && modal === "create" && (
        <BehaviorModal distributionId={id} config={config} onDismiss={close} />
      )}
      {config && target && modal === MENU.edit && (
        <BehaviorModal distributionId={id} config={config} behavior={target} onDismiss={close} />
      )}
      <ConfirmModal
        visible={Boolean(target) && modal === MENU.delete}
        header={`Delete behavior ${path}?`}
        actionText='Delete'
        loading={update.isPending}
        onConfirm={confirmDelete}
        onDismiss={close}
      />
    </SpaceBetween>
  );
}
