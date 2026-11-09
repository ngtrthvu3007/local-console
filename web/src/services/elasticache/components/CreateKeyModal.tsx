import { FormInput, FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { KEY_TYPE_OPTIONS } from "../constants.ts";
import { useCreateKey } from "../hooks/useRedis.ts";
import { createKeySchema, type CreateKeyForm } from "../schemas.ts";
import { FormValueEditor } from "@shared/components/ValueEditor.tsx";

interface Props {
  cluster: string;
  onDismiss: () => void;
  onCreated: (name: string) => void; // mở key vừa tạo trong panel
}

const INITIAL_VALUES: CreateKeyForm = {
  name: "",
  type: "string",
  field: "",
  value: "",
  score: "",
  ttl: "",
};
const EDITOR_HEIGHT_PX = 160;

// Chỉ mount khi mở. Tạo key với phần tử đầu tiên; thêm tiếp trong panel
export function CreateKeyModal({ cluster, onDismiss, onCreated }: Props) {
  const createKey = useCreateKey(cluster);
  const form = useZodForm(createKeySchema, INITIAL_VALUES);
  const type = form.watch("type");
  const usesMember = type === "set" || type === "zset";

  const submit = form.handleSubmit((values) =>
    createKey.mutate(
      {
        name: values.name,
        type: values.type,
        value: values.value,
        field: type === "hash" ? values.field : undefined,
        score: type === "zset" ? Number(values.score) : undefined,
        ttl: values.ttl,
      },
      notifyOutcome({
        success: `Created key ${values.name}`,
        errorHeader: `Couldn't create ${values.name}`,
        then: () => onCreated(values.name),
      }),
    ),
  );

  return (
    <FormModal
      header='Create key'
      actionText='Create key'
      size='medium'
      loading={createKey.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput
        control={form.control}
        name='name'
        label='Key'
        placeholder='user:1:profile'
        autoFocus
      />
      <FormSelect control={form.control} name='type' label='Type' options={KEY_TYPE_OPTIONS} />
      {type === "hash" && (
        <FormInput control={form.control} name='field' label='Field' placeholder='name' />
      )}
      {usesMember ? (
        <FormInput control={form.control} name='value' label='Member' />
      ) : (
        <FormValueEditor
          // Đổi kiểu thì editor mới, để chọn lại chế độ JSON/chữ theo giá trị
          key={type}
          control={form.control}
          name='value'
          label={type === "list" ? "First element" : "Value"}
          height={EDITOR_HEIGHT_PX}
        />
      )}
      {type === "zset" && (
        <FormInput control={form.control} name='score' label='Score' placeholder='1' />
      )}
      <FormInput
        control={form.control}
        name='ttl'
        label='TTL (seconds)'
        constraintText='Optional. Leave empty for no expiry.'
        placeholder='3600'
      />
    </FormModal>
  );
}
