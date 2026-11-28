import { useMemo } from "react";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { createCognitoService } from "@localconsole/core/cognito";
import { useAwsClient } from "@shared/aws.ts";

// Mọi query của Cognito nằm dưới key gốc này
export const COGNITO_QUERY_ROOT = "cognito";

export function useCognitoService() {
  const cognito = useAwsClient(CognitoIdentityProviderClient);

  return useMemo(() => createCognitoService(cognito), [cognito]);
}
