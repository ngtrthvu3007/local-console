import type { IdentityProviderType } from "@aws-sdk/client-cognito-identity-provider";
import { describe, expect, it } from "vitest";
import {
  emailFormOf,
  emailSchema,
  clientFormOf,
  clientSchema,
  toClientFields,
  createGroupSchema,
  createPoolSchema,
  createUserSchema,
  newPasswordSchema,
  signInSchema,
  toAdminCreateUserInput,
  toCreateGroupInput,
  toCreateUserPoolInput,
  domainSchema,
  providerEditSchema,
  providerFormOf,
  providerSchema,
  toProviderFields,
} from "#services/cognito/schemas.ts";

describe("createPoolSchema", () => {
  it("accepts AWS name characters", () => {
    expect(
      createPoolSchema.safeParse({
        name: "my app+1@x.y",
        signInWith: "email",
        autoVerifyEmail: true,
      }).success,
    ).toBe(true);
  });

  it("rejects empty, too long and other characters", () => {
    for (const name of ["", "a".repeat(129), "my/app", "tên"])
      expect(
        createPoolSchema.safeParse({ name, signInWith: "username", autoVerifyEmail: false })
          .success,
      ).toBe(false);
  });
});

describe("toCreateUserPoolInput", () => {
  it("maps email sign-in and auto-verify", () => {
    expect(
      toCreateUserPoolInput({ name: "p", signInWith: "email", autoVerifyEmail: true }),
    ).toEqual({
      PoolName: "p",
      UsernameAttributes: ["email"],
      AutoVerifiedAttributes: ["email"],
    });

    expect(
      toCreateUserPoolInput({ name: "p", signInWith: "username", autoVerifyEmail: false }),
    ).toEqual({ PoolName: "p" });
  });
});

describe("createUserSchema", () => {
  const base = {
    username: "",
    email: "",
    emailVerified: true,
    phone: "",
    temporaryPassword: "",
    inviteEmail: false,
    inviteSms: false,
  };

  it("requires the right fields by pool type and invitation", () => {
    expect(
      createUserSchema(false).safeParse({ ...base, temporaryPassword: "Passw0rd!" }).success,
    ).toBe(false); // thiếu username

    expect(
      createUserSchema(true).safeParse({ ...base, temporaryPassword: "Passw0rd!" }).success,
    ).toBe(false); // thiếu email

    expect(createUserSchema(true).safeParse({ ...base, email: "an@example.com" }).success).toBe(
      false,
    ); // không mời, không mật khẩu

    expect(
      createUserSchema(true).safeParse({ ...base, email: "an@example.com", inviteSms: true })
        .success,
    ).toBe(false); // SMS thiếu phone

    expect(
      createUserSchema(true).safeParse({
        ...base,
        email: "an@example.com",
        phone: "0901",
        inviteEmail: true,
      }).success,
    ).toBe(false); // phone sai E.164

    expect(
      createUserSchema(true).safeParse({ ...base, email: "an@example.com", inviteEmail: true })
        .success,
    ).toBe(true);
  });

  it("maps to AdminCreateUser", () => {
    expect(
      toAdminCreateUserInput(
        "p",
        { ...base, email: "an@example.com", temporaryPassword: "Passw0rd!" },
        true,
      ),
    ).toEqual({
      UserPoolId: "p",
      Username: "an@example.com",
      TemporaryPassword: "Passw0rd!",
      MessageAction: "SUPPRESS",
      UserAttributes: [
        { Name: "email", Value: "an@example.com" },
        { Name: "email_verified", Value: "true" },
      ],
    });

    expect(
      toAdminCreateUserInput(
        "p",
        { ...base, username: "an", phone: "+84901234567", inviteSms: true },
        false,
      ),
    ).toMatchObject({
      Username: "an",
      DesiredDeliveryMediums: ["SMS"],
      UserAttributes: [{ Name: "phone_number", Value: "+84901234567" }],
    });
  });
});

