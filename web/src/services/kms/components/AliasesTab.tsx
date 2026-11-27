import { useState } from "react";
import { useSearchParams } from "react-router";
import Alert from "@cloudscape-design/components/alert";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table from "@shared/components/ResponsiveTable.tsx";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { FormInput } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { EmptyState } from "@shared/components/TableStates.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { selectionLabels } from "@shared/tableAriaLabels.ts";
import {
  KEY_MANAGERS,
  aliasesOf,
  keyLabel,
  aliasSchema,
  KEY_TABS,
  SEARCH_PARAMS,
} from "@localconsole/core/kms";
import { useAllAliases, useDeleteAlias, useSaveAlias } from "../hooks/useAliases.ts";
import type { KeyRow } from "../hooks/useKeys.ts";

interface AliasRow {
  name: string;
}

// Chỉ mount khi mở. Tên đã thuộc key khác thì hỏi rồi trỏ alias sang key này (UpdateAlias)
function CreateAliasModal({ keyId, onDismiss }: { keyId: string; onDismiss: () => void }) {
  const aliases = useAllAliases();
  const allAliases = aliases.data ?? [];
  const save = useSaveAlias();
  const [moving, setMoving] = useState<string | null>(null);
  const form = useZodForm(aliasSchema(aliasesOf(allAliases, keyId)), { name: "" });

  const run = (name: string, replace: boolean) =>
    save.mutate(
      { name, keyId, replace },
      notifyOutcome({
        success: `Saved ${name}`,
        errorHeader: "Couldn't save alias",
        then: onDismiss,
      }),
    );

  const submit = form.handleSubmit(({ name }) => {
    const owner = allAliases.find((alias) => alias.AliasName === name)?.TargetKeyId;
    if (owner && owner !== keyId) setMoving(name);
    else run(name, false);
  });

  if (moving) {
    return (
      <ConfirmModal
        visible
        header={`Point ${moving} to this key?`}
        actionText='Point alias'
        loading={save.isPending}
        onConfirm={() => run(moving, true)}
        onDismiss={onDismiss}
      >
        The alias belongs to another key now. Apps using it will use this key instead.
      </ConfirmModal>
    );
  }

  return (
    <FormModal
      header='Create alias'
      actionText='Create alias'
      loading={save.isPending}
      // Chưa có danh sách alias thì chưa biết tên trùng: chặn gửi để không ghi đè alias của key khác
      disabled={!aliases.data}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput
        control={form.control}
        name='name'
        label='Alias name'
        placeholder='alias/orders'
        constraintText='alias/ is added when missing.'
        autoFocus
      />
    </FormModal>
  );
}

export function AliasesTab({ row }: { row: KeyRow }) {
  const keyId = row.meta.KeyId ?? "";
  const customer = row.meta.KeyManager === KEY_MANAGERS.customer;
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<AliasRow[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const deleteAlias = useDeleteAlias();
  const items = row.aliases.map((name) => ({ name }));
  const target = selected[0]?.name ?? "";

  const confirmDelete = () =>
    deleteAlias.mutate(
      target,
      notifyOutcome({
        success: `Deleted ${target}`,
        errorHeader: "Couldn't delete alias",
        then: () => {
          setDeleting(false);
          setSelected([]);
          // Trang đang mở bằng chính alias (hoặc ARN alias) vừa xóa: chuyển sang key ID, không thì báo "not found"
          if (keyLabel(searchParams.get(SEARCH_PARAMS.key) ?? "") === target) {
            setSearchParams({ [SEARCH_PARAMS.key]: keyId, [SEARCH_PARAMS.tab]: KEY_TABS.aliases });
          }
        },
      }),
    );

  const header = (
    <Header
      counter={`(${items.length})`}
      actions={
        customer && (
          <SpaceBetween size='xs' direction='horizontal'>
            <Button disabled={!target} onClick={() => setDeleting(true)}>
              Delete
            </Button>
            <Button onClick={() => setCreating(true)}>Create alias</Button>
          </SpaceBetween>
        )
      }
    >
      Aliases
    </Header>
  );

  return (
    <>
      <Table
        items={items}
        trackBy='name'
        selectionType={customer ? "single" : undefined}
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        ariaLabels={selectionLabels<AliasRow>("alias", (alias) => alias.name)}
        columnDefinitions={[
          { id: "name", header: "Alias", isRowHeader: true, cell: (alias) => alias.name },
        ]}
        header={header}
        empty={<EmptyState title='No aliases' />}
      />
      {creating && <CreateAliasModal keyId={keyId} onDismiss={() => setCreating(false)} />}
      <ConfirmModal
        visible={deleting}
        header={`Delete ${target}?`}
        confirmText={CONFIRM_DELETE}
        actionText='Delete'
        loading={deleteAlias.isPending}
        onConfirm={confirmDelete}
        onDismiss={() => setDeleting(false)}
      >
        <Alert type='warning'>Apps using this alias can't find the key any more.</Alert>
      </ConfirmModal>
    </>
  );
}
