import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AdminCreateUserCommand,
  CognitoIdentityProviderClient,
  CreateIdentityProviderCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  CreateUserPoolDomainCommand,
  DeleteUserPoolCommand,
  DeleteUserPoolDomainCommand,
  DescribeUserPoolCommand,
  InitiateAuthCommand,
  ListUserPoolsCommand,
  ListUsersCommand,
  RespondToAuthChallengeCommand,
  UpdateUserPoolCommand,
  type CreateUserPoolCommandInput,
  type UserPoolClientType,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  CreateEmailIdentityCommand,
  DeleteEmailIdentityCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { toUpdateUserPoolInput } from "../../core/src/services/cognito/poolUpdate.ts";
import { startFakeOidc } from "./fakeOidc.ts";
import {
  ACCOUNT_ID,
  consoleConfig,
  deleteMails,
  mailbox,
  uniqueName,
  viaConsole,
  waitFor,
} from "./helpers.ts";

// Đúng các luồng của trang Cognito: Test sign-in (NEW_PASSWORD_REQUIRED, SECRET_HASH), gộp UpdateUserPool,
// thư mời qua SES, xóa pool còn domain, đăng nhập federated OIDC qua hosted UI

// Không import cognito/constants.ts: IT chỉ dùng hàm thuần của web, khai báo lại đường hosted UI ở đây
const HOSTED_UI_PATHS = {
  authorize: "/cognito-idp/oauth2/authorize",
  token: "/cognito-idp/oauth2/token",
} as const;
// Giống client mặc định của console (clientFormOf): Test sign-in cần ALLOW_USER_PASSWORD_AUTH
const DEFAULT_CLIENT_AUTH_FLOWS = [
  "ALLOW_USER_PASSWORD_AUTH",
  "ALLOW_USER_SRP_AUTH",
  "ALLOW_REFRESH_TOKEN_AUTH",
] as const;
const TEMPORARY_PASSWORD = "Temp-Passw0rd!";
const NEW_PASSWORD = "Fresh-Passw0rd!";
// Pool đăng nhập bằng email: Floci trả username nội bộ (UUID) trong tham số này, phải gửi lại làm USERNAME
const CHALLENGE_USERNAME_PARAMETER = "USER_ID_FOR_SRP";
const LIST_POOLS_PAGE_SIZE = 60;
// Không fetch callback: chỉ cần code trong URL, cổng 9 (discard) không có app nào nghe
const CALLBACK_URL = "http://localhost:9/callback";
// Tên IdP không có "_" vì username federated là <Provider>_<sub>
const PROVIDER_NAME = "LcFakeOidc";
const IDP_CLIENT = { id: "lc-it-idp-client", secret: "lc-it-idp-secret" } as const;
// authorize → IdP → idpresponse → callback: dư vài bước để không lặp vô hạn khi Floci đổi luồng
const MAX_REDIRECTS = 6;

let region: string;
let flociPublicUrl: string;
let cognito: CognitoIdentityProviderClient;
let ses: SESv2Client;
const poolIds: string[] = [];
const sesIdentities: string[] = [];
const invitedEmails: string[] = [];

async function createPool(input: Omit<CreateUserPoolCommandInput, "PoolName"> = {}) {
  const { UserPool } = await cognito.send(
    new CreateUserPoolCommand({ PoolName: uniqueName("pool"), ...input }),
  );
  poolIds.push(UserPool!.Id!);
  return UserPool!.Id!;
}

async function createClient(poolId: string, generateSecret = false) {
  const { UserPoolClient } = await cognito.send(
    new CreateUserPoolClientCommand({
      UserPoolId: poolId,
      ClientName: uniqueName("client"),
      ExplicitAuthFlows: [...DEFAULT_CLIENT_AUTH_FLOWS],
      GenerateSecret: generateSecret,
    }),
  );
  return UserPoolClient!;
}

// Giống console: SECRET_HASH = Base64(HMAC-SHA256(secret, username + clientId)), tính với đúng USERNAME gửi kèm
const secretHashOf = (client: UserPoolClientType, username: string) =>
  client.ClientSecret
    ? {
        SECRET_HASH: createHmac("sha256", client.ClientSecret)
          .update(username + client.ClientId)
          .digest("base64"),
      }
    : {};