describe("createGroupSchema", () => {
  const base = { name: "admin", description: "", precedence: "" };

  it("accepts a name with optional description and precedence", () => {
    expect(createGroupSchema.safeParse(base).success).toBe(true);
    expect(createGroupSchema.safeParse({ ...base, precedence: "0" }).success).toBe(true);
  });

  it("rejects bad name, description and precedence", () => {
    expect(createGroupSchema.safeParse({ ...base, name: "" }).success).toBe(false);
    expect(createGroupSchema.safeParse({ ...base, name: "a".repeat(129) }).success).toBe(false);

    expect(createGroupSchema.safeParse({ ...base, description: "a".repeat(2049) }).success).toBe(
      false,
    );

    expect(createGroupSchema.safeParse({ ...base, precedence: "-1" }).success).toBe(false);
    expect(createGroupSchema.safeParse({ ...base, precedence: "1.5" }).success).toBe(false);
  });

  it("maps to CreateGroup without empty fields", () => {
    expect(toCreateGroupInput("p", { name: "admin", description: "", precedence: "10" })).toEqual({
      UserPoolId: "p",
      GroupName: "admin",
      Precedence: 10,
    });
  });
});

describe("clientSchema", () => {
  const form = { ...clientFormOf(), name: "web" };

  it("accepts the default form once it has a name", () => {
    expect(clientSchema.safeParse(form).success).toBe(true);
  });

  it("rejects the code flow without a callback URL", () => {
    expect(
      clientSchema.safeParse({ ...form, oauthFlows: ["code"], callbackUrls: [] }).success,
    ).toBe(false);
  });

  it("rejects a callback URL with no OAuth flow", () => {
    expect(
      clientSchema.safeParse({ ...form, callbackUrls: [{ value: "https://a.test/cb" }] }).success,
    ).toBe(false);
  });

  it("rejects a sign-out URL with no OAuth flow", () => {
    expect(
      clientSchema.safeParse({ ...form, logoutUrls: [{ value: "https://a.test/out" }] }).success,
    ).toBe(false);
  });

  it("accepts no flow and no URLs, and an m2m form without URLs", () => {
    expect(clientSchema.safeParse(form).success).toBe(true);

    expect(
      clientSchema.safeParse({ ...form, oauthFlows: ["client_credentials"], scopes: ["api/read"] })
        .success,
    ).toBe(true);
  });

  it("rejects client_credentials mixed with code, on oauthFlows", () => {
    const result = clientSchema.safeParse({
      ...form,
      oauthFlows: ["client_credentials", "code"],
      callbackUrls: [{ value: "https://a.test/cb" }],
    });

    expect(result.success ? [] : result.error.issues.map((issue) => issue.path[0])).toContain(
      "oauthFlows",
    );
  });

  it("rejects a URL that is not a URL", () => {
    expect(
      clientSchema.safeParse({ ...form, callbackUrls: [{ value: "not a url" }] }).success,
    ).toBe(false);
  });
});

describe("clientFormOf", () => {
  it("defaults to 3 auth flows, 3 scopes, COGNITO and no secret", () => {
    expect(clientFormOf()).toMatchObject({
      authFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
      scopes: ["openid", "email", "profile"],
      providers: ["COGNITO"],
      generateSecret: false,
    });
  });
});

describe("toClientFields", () => {
  it("turns OAuth off and drops flows and scopes without a flow", () => {
    const fields = toClientFields({ ...clientFormOf(), name: "web" });
    expect(fields.AllowedOAuthFlowsUserPoolClient).toBe(false);
    expect(fields).not.toHaveProperty("AllowedOAuthScopes");
    expect(fields).not.toHaveProperty("AllowedOAuthFlows");
  });

  it("turns OAuth on with the code flow", () => {
    const fields = toClientFields({ ...clientFormOf(), name: "web", oauthFlows: ["code"] });

    expect(fields).toMatchObject({
      AllowedOAuthFlowsUserPoolClient: true,
      AllowedOAuthFlows: ["code"],
    });
  });

  it("keeps client_credentials and its scopes through an edit", () => {
    const edited = clientFormOf({
      ClientName: "m2m",
      AllowedOAuthFlows: ["client_credentials"],
      AllowedOAuthScopes: ["api/read"],
      AllowedOAuthFlowsUserPoolClient: true,
    });

    expect(toClientFields(edited)).toMatchObject({
      AllowedOAuthFlows: ["client_credentials"],
      AllowedOAuthScopes: ["api/read"],
    });

    expect(clientSchema.safeParse(edited).success).toBe(true);
  });
});

