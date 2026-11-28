import { useNavigate } from "react-router";
import { FormCheckbox, FormInput, FormTiles } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { SIGN_IN_WITH } from "../constants.ts";
import { useCreateUserPool } from "../hooks/usePools.ts";
import { cognitoRoutes } from "../routes.ts";
import { createPoolSchema, type CreatePoolForm } from "../schemas.ts";

const INITIAL_VALUES: CreatePoolForm = {
  name: "",
  signInWith: SIGN_IN_WITH.username,
  autoVerifyEmail: true,
};

const SIGN_IN_DESCRIPTION = "Can't be changed after the pool is created.";

const SIGN_IN_ITEMS = [
  { value: SIGN_IN_WITH.username, label: "Username" },
  { value: SIGN_IN_WITH.email, label: "Email" },
];

// Chỉ mount khi mở
export function CreatePoolModal({ onDismiss }: { onDismiss: () => void }) {
  const navigate = useNavigate();
  const createPool = useCreateUserPool();
  const form = useZodForm(createPoolSchema, INITIAL_VALUES);

  const submit = form.handleSubmit((values) =>
    createPool.mutate(
      values,
      notifyOutcome({
        success: `Created user pool ${values.name}`,
        errorHeader: `Couldn't create ${values.name}`,
        then: (poolId) => navigate(cognitoRoutes.pool(poolId)),
      }),
    ),
  );

  return (
    <FormModal
      header='Create user pool'
      actionText='Create'
      loading={createPool.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput control={form.control} name='name' label='Name' autoFocus />
      <FormTiles
        control={form.control}
        name='signInWith'
        label='Sign-in with'
        description={SIGN_IN_DESCRIPTION}
        items={SIGN_IN_ITEMS}
      />
      <FormCheckbox control={form.control} name='autoVerifyEmail' text='Auto-verify email' />
    </FormModal>
  );
}
