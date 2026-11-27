import { describe, expect, it } from "vitest";
import { secretNameOfArn, secretsRoutes } from "#services/secretsmanager/paths.ts";
import {
  createSecretSchema,
  keyValueSchema,
  rotationFormValues,
  rotationSchema,
} from "#services/secretsmanager/schemas.ts";
import { keyValueOf, readableText, textOfKeyValue } from "#services/secretsmanager/secretValue.ts";

const ARN = "arn:aws:secretsmanager:ap-southeast-1:000000000000:secret:app/db-AbC123";

const firstMessage = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

describe("secret routes", () => {
  it("reads the name from a secret ARN, dropping the 6-character suffix", () => {
    expect(secretNameOfArn(ARN)).toBe("app/db");
    expect(secretsRoutes.secretOfArn(ARN)).toBe("/secretsmanager/secrets/detail?name=app%2Fdb");
  });

  it("puts the secret name in the query string", () => {
    expect(secretsRoutes.secret("app/db+x")).toBe(
      "/secretsmanager/secrets/detail?name=app%2Fdb%2Bx",
    );
  });
});

describe("keyValueOf", () => {
  it("offers key/value for a flat JSON object of strings", () => {
    expect(keyValueOf('{"username":"app","password":"x"}')).toEqual([
      { key: "username", value: "app" },
      { key: "password", value: "x" },
    ]);
    expect(keyValueOf("{}")).toEqual([]);
  });

  it("keeps anything else as plaintext only", () => {
    for (const text of [
      '{"port":5432}',
      '{"a":{"b":"c"}}',
      '{"a":null}',
      '{"a":true}',
      "null",
      '["a"]',
      '"text"',
      "plain",
      "",
    ]) {
      expect(keyValueOf(text), text).toBeUndefined();
    }
  });

  it("writes key/value back as a JSON object", () => {
    expect(textOfKeyValue([{ key: "u", value: "a" }])).toBe('{"u":"a"}');
    expect(textOfKeyValue([])).toBe("{}");
  });
});

describe("createSecretSchema", () => {
  const check = (name: string) =>
    createSecretSchema.safeParse({
      type: "plaintext",
      entries: [],
      plaintext: "x",
      name,
      description: "",
      kmsKeyId: "",
    });

  it("accepts the characters Secrets Manager allows", () => {
    expect(check("app/db+x=y.z@w_1-2").success).toBe(true);
    expect(check("a".repeat(512)).success).toBe(true);
  });

  it("takes the default key or a KMS key ARN", () => {
    const base = { type: "plaintext", entries: [], plaintext: "x", name: "a", description: "" };
    const arn = "arn:aws:kms:ap-southeast-1:000000000000:key/k1";
    expect(createSecretSchema.parse({ ...base, kmsKeyId: arn }).kmsKeyId).toBe(arn);
    expect(createSecretSchema.safeParse({ ...base, kmsKeyId: "k1" }).success).toBe(false);
  });

  it("rejects empty, long and other names", () => {
    expect(firstMessage(check(""))).toBe("Enter a secret name.");
    expect(check("a".repeat(513)).success).toBe(false);
    expect(check("a b").success).toBe(false);
  });

  it("checks keys only for key/value secrets", () => {
    const keyValue = (entries: { key: string; value: string }[]) =>
      createSecretSchema.safeParse({
        type: "keyValue",
        entries,
        plaintext: "",
        name: "n",
        description: "",
        kmsKeyId: "",
      });

    expect(keyValue([{ key: "u", value: "a" }]).success).toBe(true);
    expect(firstMessage(keyValue([{ key: "", value: "a" }]))).toBe("Enter a key.");
  });
});

describe("keyValueSchema", () => {
  it("keeps keys exactly as typed, spaces included", () => {
    expect(keyValueSchema.parse({ entries: [{ key: " user ", value: "a" }] }).entries[0]?.key).toBe(
      " user ",
    );
  });

  it("rejects empty and duplicate keys", () => {
    expect(keyValueSchema.safeParse({ entries: [{ key: "a", value: "" }] }).success).toBe(true);
    expect(firstMessage(keyValueSchema.safeParse({ entries: [{ key: " ", value: "" }] }))).toBe(
      "Enter a key.",
    );
    expect(
      firstMessage(
        keyValueSchema.safeParse({
          entries: [
            { key: "a", value: "1" },
            { key: "a", value: "2" },
          ],
        }),
      ),
    ).toBe("Duplicate key.");
  });
});

describe("rotationSchema", () => {
  const base = {
    enabled: true,
    lambdaArn: "arn:aws:lambda:r:0:function:rotate",
    scheduleType: "days" as const,
    days: "30",
    expression: "",
  };
  const parse = (values: Partial<typeof base> | Record<string, unknown>) =>
    rotationSchema.safeParse({ ...base, ...values });

  it("turns days into a rate expression", () => {
    expect(parse({}).data?.scheduleExpression).toBe("rate(30 days)");
  });

  it("rejects days out of range", () => {
    for (const days of ["0", "1001", "x", ""]) expect(parse({ days }).success, days).toBe(false);
  });

  it("keeps a rate or cron expression as typed", () => {
    const cron = "cron(0 12 * * ? *)";
    expect(parse({ scheduleType: "expression", expression: cron }).data?.scheduleExpression).toBe(
      cron,
    );
    expect(parse({ scheduleType: "expression", expression: "every day" }).success).toBe(false);
  });

  it("needs a function only when rotation is on", () => {
    expect(firstMessage(parse({ lambdaArn: "" }))).toBe("Choose a function.");
    expect(parse({ enabled: false, lambdaArn: "", days: "" }).success).toBe(true);
  });
});

describe("rotationFormValues", () => {
  const LAMBDA = "arn:aws:lambda:r:0:function:rotate";

  it("reads a rate in days back into the Days field", () => {
    expect(
      rotationFormValues({
        RotationEnabled: true,
        RotationLambdaARN: LAMBDA,
        RotationRules: { ScheduleExpression: "rate(30 days)" },
      }),
    ).toEqual({
      enabled: true,
      lambdaArn: LAMBDA,
      scheduleType: "days",
      days: "30",
      expression: "",
    });
    expect(rotationFormValues({ RotationRules: { AutomaticallyAfterDays: 7 } }).days).toBe("7");
  });

  it("keeps any other expression as an expression", () => {
    const values = rotationFormValues({
      RotationRules: { ScheduleExpression: "cron(0 12 * * ? *)" },
    });
    expect(values.scheduleType).toBe("expression");
    expect(values.expression).toBe("cron(0 12 * * ? *)");
  });

  it("starts with rotation off and 30 days when nothing is set", () => {
    expect(rotationFormValues({ RotationEnabled: false })).toEqual({
      enabled: false,
      lambdaArn: "",
      scheduleType: "days",
      days: "30",
      expression: "",
    });
  });
});

describe("readableText", () => {
  it("indents one-line JSON such as the rds! secret of RDS", () => {
    expect(readableText('{"host":"172.28.0.2","port":7002}')).toBe(
      '{\n  "host": "172.28.0.2",\n  "port": 7002\n}',
    );
  });

  // Copy chép đúng chữ đang hiện: format mà đổi giá trị thì app nhận sai
  it("keeps the text as stored when formatting would change it", () => {
    for (const text of [
      '{"id":12345678901234567890}',
      '{"a":"1","a":"2"}',
      '{\n    "already": "formatted"\n}',
      "not json",
      "api-key-123",
    ]) {
      expect(readableText(text), text).toBe(text);
    }
  });
});