describe("signInSchema", () => {
  it("rejects an empty client, username or password", () => {
    const filled = { clientId: "6f1n0abc", username: "an@example.com", password: "Passw0rd!" };
    expect(signInSchema.safeParse(filled).success).toBe(true);
    for (const field of ["clientId", "username", "password"])
      expect(signInSchema.safeParse({ ...filled, [field]: "" }).success).toBe(false);
  });
});

describe("newPasswordSchema", () => {
  it("rejects an empty new password", () => {
    expect(newPasswordSchema.safeParse({ newPassword: "" }).success).toBe(false);
    expect(newPasswordSchema.safeParse({ newPassword: "NewPassw0rd!" }).success).toBe(true);
  });
});

describe("emailSchema", () => {
  it("rejects SES without identity and bad reply-to", () => {
    expect(
      emailSchema.safeParse({ source: "ses", identity: "", from: "", replyTo: "" }).success,
    ).toBe(false);

    expect(
      emailSchema.safeParse({ source: "ses", identity: "a@b.c", from: "", replyTo: "x" }).success,
    ).toBe(false);

    expect(
      emailSchema.safeParse({ source: "ses", identity: "a@b.c", from: "", replyTo: "" }).success,
    ).toBe(true);

    expect(emailSchema.safeParse({ source: "cognito" }).success).toBe(true);
  });
});

describe("emailFormOf", () => {
  it("lets a Cognito default pool switch to SES with only an identity", () => {
    expect(
      emailSchema.safeParse({ ...emailFormOf(undefined), source: "ses", identity: "a@b.c" })
        .success,
    ).toBe(true);
  });

  it("reads identity, From and Reply-to of an SES config", () => {
    expect(
      emailFormOf({
        EmailSendingAccount: "DEVELOPER",
        SourceArn: "arn:aws:ses:r:0:identity/a@b.c",
        From: "A <a@b.c>",
        ReplyToEmailAddress: "r@b.c",
      }),
    ).toEqual({ source: "ses", identity: "a@b.c", from: "A <a@b.c>", replyTo: "r@b.c" });
  });
});

describe("domainSchema", () => {
  it("accepts a lowercase prefix with hyphens inside", () => {
    expect(domainSchema.safeParse({ prefix: "my-app-local" }).success).toBe(true);
  });

  it("rejects uppercase, edge hyphens and more than 63 characters", () => {
    for (const prefix of ["My-App", "-a", "a-", "a".repeat(64)])
      expect(domainSchema.safeParse({ prefix }).success).toBe(false);
  });
});

describe("providerSchema", () => {
  const oidc = {
    ...providerFormOf(),
    name: "Keycloak",
    clientId: "local-console",
    clientSecret: "s3cret-value",
    issuer: "http://host.docker.internal:8080/realms/dev",
    authorizeUrl: "http://localhost:8080/realms/dev/auth",
    tokenUrl: "http://host.docker.internal:8080/realms/dev/token",
    attributesUrl: "http://host.docker.internal:8080/realms/dev/userinfo",
    jwksUri: "http://host.docker.internal:8080/realms/dev/certs",
  };

  it("accepts a complete OIDC provider", () => {
    expect(providerSchema.safeParse(oidc).success).toBe(true);
  });

  it("rejects an OIDC name with an underscore or longer than 32 characters", () => {
    for (const name of ["my_idp", "a".repeat(33)])
      expect(providerSchema.safeParse({ ...oidc, name }).success).toBe(false);
  });

  it("rejects an OIDC provider without a token URL", () => {
    expect(providerSchema.safeParse({ ...oidc, tokenUrl: "" }).success).toBe(false);
  });

  it("edit schema accepts an existing name with an underscore but still checks URLs", () => {
    expect(providerEditSchema.safeParse({ ...oidc, name: "my_idp" }).success).toBe(true);
    expect(providerEditSchema.safeParse({ ...oidc, tokenUrl: "" }).success).toBe(false);
  });

  it("accepts Google without a name, issuer or URLs", () => {
    const google = {
      ...providerFormOf(),
      type: "Google",
      clientId: "123.apps.googleusercontent.com",
      clientSecret: "GOCSPX-abc",
    };

    expect(providerSchema.safeParse(google).success).toBe(true);
  });
});

