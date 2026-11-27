import type { UserPoolType } from "@aws-sdk/client-cognito-identity-provider";
import { IdentityType } from "@aws-sdk/client-sesv2";
import Alert from "@cloudscape-design/components/alert";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useWatch } from "react-hook-form";
import { FormInput, FormSelect, FormTiles } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { FLOCI_ACCOUNT_ID, errorMessage } from "@localconsole/core/shared";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { notifySuccess } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useIdentities } from "../../ses/hooks/useIdentities.ts";
import { sesRoutes } from "@localconsole/core/ses";
import {
  COGNITO_DEFAULT_SENDER,
  toEmailConfiguration,
  emailFormOf,
  emailSchema,
} from "@localconsole/core/cognito";
import { useUpdateUserPool } from "../hooks/usePools.ts";

interface Props {
  pool: UserPoolType;
  poolId: string;
  onDismiss: () => void;
}

// Chỉ mount khi mở
export function EditEmailModal({ pool, poolId, onDismiss }: Props) {
  const { region } = useLoadedConfig();
  const follow = useFollow();
  const identities = useIdentities();
  const update = useUpdateUserPool(poolId);
  const initial = emailFormOf(pool.EmailConfiguration);
  const form = useZodForm(emailSchema, initial);
  const source = useWatch({ control: form.control, name: "source" });

  const names = (identities.data ?? []).flatMap(({ IdentityName, IdentityType: type }) =>
    type === IdentityType.EMAIL_ADDRESS && IdentityName ? [IdentityName] : [],
  );

  // Identity hiện tại luôn là option (kể cả đã bị xoá) để select không trống
  const options = [...new Set([...(initial.identity ? [initial.identity] : []), ...names])].map(
    (value) => ({ value, label: value }),
  );

  const submit = form.handleSubmit((values) =>
    // ConfigurationSet lấy từ Describe mới nhất, không từ cache
    update.mutate(
      (fresh) => ({
        EmailConfiguration: toEmailConfiguration(
          values,
          region,
          FLOCI_ACCOUNT_ID,
          fresh.EmailConfiguration,
        ),
      }),
      {
        onSuccess: () => {
          notifySuccess("Saved email settings");
          onDismiss();
        },
      },
    ),
  );

  return (
    <FormModal
      header='Edit email'
      actionText='Save'
      loading={update.isPending}
      disabled={source === "ses" && !options.length}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      {update.isError && <Alert type='error'>{errorMessage(update.error)}</Alert>}
      <FormTiles
        control={form.control}
        name='source'
        label='Sending account'
        items={[
          {
            value: "cognito",
            label: "Cognito default",
            description: `Sends from ${COGNITO_DEFAULT_SENDER}.`,
          },
          {
            value: "ses",
            label: "Amazon SES",
            description: "Sends from an email identity in SES.",
          },
        ]}
      />
      {source === "ses" && (
        <SpaceBetween size='m'>
          {options.length ? (
            <FormSelect
              control={form.control}
              name='identity'
              label='SES identity'
              options={options}
            />
          ) : identities.isSuccess ? (
            <Link href={sesRoutes.identities} onFollow={follow}>
              Add an email identity in SES
            </Link>
          ) : null}
          <FormInput
            control={form.control}
            name='from'
            label='From address'
            description='Optional. Name <email>. Defaults to the identity.'
          />
          <FormInput control={form.control} name='replyTo' label='Reply-to address' />
        </SpaceBetween>
      )}
    </FormModal>
  );
}
