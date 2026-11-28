import { describe, expect, it } from "vitest";
import { API_TYPES } from "#services/apigateway/apis.ts";
import {
  apiSchema,
  authorizerSchema,
  methodSchema,
  resourceSchema,
  routeSchema,
  stageSchema,
  type AuthorizerForm,
  type MethodForm,
  type RouteForm,
} from "#services/apigateway/schemas.ts";

const firstMessage = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

const FUNCTION_ARN = "arn:aws:lambda:us-east-1:000000000000:function:f";

describe("apiSchema", () => {
  const api = { name: "orders", description: "", functionArn: "", grant: true, routeSelection: "" };

  it("needs a route selection expression for WebSocket APIs only", () => {
    expect(apiSchema.safeParse({ ...api, type: API_TYPES.http }).success).toBe(true);
    expect(apiSchema.safeParse({ ...api, type: API_TYPES.websocket }).success).toBe(false);
    expect(
      apiSchema.safeParse({
        ...api,
        type: API_TYPES.websocket,
        routeSelection: "$request.body.action",
      }).success,
    ).toBe(true);
  });

  it("limits names to 1–128 characters", () => {
    expect(apiSchema.safeParse({ ...api, type: API_TYPES.rest, name: " " }).success).toBe(false);
    expect(
      apiSchema.safeParse({ ...api, type: API_TYPES.rest, name: "a".repeat(129) }).success,
    ).toBe(false);
    expect(
      apiSchema.safeParse({ ...api, type: API_TYPES.rest, name: "a".repeat(128) }).success,
    ).toBe(true);
  });
});

describe("resourceSchema", () => {
  const check = (pathPart: string, siblings: string[] = []) =>
    resourceSchema(siblings).safeParse({ pathPart });

  it("accepts plain parts and path variables", () => {
    for (const part of ["items", "v1.2_a-b", "{id}", "{proxy+}"]) {
      expect(check(part).success).toBe(true);
    }
  });

  it("rejects other characters and broken variables", () => {
    for (const part of ["a b", "{}", "{a+}x", "a/b", ""]) {
      expect(check(part).success).toBe(false);
    }
  });

  it("allows one path variable per level, like AWS", () => {
    expect(firstMessage(check("{name}", ["items", "{id}"]))).toBe(
      "This level already has the path variable {id}.",
    );
    expect(check("{name}", ["items"]).success).toBe(true);
    expect(check("orders", ["{id}"]).success).toBe(true);
  });

  it("rejects a sibling that already exists", () => {
    expect(firstMessage(check("items", ["items"]))).toBe("A resource /items already exists.");
  });
});

describe("methodSchema", () => {
  const method: MethodForm = {
    httpMethod: "GET",
    integration: "lambda",
    functionArn: FUNCTION_ARN,
    grant: true,
    url: "",
    authorization: "NONE",
  };

  it("needs a function for a Lambda integration", () => {
    expect(methodSchema.safeParse(method).success).toBe(true);
    expect(firstMessage(methodSchema.safeParse({ ...method, functionArn: "" }))).toBe(
      "Choose a function.",
    );
  });

  it("needs an http(s) URL for an HTTP integration", () => {
    const http = { ...method, integration: "http" as const, functionArn: "" };
    expect(methodSchema.safeParse({ ...http, url: "https://example.com/{proxy}" }).success).toBe(
      true,
    );
    expect(firstMessage(methodSchema.safeParse({ ...http, url: "ftp://x" }))).toBe(
      "Enter a URL that starts with http:// or https://.",
    );
  });

  it("needs nothing more for an integration the console doesn't edit", () => {
    expect(
      methodSchema.safeParse({ ...method, integration: "other", functionArn: "" }).success,
    ).toBe(true);
  });

  it("only takes API Gateway methods", () => {
    expect(methodSchema.safeParse({ ...method, httpMethod: "ANY" }).success).toBe(true);
    expect(methodSchema.safeParse({ ...method, httpMethod: "TRACE" }).success).toBe(false);
  });
});

