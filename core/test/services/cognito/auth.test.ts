import { createHmac } from "node:crypto";
import type { InitiateAuthResponse } from "@aws-sdk/client-cognito-identity-provider";
import { describe, expect, it } from "vitest";
import {
  decodeJwt,
  hostedUiBlocker,
  hostedUiUrl,
  isExpired,
  secretHash,
  toSignInResult,
} from "#services/cognito/auth.ts";
import { NO_TOKENS_ERROR, unsupportedChallengeError } from "#services/cognito/constants.ts";

const token = (payload: object) =>
  ['{"alg":"RS256"}', JSON.stringify(payload), "sig"]
    .map((part) => Buffer.from(part).toString("base64url"))
    .join(".");

describe("auth", () => {
  it("decodes header and payload, groups and dates", () => {
    const { header, payload } = decodeJwt(
      token({ sub: "u1", exp: 100, "cognito:groups": ["admin"], name: "Ân?>" }),
    );

    expect(header.alg).toBe("RS256");

    expect(payload).toMatchObject({
      sub: "u1",
      exp: 100,
      "cognito:groups": ["admin"],
      name: "Ân?>",
    });

    expect(() => decodeJwt("a.b")).toThrow();
    expect(isExpired(100, 100_001)).toBe(true);
    expect(isExpired(100, 99_000)).toBe(false);
  });

  it("computes SECRET_HASH like AWS", async () => {
    const expected = createHmac("sha256", "s3cr3t")
      .update("an@example.com" + "client1")
      .digest("base64");

    expect(await secretHash("s3cr3t", "an@example.com", "client1")).toBe(expected);
  });

  it("builds the hosted UI URL and blocks when not ready", () => {
    const url = new URL(
      hostedUiUrl({
        baseUrl: "http://localhost:4566",
        clientId: "c1",
        redirectUri: "http://localhost:3000/cb",
        scopes: ["openid", "email"],
        state: "s",
        identityProvider: "Keycloak",
      }),
    );

    expect(url.pathname).toBe("/cognito-idp/oauth2/authorize");

    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "c1",
      response_type: "code",
      redirect_uri: "http://localhost:3000/cb",
      scope: "openid email",
      state: "s",
      identity_provider: "Keycloak",
    });

    expect(
      new URL(
        hostedUiUrl({
          baseUrl: "http://x",
          clientId: "c1",
          redirectUri: "http://y",
          scopes: [],
          state: "s",
        }),
      ).searchParams.has("identity_provider"),
    ).toBe(false);

    expect(hostedUiBlocker({ hasDomain: false, callbackUrls: [], oauthFlows: [] })).toBe(
      "Create a domain on the Identity providers tab first.",
    );

    expect(
      hostedUiBlocker({ hasDomain: true, callbackUrls: ["http://y"], oauthFlows: ["implicit"] }),
    ).toBe("Turn on the authorization code flow for this client first.");

    expect(
      hostedUiBlocker({ hasDomain: true, callbackUrls: ["http://y"], oauthFlows: ["code"] }),
    ).toBeUndefined();
  });
});

describe("toSignInResult", () => {
  const challenge = {
    ChallengeName: "NEW_PASSWORD_REQUIRED",
    Session: "session-1",
  } satisfies InitiateAuthResponse;

  it("returns the tokens when Cognito signs the user in", () => {
    const tokens = { IdToken: "id", AccessToken: "access", RefreshToken: "refresh" };

    expect(toSignInResult({ AuthenticationResult: tokens }, "an@example.com")).toEqual({
      kind: "tokens",
      tokens,
    });
  });

  it("answers NEW_PASSWORD_REQUIRED with USER_ID_FOR_SRP, not the typed email", () => {
    const output = {
      ...challenge,
      ChallengeParameters: { USER_ID_FOR_SRP: "5694e189-719b-477c-9b72-807f280e3725" },
    };

    expect(toSignInResult(output, "an@example.com")).toEqual({
      kind: "newPassword",
      session: "session-1",
      username: "5694e189-719b-477c-9b72-807f280e3725",
    });
  });

  it("falls back to the typed username when USER_ID_FOR_SRP is missing", () => {
    expect(toSignInResult(challenge, "bob")).toEqual({
      kind: "newPassword",
      session: "session-1",
      username: "bob",
    });
  });

  it("rejects other challenges and a challenge without a session", () => {
    expect(() => toSignInResult({ ChallengeName: "SMS_MFA", Session: "s" }, "bob")).toThrow(
      unsupportedChallengeError("SMS_MFA"),
    );

    expect(() => toSignInResult({ ChallengeName: "NEW_PASSWORD_REQUIRED" }, "bob")).toThrow(
      unsupportedChallengeError("NEW_PASSWORD_REQUIRED"),
    );
  });

  it("reports missing tokens when there is neither tokens nor a challenge", () => {
    expect(() => toSignInResult({}, "bob")).toThrow(NO_TOKENS_ERROR);
  });
});
