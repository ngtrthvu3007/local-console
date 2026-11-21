import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAPPING_OPTIONS,
  fromMapping,
  mappingDetails,
  toMappingParams,
} from "../../../src/services/lambda/mappingOptions.ts";
import { editTriggerSchema } from "../../../src/services/lambda/schemas.ts";

const DLQ = "arn:aws:sqs:us-east-1:000000000000:orders-dlq";
const TOPIC = "arn:aws:sns:us-east-1:000000000000:alerts";
const options = (overrides: object) => ({ ...DEFAULT_MAPPING_OPTIONS, ...overrides });

describe("toMappingParams", () => {
  it("always sends Filters so an edit can clear them", () => {
    expect(toMappingParams("sqs", DEFAULT_MAPPING_OPTIONS)).toEqual({
      FilterCriteria: { Filters: [] },
      FunctionResponseTypes: [],
    });
  });

  it("drops blank patterns and keeps the rest in order", () => {
    const params = toMappingParams(
      "sqs",
      options({ filterPatterns: [{ pattern: ' {"a":1} ' }, { pattern: "  " }, { pattern: "{}" }] }),
    );
    expect(params.FilterCriteria?.Filters).toEqual([{ Pattern: '{"a":1}' }, { Pattern: "{}" }]);
  });

  it("asks for partial batch responses on SQS only", () => {
    const on = options({ reportBatchFailures: true });
    expect(toMappingParams("sqs", on).FunctionResponseTypes).toEqual(["ReportBatchItemFailures"]);
    expect(toMappingParams("dynamodb", on)).not.toHaveProperty("FunctionResponseTypes");
  });

  it("sends stream retry, age and an on-failure destination", () => {
    const params = toMappingParams(
      "dynamodb",
      options({
        retryAttempts: "2",
        maxRecordAge: "3600",
        onFailureKind: "sqs",
        onFailureArn: DLQ,
      }),
    );
    expect(params).toMatchObject({
      MaximumRetryAttempts: 2,
      MaximumRecordAgeInSeconds: 3600,
      DestinationConfig: { OnFailure: { Destination: DLQ } },
    });
  });

  it("sends an empty DestinationConfig to remove the destination", () => {
    expect(toMappingParams("dynamodb", DEFAULT_MAPPING_OPTIONS).DestinationConfig).toEqual({});
  });
});

describe("fromMapping", () => {
  it("round-trips what toMappingParams writes", () => {
    const mapping = {
      ...toMappingParams(
        "dynamodb",
        options({
          filterPatterns: [{ pattern: '{"a":1}' }],
          onFailureKind: "sns",
          onFailureArn: TOPIC,
        }),
      ),
    };
    const form = fromMapping(mapping);
    expect(form.onFailureKind).toBe("sns");
    expect(form.onFailureArn).toBe(TOPIC);
    expect(form.filterPatterns).toHaveLength(1);
    expect(JSON.parse(form.filterPatterns[0].pattern)).toEqual({ a: 1 });
  });

  it("falls back to defaults for a mapping made elsewhere", () => {
    expect(fromMapping({})).toEqual(DEFAULT_MAPPING_OPTIONS);
  });
});

describe("mappingDetails", () => {
  it("summarises a SQS trigger", () => {
    expect(
      mappingDetails("sqs", {
        BatchSize: 10,
        FilterCriteria: { Filters: [{ Pattern: "{}" }] },
        FunctionResponseTypes: ["ReportBatchItemFailures"],
      }),
    ).toMatch(/^Batch size 10.*Filter.*Partial batch/);
  });

  it("summarises a stream trigger with retry and destination", () => {
    const text = mappingDetails("dynamodb", {
      BatchSize: 100,
      StartingPosition: "LATEST",
      MaximumRetryAttempts: 2,
      DestinationConfig: { OnFailure: { Destination: DLQ } },
    });
    expect(text).toContain("Retry 2");
    expect(text).toContain("On failure: SQS orders-dlq");
  });

  it("stays short when nothing is set", () => {
    expect(mappingDetails("sqs", { BatchSize: 5 })).toBe("Batch size 5");
  });
});

describe("editTriggerSchema", () => {
  const base = { batchSize: "10", ...DEFAULT_MAPPING_OPTIONS };
  const messageAt = (source: "sqs" | "dynamodb", input: object, path: string) =>
    editTriggerSchema(source)
      .safeParse(input)
      .error?.issues.find((issue) => issue.path.join(".") === path)?.message;

  it("accepts the defaults", () => {
    expect(editTriggerSchema("sqs").safeParse(base).success).toBe(true);
    expect(editTriggerSchema("dynamodb").safeParse(base).success).toBe(true);
  });

  it("rejects a pattern that is not a JSON object", () => {
    const input = { ...base, filterPatterns: [{ pattern: "[1]" }] };
    expect(messageAt("sqs", input, "filterPatterns.0.pattern")).toBeTruthy();
  });

  it("allows at most 5 patterns", () => {
    const input = { ...base, filterPatterns: Array.from({ length: 6 }, () => ({ pattern: "{}" })) };
    expect(messageAt("sqs", input, "filterPatterns")).toMatch(/at most 5/);
  });

  it("checks stream retry, record age and destination", () => {
    expect(
      messageAt("dynamodb", { ...base, retryAttempts: "10001" }, "retryAttempts"),
    ).toBeTruthy();
    expect(
      messageAt("dynamodb", { ...base, retryAttempts: "-1" }, "retryAttempts"),
    ).toBeUndefined();
    expect(messageAt("dynamodb", { ...base, maxRecordAge: "30" }, "maxRecordAge")).toBeTruthy();
    expect(messageAt("dynamodb", { ...base, maxRecordAge: "-1" }, "maxRecordAge")).toBeUndefined();
    expect(messageAt("dynamodb", { ...base, onFailureKind: "sqs" }, "onFailureArn")).toMatch(
      /queue/,
    );
  });

  it("ignores stream fields for SQS", () => {
    expect(editTriggerSchema("sqs").safeParse({ ...base, retryAttempts: "abc" }).success).toBe(
      true,
    );
  });
});