// Luồng của Test sign-in: user mật khẩu tạm gõ email → NEW_PASSWORD_REQUIRED → đặt mật khẩu mới → token
async function signInFirstTime(poolId: string, client: UserPoolClientType) {
  const email = `${uniqueName("user")}@example.com`;
  await cognito.send(
    new AdminCreateUserCommand({
      UserPoolId: poolId,
      Username: email,
      TemporaryPassword: TEMPORARY_PASSWORD,
      MessageAction: "SUPPRESS",
      UserAttributes: [{ Name: "email", Value: email }],
    }),
  );
  const challenge = await cognito.send(
    new InitiateAuthCommand({
      ClientId: client.ClientId,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: {
        USERNAME: email,
        PASSWORD: TEMPORARY_PASSWORD,
        ...secretHashOf(client, email),
      },
    }),
  );
  expect(challenge.ChallengeName).toBe("NEW_PASSWORD_REQUIRED");
  const username = challenge.ChallengeParameters?.[CHALLENGE_USERNAME_PARAMETER];
  expect(username).toBeTruthy();
  const { AuthenticationResult } = await cognito.send(
    new RespondToAuthChallengeCommand({
      ClientId: client.ClientId,
      ChallengeName: "NEW_PASSWORD_REQUIRED",
      Session: challenge.Session,
      ChallengeResponses: {
        USERNAME: username!,
        NEW_PASSWORD: NEW_PASSWORD,
        ...secretHashOf(client, username!),
      },
    }),
  );
  return AuthenticationResult;
}

const jwtPayload = (token: string) =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as Record<string, unknown>;

// Floci từ chối DeleteUserPool khi pool còn domain: xóa domain trước
async function deletePool(poolId: string) {
  const { UserPool } = await cognito.send(new DescribeUserPoolCommand({ UserPoolId: poolId }));
  if (UserPool?.Domain)
    await cognito.send(
      new DeleteUserPoolDomainCommand({ UserPoolId: poolId, Domain: UserPool.Domain }),
    );
  await cognito.send(new DeleteUserPoolCommand({ UserPoolId: poolId }));
}

beforeAll(async () => {
  ({ region, flociPublicUrl } = await consoleConfig());
  cognito = new CognitoIdentityProviderClient(viaConsole(region));
  ses = new SESv2Client(viaConsole(region));
});

afterAll(async () => {
  for (const poolId of poolIds) await deletePool(poolId).catch(() => undefined);
  for (const identity of sesIdentities)
    await ses
      .send(new DeleteEmailIdentityCommand({ EmailIdentity: identity }))
      .catch(() => undefined);
  // Lần chạy bình thường không gọi leftovers: tự xóa thư mời theo người nhận
  await deleteMails(
    (mail) =>
      mail.Destination?.ToAddresses?.some((address) => invitedEmails.includes(address)) ?? false,
  );
});

