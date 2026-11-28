import { z } from "zod";
import type { SelectProps } from "@cloudscape-design/components/select";
import { FormMultiselect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { pluralize } from "@localconsole/core/shared";
import { notifyBulkOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useSetMembership } from "../hooks/useGroups.ts";

const schema = z.object({ selected: z.array(z.string()).min(1, "Choose at least one.") });

interface Props {
  poolId: string;
  header: string; // "Add users" ở trang group, "Add to group" ở trang user; dùng luôn làm chữ nút
  label: string;
  options: SelectProps.Option[]; // chỉ những mục chưa là thành viên; value là giá trị gửi lên API
  noun: string;
  // Chọn user thì cặp là (user, group cố định) và ngược lại
  toPairs: (selected: string[]) => { username: string; group: string }[];
  onDismiss: () => void;
}

// Chỉ mount khi mở
export function AddMembersModal({
  poolId,
  header,
  label,
  options,
  noun,
  toPairs,
  onDismiss,
}: Props) {
  const setMembership = useSetMembership(poolId);
  const form = useZodForm(schema, { selected: [] });

  const submit = form.handleSubmit(({ selected }) =>
    setMembership.mutate(
      { add: true, pairs: toPairs(selected) },
      notifyBulkOutcome({
        success: (result) => `Added ${pluralize(result.count, noun)}`,
        errorHeader: "Couldn't add",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header={header}
      actionText={header}
      loading={setMembership.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormMultiselect
        control={form.control}
        name='selected'
        label={label}
        placeholder={options.length ? "Choose options" : "Nothing left to add"}
        options={options}
      />
    </FormModal>
  );
}
