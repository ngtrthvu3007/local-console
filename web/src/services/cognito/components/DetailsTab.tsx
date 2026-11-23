import { useState } from "react";
import { EmailSendingAccountType, type UserPoolType } from "@aws-sdk/client-cognito-identity-provider";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs, {
  type KeyValuePairsProps,
} from "@cloudscape-design/components/key-value-pairs";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import { ITEM_LIST_WIDTH_PX, NOT_AVAILABLE } from "@shared/constants.ts";
import { formatDate, pluralize } from "@shared/format.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { sesRoutes } from "../../ses/routes.ts";
import { issuerUrl, wellKnownUrl } from "../auth.ts";
import {
  COGNITO_DEFAULT_SENDER,
  DEFAULT_SIGN_IN_LABEL,
  MFA_LABELS,
  SES_IDENTITY_PREFIX,
  WELL_KNOWN_PATHS,
} from "../constants.ts";
import { EditEmailModal } from "./EditEmailModal.tsx";

const GENERAL_COLUMNS = 3;
const PASSWORD_COLUMNS = 3;
const EMAIL_COLUMNS = 2;

const copyable = (text: string) => <CopyButton variant='inline' text={text} label={text} />;
// Không có policy thì không biết giá trị: hiện NOT_AVAILABLE, không bịa "No"
const yesNo = (value?: boolean) => (value ? "Yes" : "No");

export function DetailsTab({ pool }: { pool: UserPoolType }) {
  const { flociPublicUrl, flociInternalUrl } = useLoadedConfig();
  const follow = useFollow();
  // Điện thoại: khối có URL/ARN dài để một cột, giống SQS
  const { ref, compact } = useIsCompact(ITEM_LIST_WIDTH_PX);
  const [editingEmail, setEditingEmail] = useState(false);
  const poolId = pool.Id ?? "";
  const policy = pool.Policies?.PasswordPolicy;

  const generalItems: KeyValuePairsProps.Item[] = [
    { label: "Pool ID", value: copyable(poolId) },
    { label: "ARN", value: pool.Arn ? copyable(pool.Arn) : NOT_AVAILABLE },
    { label: "Sign-in with", value:
        [...(pool.UsernameAttributes ?? []), ...(pool.AliasAttributes ?? [])].join(", ") ||
        DEFAULT_SIGN_IN_LABEL },
    { label: "Auto-verified attributes", value: pool.AutoVerifiedAttributes?.join(", ") || NOT_AVAILABLE },
    { label: "Created", value: formatDate(pool.CreationDate) },
  ];

  // App chạy trên máy dev gọi localhost:4566, app trong cùng compose gọi floci:4566
  const endpointItems: KeyValuePairsProps.Item[] = [
    { label: "Issuer", value: copyable(issuerUrl(flociPublicUrl, poolId)) },
    ...Object.entries({
      "JWKS URL": WELL_KNOWN_PATHS.jwks,
      "OpenID configuration URL": WELL_KNOWN_PATHS.openidConfiguration,
    }).map(([title, path]) => ({
      type: "group" as const,
      title,
      items: [
        {
          label: "From your machine",
          value: copyable(wellKnownUrl(flociPublicUrl, poolId, path)),
        },
        {
          label: "From a container in compose",
          value: copyable(wellKnownUrl(flociInternalUrl, poolId, path)),
        },
      ],
    })),
  ];

  const passwordItems: KeyValuePairsProps.Item[] = [
    { label: "Minimum length", value: policy?.MinimumLength ?? NOT_AVAILABLE },
    { label: "Uppercase letters", value: policy ? yesNo(policy.RequireUppercase) : NOT_AVAILABLE },
    { label: "Lowercase letters", value: policy ? yesNo(policy.RequireLowercase) : NOT_AVAILABLE },
    { label: "Numbers", value: policy ? yesNo(policy.RequireNumbers) : NOT_AVAILABLE },
    { label: "Special characters", value: policy ? yesNo(policy.RequireSymbols) : NOT_AVAILABLE },
    {
      label: "Temporary password validity",
      value:
        policy?.TemporaryPasswordValidityDays === undefined
          ? NOT_AVAILABLE
          : pluralize(policy.TemporaryPasswordValidityDays, "day"),
    },
  ];

  const email = pool.EmailConfiguration;
  const identity = email?.SourceArn?.split(SES_IDENTITY_PREFIX)[1];
  const emailItems: KeyValuePairsProps.Item[] =
    email?.EmailSendingAccount === EmailSendingAccountType.DEVELOPER
      ? [
          {
            label: "SES identity",
            value: identity ? (
              <Link href={sesRoutes.identities} onFollow={follow}>
                {identity}
              </Link>
            ) : (
              NOT_AVAILABLE
            ),
          },
          { label: "From", value: email.From ?? NOT_AVAILABLE },
        ]
      : [
          { label: "Sending account", value: "Cognito default" },
          { label: "From", value: COGNITO_DEFAULT_SENDER },
        ];

  return (
    <div ref={ref}>
      <SpaceBetween size='l'>
        <Container header={<Header variant='h2'>General</Header>}>
          <KeyValuePairs columns={compact ? 1 : GENERAL_COLUMNS} items={generalItems} />
        </Container>
        <Container header={<Header variant='h2'>Endpoints</Header>}>
          <SpaceBetween size='m'>
            <KeyValuePairs columns={1} items={endpointItems} />
            <Box color='text-body-secondary'>
              Tokens carry this issuer even when your app reaches Floci at{" "}
              <code>floci:4566</code>. Verify <code>iss</code> against it and fetch keys from the
              JWKS URL your app can reach.
            </Box>
          </SpaceBetween>
        </Container>
        <Container header={<Header variant='h2'>Password</Header>}>
          <KeyValuePairs columns={compact ? 1 : PASSWORD_COLUMNS} items={passwordItems} />
        </Container>
        <Container header={<Header variant='h2'>MFA</Header>}>
          <KeyValuePairs
            columns={1}
            items={[
              {
                label: "MFA",
                value: pool.MfaConfiguration ? MFA_LABELS[pool.MfaConfiguration] : NOT_AVAILABLE,
              },
            ]}
          />
        </Container>
        <Container
          header={
            <Header variant='h2' actions={<Button onClick={() => setEditingEmail(true)}>Edit</Button>}>
              Email
            </Header>
          }
        >
          <KeyValuePairs columns={compact ? 1 : EMAIL_COLUMNS} items={emailItems} />
        </Container>
      </SpaceBetween>
      {editingEmail && (
        <EditEmailModal pool={pool} poolId={poolId} onDismiss={() => setEditingEmail(false)} />
      )}
    </div>
  );
}