describe("Cognito user pools through /aws", () => {
  it("signs in with a temporary password and answers NEW_PASSWORD_REQUIRED with USER_ID_FOR_SRP", async () => {
    const poolId = await createPool({ UsernameAttributes: ["email"] });
    const client = await createClient(poolId);

    const tokens = await signInFirstTime(poolId, client);

    expect(tokens?.IdToken).toBeTruthy();
    expect(String(jwtPayload(tokens!.IdToken!).iss)).toMatch(new RegExp(`/${poolId}$`));
  });

  it("signs in with a client secret", async () => {
    const poolId = await createPool({ UsernameAttributes: ["email"] });
    const client = await createClient(poolId, true);
    expect(client.ClientSecret).toBeTruthy();

    const tokens = await signInFirstTime(poolId, client);

    expect(tokens?.IdToken).toBeTruthy();
  });

  it("merged UpdateUserPool keeps EmailConfiguration", async () => {
    const sender = `${uniqueName("sender")}@example.com`;
    await ses.send(new CreateEmailIdentityCommand({ EmailIdentity: sender }));
    sesIdentities.push(sender);
    const emailConfiguration = {
      EmailSendingAccount: "DEVELOPER",
      SourceArn: `arn:aws:ses:${region}:${ACCOUNT_ID}:identity/${sender}`,
      From: sender,
    } as const;
    const poolId = await createPool({ EmailConfiguration: emailConfiguration });
    const preSignUp = `arn:aws:lambda:${region}:${ACCOUNT_ID}:function:${uniqueName("fn")}`;
    const before = await cognito.send(new DescribeUserPoolCommand({ UserPoolId: poolId }));

    await cognito.send(
      new UpdateUserPoolCommand(
        toUpdateUserPoolInput(before.UserPool!, { LambdaConfig: { PreSignUp: preSignUp } }),
      ),
    );

    const { UserPool } = await cognito.send(new DescribeUserPoolCommand({ UserPoolId: poolId }));
    expect(UserPool?.EmailConfiguration).toMatchObject(emailConfiguration);
    expect(UserPool?.LambdaConfig?.PreSignUp).toBe(preSignUp);
  });

  it("invitation email lands in the SES mailbox", async () => {
    const poolId = await createPool({ UsernameAttributes: ["email"] });
    const email = `${uniqueName("invitee")}@example.com`;
    invitedEmails.push(email);

    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: poolId,
        Username: email,
        DesiredDeliveryMediums: ["EMAIL"],
        UserAttributes: [{ Name: "email", Value: email }],
      }),
    );

    const invitation = await waitFor("the invitation in the SES mailbox", async () =>
      (await mailbox()).find((mail) => mail.Destination?.ToAddresses?.includes(email)),
    );
    expect(invitation.Id).toBeTruthy();
  });

  it("deletes a pool that has a domain", async () => {
    const poolId = await createPool();
    await cognito.send(
      new CreateUserPoolDomainCommand({ UserPoolId: poolId, Domain: uniqueName("domain") }),
    );

    await deletePool(poolId);

    const { UserPools = [] } = await cognito.send(
      new ListUserPoolsCommand({ MaxResults: LIST_POOLS_PAGE_SIZE }),
    );
    expect(UserPools.map((pool) => pool.Id)).not.toContain(poolId);
  });

  it("federated OIDC sign-in creates a linked user", async () => {
    const idp = await startFakeOidc();
    try {
      const poolId = await createPool();
      await cognito.send(
        new CreateUserPoolDomainCommand({ UserPoolId: poolId, Domain: uniqueName("domain") }),
      );
      // Trình duyệt mở /authorize qua localhost; Floci gọi token / userinfo / jwks từ container
      await cognito.send(
        new CreateIdentityProviderCommand({
          UserPoolId: poolId,
          ProviderName: PROVIDER_NAME,
          ProviderType: "OIDC",
          ProviderDetails: {
            client_id: IDP_CLIENT.id,
            client_secret: IDP_CLIENT.secret,
            authorize_scopes: "openid email",
            oidc_issuer: idp.issuer,
            authorize_url: `http://localhost:${idp.port}/authorize`,
            token_url: `${idp.issuer}/token`,
            attributes_url: `${idp.issuer}/userinfo`,
            jwks_uri: `${idp.issuer}/jwks`,
            attributes_request_method: "GET",
          },
          AttributeMapping: { email: "email" },
        }),
      );
      const { UserPoolClient } = await cognito.send(
        new CreateUserPoolClientCommand({
          UserPoolId: poolId,
          ClientName: uniqueName("client"),
          AllowedOAuthFlowsUserPoolClient: true,
          AllowedOAuthFlows: ["code"],
          AllowedOAuthScopes: ["openid", "email"],
          CallbackURLs: [CALLBACK_URL],
          SupportedIdentityProviders: [PROVIDER_NAME],
        }),
      );
      const clientId = UserPoolClient!.ClientId!;

      // Đóng vai trình duyệt: theo chuỗi 302 tới callback của app
      let location = `${flociPublicUrl}${HOSTED_UI_PATHS.authorize}?${new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        redirect_uri: CALLBACK_URL,
        scope: "openid email",
        state: uniqueName("state"),
        identity_provider: PROVIDER_NAME,
      })}`;
      for (let hop = 0; hop < MAX_REDIRECTS && !location.startsWith(CALLBACK_URL); hop++) {
        const response = await fetch(location, { redirect: "manual" });
        expect(response.status, `redirect from ${location}`).toBe(302);
        location = new URL(response.headers.get("location")!, location).toString();
      }
      const code = new URL(location).searchParams.get("code");
      expect(location.startsWith(CALLBACK_URL) && code).toBeTruthy();

      const token = await fetch(`${flociPublicUrl}${HOSTED_UI_PATHS.token}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          code: code!,
          redirect_uri: CALLBACK_URL,
        }),
      });
      expect(await token.json()).toHaveProperty("id_token");

      const { Users = [] } = await cognito.send(new ListUsersCommand({ UserPoolId: poolId }));
      const federated = Users.find((user) => user.Username?.startsWith(`${PROVIDER_NAME}_`));
      expect(federated?.UserStatus).toBe("CONFIRMED");
      expect(federated?.Attributes?.map((attribute) => attribute.Name)).toContain("identities");
    } finally {
      await idp.close();
    }
  });
});
