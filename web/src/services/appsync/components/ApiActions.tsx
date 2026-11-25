import { useState } from "react";
import type { GraphqlApi } from "@aws-sdk/client-appsync";
import type { ButtonDropdownProps } from "@cloudscape-design/components/button-dropdown";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useDeleteApi } from "../hooks/useApis.ts";

const DELETE_ACTION = "delete";

// Menu Actions dùng chung cho danh sách (dòng đang chọn) và trang chi tiết
export function useApiActions(api: GraphqlApi | undefined, onDeleted?: () => void) {
  const remove = useDeleteApi();
  const [confirming, setConfirming] = useState(false);
  const label = api?.name ?? "";

  const menuItems: ButtonDropdownProps.Item[] = [
    { id: DELETE_ACTION, text: "Delete", disabled: !api || remove.isPending },
  ];

  const onMenuItemClick = (itemId: string) => {
    if (itemId === DELETE_ACTION) setConfirming(true);
  };

  const confirm = () =>
    remove.mutate(
      api?.apiId ?? "",
      notifyOutcome({
        success: `Deleted ${label}`,
        errorHeader: `Couldn't delete ${label}`,
        then: () => {
          setConfirming(false);
          onDeleted?.();
        },
      }),
    );

  const modal = api && (
    <ConfirmModal
      visible={confirming}
      header={`Delete ${label}?`}
      confirmText={CONFIRM_DELETE}
      actionText='Delete'
      loading={remove.isPending}
      onConfirm={confirm}
      onDismiss={() => setConfirming(false)}
    >
      Deletes the schema, data sources, resolvers, functions and API keys.
    </ConfirmModal>
  );

  return { menuItems, onMenuItemClick, modal };
}
