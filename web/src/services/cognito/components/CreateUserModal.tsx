import { useMemo } from "react";
import Alert from "@cloudscape-design/components/alert";
import Button from "@cloudscape-design/components/button";
import { FormCheckbox, FormInput } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { errorMessage, notifySuccess } from "@shared/hooks/useNotify.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useCreateUser } from "../hooks/useUsers.ts";
import { mailboxHref } from "../routes.ts";
import { createUserSchema, type CreateUserForm } from "../schemas.ts";

const INITIAL_VALUES: CreateUserForm = {
  username: "",
  email: "",
  emailVerified: true,
  phone: "",
  temporaryPassword: "",
  inviteEmail: false,
  inviteSms: false,
};

interface Props {
  poolId: string;
  signInWithEmail: boolean;
  onDismiss: () => void;
}

// Chỉ mount khi mở
export function CreateUserModal({ poolId, signInWithEmail, onDismiss }: Props) {
  const follow = useFollow();
  const createUser = useCreateUser(poolId, signInWithEmail);
  const schema = useMemo(() => createUserSchema(signInWithEmail), [signInWithEmail]);
  const form = useZodForm(schema, INITIAL_VALUES);

  const submit = form.handleSubmit((values) =>
    createUser.mutate(values, {
      onSuccess: (user) => {
        notifySuccess(
          `Created user ${user.Username ?? values.email}`,
          values.inviteEmail && (
            <Button href={mailboxHref(values.email)} onFollow={follow}>
              View emails
            </Button>
          ),
        );

        onDismiss();
      },
    }),
  );

  return (
    <FormModal
      header='Create user'
      actionText='Create user'
      loading={createUser.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      {createUser.isError && <Alert type='error'>{errorMessage(createUser.error)}</Alert>}
      {!signInWithEmail && (
        <FormInput control={form.control} name='username' label='Username' autoFocus />
      )}
      <FormInput control={form.control} name='email' label='Email' autoFocus={signInWithEmail} />
      <FormCheckbox control={form.control} name='emailVerified' text='Mark email as verified' />
      <FormInput
        control={form.control}
        name='phone'
        label='Phone number'
        description="Floci doesn't send real SMS. Any number works."
        placeholder='+84901234567'
      />
      <FormInput
        control={form.control}
        name='temporaryPassword'
        label='Temporary password'
        description='The user must set a new password at first sign-in.'
        type='password'
      />
      <FormCheckbox
        control={form.control}
        name='inviteEmail'
        label='Send invitation'
        text='Email'
      />
      <FormCheckbox control={form.control} name='inviteSms' text='SMS' />
    </FormModal>
  );
}