describe("routeSchema", () => {
  const route: RouteForm = {
    method: "GET",
    path: "/items/{id}",
    isDefault: false,
    routeKey: "",
    integration: "lambda",
    functionArn: FUNCTION_ARN,
    grant: true,
    url: "",
    authorization: "NONE",
    twoWay: false,
  };
  const http = (values: Partial<RouteForm>, keys: string[] = []) =>
    routeSchema(API_TYPES.http, keys).safeParse({ ...route, ...values });
  const webSocket = (values: Partial<RouteForm>, keys: string[] = []) =>
    routeSchema(API_TYPES.websocket, keys).safeParse({ ...route, ...values });

  it("joins method and path into the HTTP route key", () => {
    expect(http({}).data?.routeKey).toBe("GET /items/{id}");
    expect(http({ method: "ANY", path: "/{proxy+}" }).data?.routeKey).toBe("ANY /{proxy+}");
    expect(http({ path: "/" }).data?.routeKey).toBe("GET /");
    expect(http({ isDefault: true, path: "" }).data?.routeKey).toBe("$default");
  });

  it("rejects HTTP paths AWS rejects", () => {
    for (const path of ["items", "/{proxy+}/x", "/a b", "/items/"]) {
      expect(http({ path }).success).toBe(false);
    }
  });

  it("rejects a route key that already exists", () => {
    expect(firstMessage(http({ path: "/items" }, ["GET /items"]))).toBe(
      "Route GET /items already exists.",
    );
    expect(firstMessage(http({ isDefault: true }, ["$default"]))).toBe(
      "Route $default already exists.",
    );
  });

  // Integration WebSocket do IaC tạo (HTTP_PROXY…) bị khóa trong form, vẫn phải lưu được
  it("lets a WebSocket route keep an integration the console doesn't edit", () => {
    expect(webSocket({ routeKey: "ping", integration: "other", functionArn: "" }).success).toBe(
      true,
    );
  });

  it("takes WebSocket route keys as typed, with a Lambda target only", () => {
    expect(webSocket({ routeKey: "sendMessage" }).data?.routeKey).toBe("sendMessage");
    expect(webSocket({ routeKey: "$connect" }).data?.routeKey).toBe("$connect");
    expect(webSocket({ routeKey: "" }).success).toBe(false);
    expect(webSocket({ routeKey: "a".repeat(129) }).success).toBe(false);
    expect(webSocket({ routeKey: "ping", integration: "http", url: "http://x" }).success).toBe(
      false,
    );
    expect(firstMessage(webSocket({ routeKey: "ping" }, ["ping"]))).toBe(
      "Route ping already exists.",
    );
  });
});

describe("authorizerSchema", () => {
  const authorizer: AuthorizerForm = {
    name: "auth2",
    type: "TOKEN",
    functionArn: FUNCTION_ARN,
    grant: true,
    poolId: "",
    issuer: "",
    audience: "",
    identityKind: "header",
    identityNames: "Authorization",
  };
  const rest = (values: Partial<AuthorizerForm>) =>
    authorizerSchema(["auth"]).safeParse({ ...authorizer, ...values });
  const http = (values: Partial<AuthorizerForm>) =>
    authorizerSchema([]).safeParse({ ...authorizer, ...values });

  it("rejects a name another authorizer has", () => {
    expect(rest({}).success).toBe(true);
    expect(firstMessage(rest({ name: "auth" }))).toBe("Authorizer auth already exists.");
  });

  it("needs what each type points at", () => {
    expect(rest({ functionArn: "" }).success).toBe(false);
    expect(rest({ type: "COGNITO_USER_POOLS", functionArn: "" }).success).toBe(false);
    expect(rest({ type: "COGNITO_USER_POOLS", functionArn: "", poolId: "p1" }).success).toBe(true);
    expect(http({ type: "JWT", functionArn: "", issuer: "not a url" }).success).toBe(false);
  });

  it("takes one header for TOKEN, one or more for REQUEST", () => {
    expect(rest({ identityNames: "A, B" }).success).toBe(false);
    expect(rest({ type: "REQUEST", identityNames: "A, B" }).data?.identityNames).toEqual([
      "A",
      "B",
    ]);
    expect(rest({ identityNames: "" }).success).toBe(false);
    expect(rest({ identityNames: "a b" }).success).toBe(false);
  });

  // AWS cho REQUEST authorizer của mọi loại API đọc query string (CDK IdentitySource.queryString)
  it("reads a query string only for REQUEST authorizers", () => {
    const query = { identityKind: "querystring" as const, identityNames: "token" };
    expect(rest({ ...query, type: "REQUEST" }).success).toBe(true);
    expect(http({ ...query, type: "REQUEST" }).success).toBe(true);
    expect(firstMessage(rest({ ...query, type: "TOKEN" }))).toBe(
      "Only REQUEST authorizers read a query string.",
    );
  });

  it("splits the JWT audience", () => {
    const jwt = http({ type: "JWT", functionArn: "", issuer: "https://issuer", audience: "x, y" });
    expect(jwt.data?.audience).toEqual(["x", "y"]);
  });
});

describe("stageSchema", () => {
  it("follows AWS stage names and rejects existing ones", () => {
    const rest = (name: string) => stageSchema(API_TYPES.rest, ["prod"]).safeParse({ name });
    expect(rest("dev").success).toBe(true);
    expect(firstMessage(rest("prod"))).toBe("Stage prod already exists.");
    expect(rest("$default").success).toBe(false);
    expect(rest("a.b").success).toBe(false);
    expect(stageSchema(API_TYPES.http, []).safeParse({ name: "$default" }).success).toBe(true);
  });
});
