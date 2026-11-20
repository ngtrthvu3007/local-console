import { describe, expect, it } from "vitest";
import type { NotificationConfiguration } from "@aws-sdk/client-s3";
import {
  overlappingRule,
  toNotificationConfiguration,
  toNotificationRules,
  type NotificationRule,
} from "../../../src/services/s3/notificationRules.ts";

const LAMBDA_ARN = "arn:aws:lambda:ap-southeast-1:000000000000:function:resize";
const QUEUE_ARN = "arn:aws:sqs:ap-southeast-1:000000000000:uploads";
const TOPIC_ARN = "arn:aws:sns:ap-southeast-1:000000000000:alerts";

describe("toNotificationRules", () => {
  it("returns no rules for a bucket without notifications", () => {
    expect(toNotificationRules()).toEqual([]);
    expect(toNotificationRules({})).toEqual([]);
  });

  it("merges the three S3 lists into one list", () => {
    // S3 trả tên filter viết hoa ("Prefix"), console ghi chữ thường: phải đọc được cả hai
    const configuration: NotificationConfiguration = {
      LambdaFunctionConfigurations: [
        {
          Id: "resize",
          LambdaFunctionArn: LAMBDA_ARN,
          Events: ["s3:ObjectCreated:*"],
          Filter: {
            Key: {
              FilterRules: [
                { Name: "Prefix", Value: "images/" },
                { Name: "Suffix", Value: ".png" },
              ],
            },
          },
        },
      ],
      QueueConfigurations: [{ QueueArn: QUEUE_ARN, Events: ["s3:ObjectRemoved:*"] }],
      TopicConfigurations: [{ Id: "alert", TopicArn: TOPIC_ARN, Events: [] }],
    };
    expect(toNotificationRules(configuration)).toEqual([
      {
        id: "resize",
        destination: "lambda",
        arn: LAMBDA_ARN,
        events: ["s3:ObjectCreated:*"],
        prefix: "images/",
        suffix: ".png",
      },
      {
        id: "",
        destination: "sqs",
        arn: QUEUE_ARN,
        events: ["s3:ObjectRemoved:*"],
        prefix: undefined,
        suffix: undefined,
      },
      {
        id: "alert",
        destination: "sns",
        arn: TOPIC_ARN,
        events: [],
        prefix: undefined,
        suffix: undefined,
      },
    ]);
  });
});

describe("toNotificationConfiguration", () => {
  const rule = (overrides: Partial<NotificationRule>): NotificationRule => ({
    id: "",
    destination: "lambda",
    arn: LAMBDA_ARN,
    events: ["s3:ObjectCreated:*"],
    ...overrides,
  });

  it("splits rules back into the three S3 lists", () => {
    const configuration = toNotificationConfiguration([
      rule({ id: "resize", prefix: "images/", suffix: ".png" }),
      rule({ destination: "sqs", arn: QUEUE_ARN }),
    ]);
    expect(configuration).toEqual({
      LambdaFunctionConfigurations: [
        {
          Id: "resize",
          Events: ["s3:ObjectCreated:*"],
          Filter: {
            Key: {
              FilterRules: [
                { Name: "prefix", Value: "images/" },
                { Name: "suffix", Value: ".png" },
              ],
            },
          },
          LambdaFunctionArn: LAMBDA_ARN,
        },
      ],
      QueueConfigurations: [
        { Id: undefined, Events: ["s3:ObjectCreated:*"], Filter: undefined, QueueArn: QUEUE_ARN },
      ],
      TopicConfigurations: [],
    });
  });

  it("sends empty lists to remove every notification", () => {
    expect(toNotificationConfiguration([])).toEqual({
      LambdaFunctionConfigurations: [],
      QueueConfigurations: [],
      TopicConfigurations: [],
    });
  });

  it("keeps the EventBridge setting of the current configuration", () => {
    const current = { EventBridgeConfiguration: {}, QueueConfigurations: [] };
    expect(toNotificationConfiguration([], current).EventBridgeConfiguration).toEqual({});
    expect(toNotificationConfiguration([])).not.toHaveProperty("EventBridgeConfiguration");
  });

  it("round-trips with toNotificationRules", () => {
    const rules = [
      rule({ id: "a", prefix: "in/" }),
      rule({ id: "b", destination: "sns", arn: TOPIC_ARN, suffix: ".csv" }),
    ];
    expect(toNotificationRules(toNotificationConfiguration(rules))).toEqual([
      { ...rules[0], suffix: undefined },
      { ...rules[1], prefix: undefined },
    ]);
  });
});

describe("overlappingRule", () => {
  const existing: NotificationRule = {
    id: "images",
    destination: "sqs",
    arn: QUEUE_ARN,
    events: ["s3:ObjectCreated:*"],
    prefix: "images/",
    suffix: ".jpg",
  };

  it("flags a nested prefix on a covered event type, whatever the destination", () => {
    expect(
      overlappingRule([existing], { events: ["s3:ObjectCreated:Put"], prefix: "images/raw/" }),
    ).toBe(existing);
  });

  it("treats an empty filter as matching every key", () => {
    expect(overlappingRule([existing], { events: ["s3:ObjectCreated:*"] })).toBe(existing);
  });

  it("allows different suffixes, different prefixes or other event types", () => {
    const add = (rule: Parameters<typeof overlappingRule>[1]) => overlappingRule([existing], rule);
    expect(
      add({ events: ["s3:ObjectCreated:*"], prefix: "images/", suffix: ".png" }),
    ).toBeUndefined();
    expect(add({ events: ["s3:ObjectCreated:*"], prefix: "videos/" })).toBeUndefined();
    expect(add({ events: ["s3:ObjectRemoved:*"], prefix: "images/" })).toBeUndefined();
  });
});
