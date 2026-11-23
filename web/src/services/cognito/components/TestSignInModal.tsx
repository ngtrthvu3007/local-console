import { useState } from "react";
import type { AuthenticationResultType } from "@aws-sdk/client-cognito-identity-provider";
import Alert from "@cloudscape-design/components/alert";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormInput, FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { errorMessage } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { USER_PASSWORD_AUTH_ALERT, USER_PASSWORD_AUTH_FLOW } from "../constants.ts";
import { useClients } from "../hooks/useClients.ts";
import type { SignInResult } from "../auth.ts";
import { useRespondNewPassword, useSignIn } from "../hooks/useTestSignIn.ts";
import { cognitoRoutes } from "../routes.ts";
import {
  newPasswordSchema,
  signInSchema,
  type NewPasswordForm,
  type SignInForm,
} from "../schemas.ts";
import { TokenView } from "./TokenView.tsx";

const SIGN_IN_VALUES: SignInForm = { clientId: "", username: "", password: "" };
const NEW_PASSWORD_VALUES: NewPasswordForm = { newPassword: "" };

type NewPasswordChallenge = Extract<SignInResult, { kind: "newPassword" }>;

interface Props {
  poolId: string;
  onDismiss: () => void;
}

// Chỉ mount khi mở. Form sign-in giữ client + username giữa các lần thử
export function TestSignInModal({ poolId, onDismiss }: Props) {
  const follow = useFollow();
  const clients = useClients(poolId);
  const signIn = useSignIn();
  const respond = useRespondNewPassword();
  const signInForm = useZodForm(signInSchema, SIGN_IN_VALUES);
  const newPasswordForm = useZodForm(newPasswordSchema, NEW_PASSWORD_VALUES);
  const [challenge, setChallenge] = useState<NewPasswordChallenge | null>(null);
  const [tokens, setTokens] = useState<AuthenticationResultType | null>(null);

  const clientId = signInForm.watch("clientId");
  const client = clients.data?.find((item) => item.ClientId === clientId);
  const lacksPasswordFlow =
    Boolean(client) && !client?.ExplicitAuthFlows?.includes(USER_PASSWORD_AUTH_FLOW);
  const error = signIn.error ?? respond.error;
  const clientOptions = (clients.data ?? []).flatMap((item) =>
    item.ClientId
      ? [
          {
            value: item.ClientId,
            label: item.ClientName ?? item.ClientId,
            description: item.ClientId,
          },
        ]
      : [],
  );

  const submitSignIn = signInForm.handleSubmit(({ username, password }) => {
    if (!client) return;
    respond.reset();
    setTokens(null);
    signIn.mutate(
      { client, username, password },
      {
        onSuccess: (result) => {
          if (result.kind === "tokens") return setTokens(result.tokens);
          // Form đã unmount vẫn giữ giá trị: xóa để user sau không thấy mật khẩu của user trước
          newPasswordForm.reset();
          setChallenge(result);
        },
      },
    );
  });

  const submitNewPassword = newPasswordForm.handleSubmit(({ newPassword }) => {
    if (!client || !challenge) return;
    respond.mutate(
      { client, username: challenge.username, session: challenge.session, newPassword },
      {
        onSuccess: (result) => {
          setChallenge(null);
          setTokens(result);
        },
        // Session hết hạn / sai thì thử lại vẫn lỗi: về form sign-in (giữ client, username) để lấy session mới
        onError: () => setChallenge(null),
      },
    );
  });

  return (
    <FormModal
      header='Test sign-in'
      actionText={challenge ? "Set new password" : "Sign in"}
      cancelText={tokens ? "Close" : undefined}
      size='large'
      loading={signIn.isPending || respond.isPending}
      disabled={!challenge && lacksPasswordFlow}
      onSubmit={challenge ? submitNewPassword : submitSignIn}
      onDismiss={onDismiss}
    >
      {error && <Alert type='error'>{errorMessage(error)}</Alert>}
      {challenge ? (
        <FormInput
          control={newPasswordForm.control}
          name='newPassword'
          label='New password'
          type='password'
          autoFocus
        />
      ) : (
        <SpaceBetween size='m'>
          <FormSelect
            control={signInForm.control}
            name='clientId'
            label='App client'
            placeholder='Choose an app client'
            empty='No app clients'
            options={clientOptions}
          />
          {lacksPasswordFlow && (
            <Alert type='warning'>
              {USER_PASSWORD_AUTH_ALERT}{" "}
              <Link href={cognitoRoutes.editClient(poolId, clientId)} onFollow={follow}>
                Edit app client
              </Link>
            </Alert>
          )}
          <FormInput control={signInForm.control} name='username' label='Username' />
          <FormInput
            control={signInForm.control}
            name='password'
            label='Password'
            type='password'
          />
        </SpaceBetween>
      )}
      {tokens && <TokenView tokens={tokens} />}
    </FormModal>
  );
}
