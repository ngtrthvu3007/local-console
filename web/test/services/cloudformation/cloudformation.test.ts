import { describe, expect, it } from "vitest";
import {
  buildResourceIndex,
  indexKey,
} from "../../../src/services/cloudformation/resourceIndex.ts";
import { resourceHref } from "../../../src/services/cloudformation/resourceLinks.ts";
import { isRunning, needsTls, statusGroup } from "../../../src/services/cloudformation/status.ts";
import { latestReasons, stubbedResources } from "../../../src/services/cloudformation/stub.ts";

describe("statusGroup", () => {
  it.each([
    ["CREATE_IN_PROGRESS", "in-progress"],
    ["REVIEW_IN_PROGRESS", "in-progress"],
    ["UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS", "in-progress"],
    ["CREATE_FAILED", "error"],
    ["ROLLBACK_COMPLETE", "error"],
    ["UPDATE_ROLLBACK_COMPLETE", "error"],
    ["CREATE_COMPLETE", "success"],
    ["DELETE_SKIPPED", "success"],
    ["SOMETHING_NEW", "info"],
  ])("%s → %s", (status, group) => expect(statusGroup(status)).toBe(group));
});

describe("stub", () => {
  const stubReason =
    "Resource type AWS::AmazonMQ::Broker is not supported by Floci. It was stubbed and nothing was created for it.";
  // Mới nhất đứng trước
  const events = [
    { LogicalResourceId: "Broker", ResourceStatusReason: stubReason },
    { LogicalResourceId: "Broker" },
    { LogicalResourceId: "Queue", ResourceStatusReason: "Property X is wrong" },
    { LogicalResourceId: "Queue", ResourceStatusReason: "older" },
  ];

  it("takes the latest reason of each resource", () => {
    const reasons = latestReasons(events);
    expect(reasons.get("Queue")).toBe("Property X is wrong");
    expect(reasons.get("Broker")).toBe(stubReason);
  });

  it("finds only the stubbed resources", () => {
    const resources = [{ LogicalResourceId: "Broker" }, { LogicalResourceId: "Queue" }];
    expect(stubbedResources(resources, latestReasons(events))).toEqual([resources[0]]);
  });
});

describe("resourceHref", () => {
  it("links resources whose physical ID matches a route", () => {
    expect(resourceHref("AWS::S3::Bucket", "photos")).toBe("/s3/buckets/photos");
    expect(resourceHref("AWS::SQS::Queue", "http://localhost:4566/000000000000/orders")).toBe(
      "/sqs/queues/orders",
    );
    expect(
      resourceHref("AWS::SNS::Subscription", "arn:aws:sns:r:000000000000:topic-a:1234-uuid"),
    ).toBe("/sns/topics/topic-a");
    expect(
      resourceHref("AWS::CloudFormation::Stack", "arn:aws:cloudformation:r:0:stack/Child/uuid"),
    ).toBe("/cloudformation/stacks/Child");
  });

  it("links the other services", () => {
    expect(resourceHref("AWS::DynamoDB::Table", "orders")).toBe("/dynamodb/tables/orders");
    expect(resourceHref("AWS::ElastiCache::CacheCluster", "cache-1")).toBe(
      "/elasticache/clusters/cache-1",
    );
    expect(resourceHref("AWS::Events::EventBus", "bus-1")).toBe("/eventbridge/rules?bus=bus-1");
    expect(resourceHref("AWS::SES::EmailIdentity", "a@b.com")).toBe("/ses/identities");
    expect(resourceHref("AWS::Lambda::Url", "arn:aws:lambda:r:000000000000:function:my-fn")).toBe(
      "/lambda/functions/my-fn",
    );
    expect(
      resourceHref(
        "AWS::StepFunctions::StateMachine",
        "arn:aws:states:r:000000000000:stateMachine:flow",
      ),
    ).toBe("/stepfunctions/statemachines/flow");
  });

  it("links a Lambda log group to the function's Monitor tab, others stay text", () => {
    expect(resourceHref("AWS::Logs::LogGroup", "/aws/lambda/fn")).toBe(
      "/lambda/functions/fn?tab=monitor",
    );
    expect(resourceHref("AWS::Logs::LogGroup", "/other/group")).toBeUndefined();
    expect(resourceHref("AWS::IAM::Role", "role")).toBeUndefined();
  });
});

describe("resource index", () => {
  it("maps (type, physical ID) to the stack, SQS by queue name", () => {
    const index = buildResourceIndex([
      {
        name: "App",
        resources: [
          { type: "AWS::SQS::Queue", physicalId: "http://localhost:4566/000000000000/orders" },
          { type: "AWS::S3::Bucket", physicalId: "photos" },
        ],
      },
      { name: "Other", resources: [{ type: "AWS::S3::Bucket", physicalId: "photos" }] },
    ]);
    expect(index.get(indexKey("AWS::SQS::Queue", "https://localhost.floci.io/0/orders"))).toBe(
      "App",
    );
    expect(index.get(indexKey("AWS::S3::Bucket", "photos"))).toBe("App");
    expect(index.get(indexKey("AWS::S3::Bucket", "missing"))).toBeUndefined();
  });
});

describe("status helpers", () => {
  it("polls a running stack but not one waiting for a change set", () => {
    expect(isRunning("UPDATE_IN_PROGRESS")).toBe(true);
    expect(isRunning("REVIEW_IN_PROGRESS")).toBe(false);
    expect(isRunning("CREATE_COMPLETE")).toBe(false);
  });

  it("hints at TLS only for the custom resource 443 error", () => {
    expect(needsTls("connect ECONNREFUSED 127.0.0.1:443")).toBe(true);
    expect(needsTls("connect ECONNREFUSED 127.0.0.1:4566")).toBe(false);
  });
});
