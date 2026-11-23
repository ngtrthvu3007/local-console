import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import {
  AuthFlowType,
  ChallengeNameType,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  type AuthenticationResultType,
  type UserPoolClientType,
} from "@aws-sdk/client-cognito-identity-provider";
import { secretHash, toSignInResult, type SignInResult } from "../auth.ts";
import { NO_TOKENS_ERROR } from "../constants.ts";
import { COGNITO_QUERY_ROOT, useCognito } from "./useCognito.ts";

type SignInInput = { client: UserPoolClientType; username: string; password: string };
type NewPasswordInput = {
  client: UserPoolClientType;
  username: string;
  session: string;
  newPassword: string;
};

// Client có secret: SECRET_HASH phải tính với đúng USERNAME gửi kèm
async function secretHashParameter(
  client: UserPoolClientType,
  username: string,
): Promise<Record<string, string>> {
  if (!client.ClientSecret || !client.ClientId) return {};
  return { SECRET_HASH: await secretHash(client.ClientSecret, username, client.ClientId) };
}

export function useSignIn(): UseMutationResult<SignInResult, Error, SignInInput> {
  const cognito = useCognito();
  return useMutation({
    mutationFn: async ({ client, username, password }: SignInInput): Promise<SignInResult> => {
      const result = await cognito.send(
        new InitiateAuthCommand({
          ClientId: client.ClientId,
          AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
          AuthParameters: {
            USERNAME: username,
            PASSWORD: password,
            ...(await secretHashParameter(client, username)),
          },
        }),
      );
      return toSignInResult(result, username);
    },
  });
}

export function useRespondNewPassword(): UseMutationResult<
  AuthenticationResultType,
  Error,
  NewPasswordInput
> {
  const cognito = useCognito();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ client, username, session, newPassword }: NewPasswordInput) => {
      const { AuthenticationResult } = await cognito.send(
        new RespondToAuthChallengeCommand({
          ClientId: client.ClientId,
          ChallengeName: ChallengeNameType.NEW_PASSWORD_REQUIRED,
          Session: session,
          ChallengeResponses: {
            USERNAME: username,
            NEW_PASSWORD: newPassword,
            ...(await secretHashParameter(client, username)),
          },
        }),
      );
      if (!AuthenticationResult) throw new Error(NO_TOKENS_ERROR);
      return AuthenticationResult;
    },
    // User vừa đổi từ FORCE_CHANGE_PASSWORD sang CONFIRMED: làm mới danh sách / chi tiết user đang mở
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [COGNITO_QUERY_ROOT] }),
  });
}
