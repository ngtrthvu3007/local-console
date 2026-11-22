import { useMemo } from "react";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { isNotFoundError, proxyEndpoint } from "@shared/aws.ts";
import { AWS_TEST_CREDENTIALS } from "@shared/constants.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";

// Mọi query của Cognito nằm dưới key gốc này
export const COGNITO_QUERY_ROOT = "cognito";
const USER_NOT_FOUND_ERROR = "UserNotFoundException";

export const isCognitoMissing = (error: unknown) =>
  isNotFoundError(error) || (error instanceof Error && error.name === USER_NOT_FOUND_ERROR);

export function useCognito() {
  const config = useLoadedConfig();
  return useMemo(
    () =>
      new CognitoIdentityProviderClient({
        region: config.region,
        credentials: AWS_TEST_CREDENTIALS,
        endpoint: proxyEndpoint(),
      }),
    [config],
  );
}
