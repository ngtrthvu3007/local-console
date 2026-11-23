import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";

// IdP OIDC giả cho federation của Cognito trên Floci: chỉ node:http + node:crypto, không thêm dependency.
// Trình duyệt mở /authorize qua localhost; Floci gọi /token, /userinfo, /jwks từ trong container
// nên issuer (và iss của id_token) đi qua host.docker.internal.

const LISTEN_HOST = "0.0.0.0";
const HOST_FROM_CONTAINER = "host.docker.internal";
const HOST_FROM_BROWSER = "localhost";
const KEY_ID = "fake-oidc-key";
const SIGNING_ALGORITHM = "RS256";
const RSA_KEY_BITS = 2048;
const TOKEN_LIFETIME_SECONDS = 3600;
const MILLISECONDS_PER_SECOND = 1000;
const FORM_CONTENT_TYPE = "application/x-www-form-urlencoded";
const BEARER_PREFIX = "Bearer ";
const BASIC_PREFIX = "Basic ";

export const FAKE_OIDC_PATHS = {
  discovery: "/.well-known/openid-configuration",
  jwks: "/jwks",
  authorize: "/authorize",
  token: "/token",
  userinfo: "/userinfo",
} as const;

// Một user cố định: đủ để Floci tạo user <Provider>_… với attribute mapping email ← email
export const FAKE_OIDC_USER = {
  sub: "fake-oidc-user",
  email: "federated.user@example.com",
} as const;

type PendingCode = { clientId: string; nonce: string | null };

const base64Url = (input: string | Buffer) => Buffer.from(input).toString("base64url");

const sendJson = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

const readBody = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString();
};

// client_id có thể nằm trong form hoặc header Basic (client_secret_basic)
const basicClientId = (header: string | undefined) => {
  if (!header?.startsWith(BASIC_PREFIX)) return null;
  const [clientId] = Buffer.from(header.slice(BASIC_PREFIX.length), "base64").toString().split(":");
  return decodeURIComponent(clientId);
};

export async function startFakeOidc(): Promise<{
  port: number;
  issuer: string;
  close(): Promise<void>;
}> {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: RSA_KEY_BITS });
  const jwk = {
    ...publicKey.export({ format: "jwk" }),
    kid: KEY_ID,
    alg: SIGNING_ALGORITHM,
    use: "sig",
  };
  const codes = new Map<string, PendingCode>();
  const accessTokens = new Set<string>();
  let issuer = "";
  let port = 0;

  const signIdToken = (claims: Record<string, unknown>) => {
    const header = base64Url(JSON.stringify({ alg: SIGNING_ALGORITHM, typ: "JWT", kid: KEY_ID }));
    const payload = base64Url(JSON.stringify(claims));
    const signature = sign("sha256", Buffer.from(`${header}.${payload}`), privateKey);
    return `${header}.${payload}.${base64Url(signature)}`;
  };

  const authorize = (url: URL, response: ServerResponse) => {
    const redirectUri = url.searchParams.get("redirect_uri");
    if (!redirectUri) return sendJson(response, 400, { error: "invalid_request" });
    const code = randomUUID();
    codes.set(code, {
      clientId: url.searchParams.get("client_id") ?? "",
      nonce: url.searchParams.get("nonce"),
    });
    const target = new URL(redirectUri);
    target.searchParams.set("code", code);
    const state = url.searchParams.get("state");
    if (state !== null) target.searchParams.set("state", state);
    response.writeHead(302, { location: target.toString() });
    response.end();
  };

  const token = async (request: IncomingMessage, response: ServerResponse) => {
    const form = new URLSearchParams(await readBody(request));
    const pending = codes.get(form.get("code") ?? "");
    if (!pending) return sendJson(response, 400, { error: "invalid_grant" });
    codes.delete(form.get("code") ?? "");
    const now = Math.floor(Date.now() / MILLISECONDS_PER_SECOND);
    const accessToken = randomUUID();
    accessTokens.add(accessToken);
    sendJson(response, 200, {
      token_type: "Bearer",
      expires_in: TOKEN_LIFETIME_SECONDS,
      access_token: accessToken,
      id_token: signIdToken({
        ...FAKE_OIDC_USER,
        iss: issuer,
        aud:
          form.get("client_id") ?? basicClientId(request.headers.authorization) ?? pending.clientId,
        iat: now,
        exp: now + TOKEN_LIFETIME_SECONDS,
        ...(pending.nonce !== null && { nonce: pending.nonce }),
      }),
    });
  };

  const userinfo = (request: IncomingMessage, response: ServerResponse) => {
    const header = request.headers.authorization ?? "";
    const isKnownToken =
      header.startsWith(BEARER_PREFIX) && accessTokens.has(header.slice(BEARER_PREFIX.length));
    if (!isKnownToken) return sendJson(response, 401, { error: "invalid_token" });
    sendJson(response, 200, FAKE_OIDC_USER);
  };

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", issuer);
    const route = `${request.method} ${url.pathname}`;
    if (route === `GET ${FAKE_OIDC_PATHS.discovery}`)
      return sendJson(response, 200, {
        issuer,
        authorization_endpoint: `http://${HOST_FROM_BROWSER}:${port}${FAKE_OIDC_PATHS.authorize}`,
        token_endpoint: `${issuer}${FAKE_OIDC_PATHS.token}`,
        userinfo_endpoint: `${issuer}${FAKE_OIDC_PATHS.userinfo}`,
        jwks_uri: `${issuer}${FAKE_OIDC_PATHS.jwks}`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: [SIGNING_ALGORITHM],
        token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
      });
    if (route === `GET ${FAKE_OIDC_PATHS.jwks}`) return sendJson(response, 200, { keys: [jwk] });
    if (route === `GET ${FAKE_OIDC_PATHS.authorize}`) return authorize(url, response);
    if (route === `POST ${FAKE_OIDC_PATHS.token}`) {
      const isForm = request.headers["content-type"]?.startsWith(FORM_CONTENT_TYPE);
      if (!isForm) return sendJson(response, 400, { error: "invalid_request" });
      return token(request, response).catch(() =>
        sendJson(response, 500, { error: "server_error" }),
      );
    }
    if (route === `GET ${FAKE_OIDC_PATHS.userinfo}`) return userinfo(request, response);
    sendJson(response, 404, { error: "not_found" });
  });

  await new Promise<void>((resolve) => server.listen(0, LISTEN_HOST, resolve));
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("Fake OIDC server has no TCP port");
  port = address.port;
  issuer = `http://${HOST_FROM_CONTAINER}:${port}`;

  return {
    port,
    issuer,
    close: () =>
      new Promise<void>((resolve, reject) => {
        // Floci giữ kết nối keep-alive: đóng hẳn để test không treo
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