describe("toProviderFields", () => {
  it("maps OIDC with every detail key, GET userinfo and the default email mapping", () => {
    const fields = toProviderFields({
      ...providerFormOf(),
      name: "Keycloak",
      clientId: "local-console",
      clientSecret: "s3cret-value",
      issuer: "http://host.docker.internal:8080",
      authorizeUrl: "http://localhost:8080/authorize",
      tokenUrl: "http://host.docker.internal:8080/token",
      attributesUrl: "http://host.docker.internal:8080/userinfo",
      jwksUri: "http://host.docker.internal:8080/jwks",
    });

    expect(fields).toEqual({
      ProviderName: "Keycloak",
      ProviderType: "OIDC",
      ProviderDetails: {
        client_id: "local-console",
        client_secret: "s3cret-value",
        authorize_scopes: "openid email profile",
        oidc_issuer: "http://host.docker.internal:8080",
        authorize_url: "http://localhost:8080/authorize",
        token_url: "http://host.docker.internal:8080/token",
        attributes_url: "http://host.docker.internal:8080/userinfo",
        jwks_uri: "http://host.docker.internal:8080/jwks",
        attributes_request_method: "GET",
      },
      AttributeMapping: { email: "email" },
    });
  });

  it('names Google "Google" with only 3 detail keys', () => {
    const fields = toProviderFields({
      ...providerFormOf(),
      type: "Google",
      name: "ignored",
      clientId: "g-id",
      clientSecret: "g-secret",
    });

    expect(fields.ProviderName).toBe("Google");

    expect(fields.ProviderDetails).toEqual({
      client_id: "g-id",
      client_secret: "g-secret",
      authorize_scopes: "openid email profile",
    });
  });
});

describe("providerFormOf", () => {
  it("lets a new form switch to Google with only a client ID and secret", () => {
    expect(
      providerSchema.safeParse({
        ...providerFormOf(undefined),
        type: "Google",
        clientId: "g-id",
        clientSecret: "g-secret",
      }).success,
    ).toBe(true);
  });

  it("reads an existing provider back, secret included", () => {
    const form = providerFormOf({
      ProviderName: "Keycloak",
      ProviderType: "OIDC",
      ProviderDetails: {
        client_id: "c",
        client_secret: "s",
        authorize_scopes: "openid",
        oidc_issuer: "http://i",
        authorize_url: "http://a",
        token_url: "http://t",
        attributes_url: "http://u",
        jwks_uri: "http://j",
      },
      AttributeMapping: { email: "mail", name: "name" },
    });

    expect(form).toEqual({
      type: "OIDC",
      name: "Keycloak",
      clientId: "c",
      clientSecret: "s",
      scopes: "openid",
      issuer: "http://i",
      authorizeUrl: "http://a",
      tokenUrl: "http://t",
      attributesUrl: "http://u",
      jwksUri: "http://j",
      attributesRequestMethod: "GET",
      mapping: [
        { poolAttribute: "email", idpClaim: "mail" },
        { poolAttribute: "name", idpClaim: "name" },
      ],
    });
  });

  it("keeps the attributes request method through edit", () => {
    const provider: IdentityProviderType = {
      ProviderName: "Keycloak",
      ProviderType: "OIDC",
      ProviderDetails: {
        client_id: "c",
        client_secret: "s",
        authorize_scopes: "openid",
        oidc_issuer: "http://i",
        authorize_url: "http://a",
        token_url: "http://t",
        attributes_url: "http://u",
        jwks_uri: "http://j",
        attributes_request_method: "POST",
      },
    };

    expect(
      toProviderFields(providerFormOf(provider)).ProviderDetails.attributes_request_method,
    ).toBe("POST");
  });
});
