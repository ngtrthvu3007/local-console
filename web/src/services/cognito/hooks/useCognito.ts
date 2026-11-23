import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { isNotFoundError, useAwsClient } from "@shared/aws.ts";

// Mọi query của Cognito nằm dưới key gốc này
export const COGNITO_QUERY_ROOT = "cognito";
const USER_NOT_FOUND_ERROR = "UserNotFoundException";

export const isCognitoMissing = (error: unknown) =>
  isNotFoundError(error) || (error instanceof Error && error.name === USER_NOT_FOUND_ERROR);

export const useCognito = () => useAwsClient(CognitoIdentityProviderClient);
