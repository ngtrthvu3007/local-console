import Toggle from "@cloudscape-design/components/toggle";
import { FormInput } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useSetUserPassword } from "../hooks/useUsers.ts";
import { setPasswordSchema, type SetPasswordForm } from "@localconsole/core/cognito";

const INITIAL_VALUES: SetPasswordForm = { password: "", permanent: true };

interface Props {
  poolId: string;
  username: string;
  label: string; // tên hiển thị trong thông báo
  onDismiss: () => void;
}

// Chỉ mount khi mở
export function SetPasswordModal({ poolId, username, label, onDismiss }: Props) {
  const setPassword = useSetUserPassword(poolId, username);
  const form = useZodForm(setPasswordSchema, INITIAL_VALUES);

  const submit = form.handleSubmit((values) =>
    setPassword.mutate(
      values,
      notifyOutcome({
        success: `Password set for ${label}`,
        errorHeader: `Couldn't set password for ${label}`,
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Set password'
      actionText='Set password'
      loading={setPassword.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput
        control={form.control}
        name='password'
        label='Password'
        type='password'
        autoFocus
      />
      <Toggle
        checked={form.watch("permanent")}
        onChange={({ detail }) => form.setValue("permanent", detail.checked)}
        description='Off: the user must set a new password at next sign-in.'
      >
        Permanent
      </Toggle>
    </FormModal>
  );
}
