import { useState } from "react";
import type { ApiKey } from "@aws-sdk/client-appsync";
import type { ButtonDropdownProps } from "@cloudscape-design/components/button-dropdown";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { ActionBar, type BarAction } from "@shared/components/ActionBar.tsx";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { copyable } from "@shared/components/CopyButton.tsx";
import { FormInput } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import Table from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { MILLISECONDS_PER_SECOND, NOT_AVAILABLE, formatDate } from "@localconsole/core/shared";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import { API_KEY_DAYS, apiKeySchema, isValidKey } from "@localconsole/core/appsync";
import { useApiKeys, useCreateApiKey, useDeleteApiKey } from "../hooks/useApiKeys.ts";

const DELETE_ACTION = "delete";

// Chỉ mount khi mở
function CreateApiKeyModal({ apiId, onDismiss }: { apiId: string; onDismiss: () => void }) {
  const create = useCreateApiKey(apiId);
  const form = useZodForm(apiKeySchema, { description: "", days: String(API_KEY_DAYS.default) });

  const submit = form.handleSubmit((values) =>
    create.mutate(
      values,
      notifyOutcome({
        success: (id) => `Created API key ${id}`,
        errorHeader: "Couldn't create API key",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Create API key'
      actionText='Create API key'
      loading={create.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <SpaceBetween size='m'>
        <FormInput
          control={form.control}
          name='description'
          label='Description - optional'
          autoFocus
        />
        <FormInput
          control={form.control}
          name='days'
          label='Expires in (days)'
          type='number'
          constraintText={`${API_KEY_DAYS.min}–${API_KEY_DAYS.max} days.`}
        />
      </SpaceBetween>
    </FormModal>
  );
}

function ExpiresCell({ apiKey }: { apiKey: ApiKey }) {
  const date = formatDate(new Date((apiKey.expires ?? 0) * MILLISECONDS_PER_SECOND));
  return isValidKey(apiKey, Date.now()) ? (
    <>{date}</>
  ) : (
    <StatusIndicator type='warning'>Expired {date}</StatusIndicator>
  );
}

export function ApiKeysTable({ apiId, compact }: { apiId: string; compact: boolean }) {
  const keys = useApiKeys(apiId);
  const remove = useDeleteApiKey(apiId);
  const [selected, setSelected] = useState<ApiKey[]>([]);
  const [modal, setModal] = useState<"create" | typeof DELETE_ACTION | null>(null);
  const target = selected[0];

  const barActions: BarAction[] = [
    { id: "create", text: "Create API key", primary: true, onClick: () => setModal("create") },
  ];
  const menuItems: ButtonDropdownProps.Item[] = [
    { id: DELETE_ACTION, text: "Delete", disabled: !target || remove.isPending },
  ];

  const confirmDelete = () =>
    remove.mutate(
      target?.id ?? "",
      notifyOutcome({
        success: `Deleted API key ${target?.id}`,
        errorHeader: "Couldn't delete API key",
        then: () => {
          setModal(null);
          setSelected([]);
        },
      }),
    );

  return (
    <>
      <Table
        items={keys.data ?? []}
        trackBy='id'
        selectionType='single'
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        ariaLabels={selectionLabels<ApiKey>("API key", (key) => key.id ?? "")}
        loading={keys.isLoading}
        loadingText='Loading API keys'
        wrapLines={compact}
        header={
          <Header
            counter={keys.data ? `(${keys.data.length})` : undefined}
            actions={
              <ActionBar
                compact={compact}
                actions={barActions}
                menuItems={menuItems}
                onMenuItemClick={(itemId) => itemId === DELETE_ACTION && setModal(DELETE_ACTION)}
              />
            }
          >
            API keys
          </Header>
        }
        columnDefinitions={[
          { id: "id", header: "API key", isRowHeader: true, cell: (key) => copyable(key.id) },
          {
            id: "description",
            header: "Description",
            cell: (key) => key.description || NOT_AVAILABLE,
          },
          { id: "expires", header: "Expires", cell: (key) => <ExpiresCell apiKey={key} /> },
        ]}
        empty={emptyOrError(keys, <EmptyState title='No API keys' />)}
      />
      {modal === "create" && <CreateApiKeyModal apiId={apiId} onDismiss={() => setModal(null)} />}
      <ConfirmModal
        visible={Boolean(target) && modal === DELETE_ACTION}
        header={`Delete API key ${target?.id}?`}
        actionText='Delete'
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onDismiss={() => setModal(null)}
      >
        Apps using this key get 401.
      </ConfirmModal>
    </>
  );
}
