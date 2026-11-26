import { describe, expect, it } from "vitest";
import { auditLogGroup } from "../../../src/services/docdb/constants.ts";
import { engineLogGroup } from "../../../src/services/elasticache/constants.ts";
import { retentionLabel } from "../../../src/services/logs/constants.ts";
import { logsRoutes } from "../../../src/services/logs/routes.ts";
import {
  createLogGroupSchema,
  retentionDays,
  subscriptionFilterSchema,
  testEventSchema,
} from "../../../src/services/logs/schemas.ts";
import { destinationOf, logSourceOf } from "../../../src/services/logs/sources.ts";
import { brokerLogGroup } from "../../../src/services/mq/constants.ts";
import { errorLogGroup } from "../../../src/services/rds/constants.ts";

describe("CloudWatch Logs", () => {
  it("round-trips group and stream names with special characters through the URL", () => {
    const group = "/aws/lambda/my-fn#1";
    const stream = "2026/11/26/[$LATEST]1a2b";
    const url = new URL(logsRoutes.stream(group, stream), "http://x");
    expect(url.pathname).toBe("/logs/groups/stream");
    expect(url.searchParams.get("group")).toBe(group);
    expect(url.searchParams.get("stream")).toBe(stream);
    expect(logsRoutes.group("/my-app/api")).toBe("/logs/groups/detail?group=%2Fmy-app%2Fapi");
  });
  it("finds the console page of a service log group from its name only", () => {
    expect(logSourceOf("/aws/lambda/process-order")).toEqual({
      label: "Function",
      name: "process-order",
      href: "/lambda/functions/process-order",
    });
    expect(logSourceOf("/aws/rds/instance/app-db/error")?.href).toBe("/rds/databases/app-db");
    expect(logSourceOf("/aws/docdb/cluster/orders/audit")?.href).toBe("/docdb/clusters/orders");
    expect(logSourceOf("/aws/elasticache/cluster/app-cache/engine-log")?.href).toBe(
      "/elasticache/clusters/app-cache",
    );
    expect(logSourceOf("/aws/amazonmq/broker/b-123/general")?.name).toBe("b-123");
    expect(logSourceOf("/my-app/api")).toBeUndefined();
    expect(errorLogGroup("app-db")).toBe("/aws/rds/instance/app-db/error");
    expect(auditLogGroup("orders")).toBe("/aws/docdb/cluster/orders/audit");
    expect(engineLogGroup("app-cache")).toBe("/aws/elasticache/cluster/app-cache/engine-log");
    expect(brokerLogGroup("b-123")).toBe("/aws/amazonmq/broker/b-123/general");
  });
  it("only allows AWS retention values and labels them", () => {
    expect(createLogGroupSchema.safeParse({ name: "/my-app/api", retention: "7" }).success).toBe(
      true,
    );
    expect(createLogGroupSchema.safeParse({ name: "/my-app/api", retention: "8" }).success).toBe(
      false,
    );
    expect(retentionDays("never")).toBeUndefined();
    expect(retentionDays("14")).toBe(14);
    expect([retentionLabel(undefined), retentionLabel(1), retentionLabel(7)]).toEqual([
      "Never expire",
      "1 day",
      "7 days",
    ]);
  });
  it("checks AWS names Floci doesn't", () => {
    for (const name of ["", "has space", "bad:colon", "x".repeat(513)])
      expect(createLogGroupSchema.safeParse({ name, retention: "never" }).success).toBe(false);
    expect(testEventSchema.safeParse({ stream: "a:b", message: "hi" }).success).toBe(false);
    expect(testEventSchema.safeParse({ stream: "console-test", message: "  " }).success).toBe(
      false,
    );
    expect(
      subscriptionFilterSchema.safeParse({
        name: "f*",
        filterPattern: "",
        destinationType: "lambda",
        destinationArn: "arn:x",
      }).success,
    ).toBe(false);
  });

  it("names the destination of a subscription filter from its ARN", () => {
    expect(destinationOf("arn:aws:lambda:ap-southeast-1:000000000000:function:alert")).toEqual({
      kind: "lambda",
      name: "alert",
    });
    expect(destinationOf("arn:aws:kinesis:ap-southeast-1:000000000000:stream/app-logs")).toEqual({
      kind: "kinesis",
      name: "app-logs",
    });
    expect(destinationOf("arn:aws:firehose:x:0:deliverystream/d").kind).toBe("other");
  });
});
