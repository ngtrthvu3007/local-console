import { cognitoRoutes } from "@localconsole/core/cognito";
import { SEARCH_PARAMS as SES_SEARCH_PARAMS, sesRoutes } from "@localconsole/core/ses";
import { SEARCH_PARAMS as SNS_SEARCH_PARAMS, snsRoutes } from "@localconsole/core/sns";

export const cognitoBaseCrumbs = [
  { text: "Amazon Cognito", href: cognitoRoutes.pools },
  { text: "User pools", href: cognitoRoutes.pools },
];

export const poolCrumbs = (poolId: string, poolName: string) => [
  ...cognitoBaseCrumbs,
  { text: poolName, href: cognitoRoutes.pool(poolId) },
];

// Mở sẵn Mailbox / hộp thư SMS đã lọc theo người nhận
export const mailboxHref = (email: string) =>
  `${sesRoutes.mailbox}?${new URLSearchParams({ [SES_SEARCH_PARAMS.search]: email })}`;
export const smsHref = (phone: string) =>
  `${snsRoutes.sms}?${new URLSearchParams({ [SNS_SEARCH_PARAMS.phone]: phone })}`;
