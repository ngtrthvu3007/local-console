import {
  AuthFlowType,
  ChallengeNameType,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  type CognitoIdentityProviderClient,
  type UserPoolClientType,
} from "@aws-sdk/client-cognito-identity-provider";
import { secretHash, toSignInResult, type SignInResult } from "#services/cognito/auth.ts";
import { NO_TOKENS_ERROR } from "#services/cognito/constants.ts";

export interface SignInInput {
  client: UserPoolClientType;
  username: string;
  password: string;
}

export interface NewPasswordInput {
  client: UserPoolClientType;
  username: string;
  session: string;
  newPassword: string;
}

// Client có secret: SECRET_HASH phải tính với đúng USERNAME gửi kèm
async function secretHashParameter(
  client: UserPoolClientType,
  username: string,
): Promise<Record<string, string>> {
  if (!client.ClientSecret || !client.ClientId) return {};
  return { SECRET_HASH: await secretHash(client.ClientSecret, username, client.ClientId) };
}

export async function signIn(
  cognito: CognitoIdentityProviderClient,
  { client, username, password }: SignInInput,
): Promise<SignInResult> {
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
}

export async function respondNewPassword(
  cognito: CognitoIdentityProviderClient,
  { client, username, session, newPassword }: NewPasswordInput,
) {
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
}
