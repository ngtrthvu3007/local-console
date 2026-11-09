import Box from "@cloudscape-design/components/box";
import type { KeyUpdate } from "@server/routes/redis/contract.ts";
import { FormInput, FormRadioGroup } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useUpdateKey } from "../hooks/useRedis.ts";
import { LIST_ENDS, elementSchemaFor, type CollectionKind, type ElementForm } from "../schemas.ts";
import { FormValueEditor } from "@shared/components/ValueEditor.tsx";

// Phần tử đang sửa; không có = thêm mới
export interface ElementTarget {
  field?: string;
  index?: number;
  member?: string;
  value?: string;
  score?: string;
}

interface Props {
  cluster: string;
  name: string;
  kind: CollectionKind;
  addText: string; // tiêu đề và nút khi thêm mới, dùng chung chữ với nút mở modal
  target?: ElementTarget;
  onDismiss: () => void;
}

const END_ITEMS = [
  { value: LIST_ENDS.tail, label: "End of the list" },
  { value: LIST_ENDS.head, label: "Start of the list" },
];

function editHeader(kind: CollectionKind, target: ElementTarget) {
  if (kind === "list") return `Edit element ${target.index}`;
  if (kind === "zset") return "Edit score";
  return "Edit value";
}

function toUpdate(kind: CollectionKind, form: ElementForm, target?: ElementTarget): KeyUpdate {
  switch (kind) {
    case "hash":
      return target
        ? { operation: "setField", field: target.field!, value: form.value }
        : { operation: "addField", field: form.field, value: form.value };
    case "list":
      return target
        ? { operation: "setIndex", index: target.index!, value: form.value }
        : { operation: "push", value: form.value, end: form.end };
    case "set":
      return { operation: "addMembers", members: [form.member] };
    case "zset":
      return target
        ? { operation: "setScore", member: target.member!, score: Number(form.score) }
        : { operation: "addScoredMember", member: form.member, score: Number(form.score) };
  }
}

// Chỉ mount khi mở. Một form cho mọi kiểu collection; trường hiện theo kiểu
export function ElementModal({ cluster, name, kind, addText, target, onDismiss }: Props) {
  const updateKey = useUpdateKey(cluster, name);
  const editing = Boolean(target);
  const form = useZodForm(elementSchemaFor(kind, editing), {
    field: "",
    member: "",
    value: target?.value ?? "",
    score: target?.score ?? "",
    end: LIST_ENDS.tail,
  });
  const header = target ? editHeader(kind, target) : addText;
  const usesValue = kind === "hash" || kind === "list";
  // Field/member đang sửa là cố định: hiện để biết đang sửa cái nào
  const fixedName = target?.field ?? target?.member;

  const submit = form.handleSubmit((values) =>
    updateKey.mutate(
      toUpdate(kind, values, target),
      notifyOutcome({
        success: `Saved ${name}`,
        errorHeader: `Couldn't save ${name}`,
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header={header}
      actionText={editing ? "Save" : header}
      size={usesValue ? "medium" : "small"}
      loading={updateKey.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      {fixedName !== undefined && <Box variant='strong'>{fixedName}</Box>}
      {!editing && kind === "hash" && (
        <FormInput control={form.control} name='field' label='Field' autoFocus />
      )}
      {!editing && (kind === "set" || kind === "zset") && (
        <FormInput control={form.control} name='member' label='Member' autoFocus />
      )}
      {kind === "zset" && (
        <FormInput control={form.control} name='score' label='Score' autoFocus={editing} />
      )}
      {usesValue && <FormValueEditor control={form.control} name='value' label='Value' />}
      {!editing && kind === "list" && (
        <FormRadioGroup control={form.control} name='end' label='Push to' items={END_ITEMS} />
      )}
    </FormModal>
  );
}
