import { matchPath } from "react-router";
import { describe, expect, it } from "vitest";
import {
  buildResourceIndex,
  indexKey,
} from "../../../src/services/cloudformation/resourceIndex.ts";
import { resourceHref } from "../../../src/services/cloudformation/resourceLinks.ts";
import {
  CDK_EDIT_LOCK_REASON,
  LOADING_EDIT_LOCK_REASON,
  RUNNING_EDIT_LOCK_REASON,
  STARTER_TEMPLATE,
} from "../../../src/services/cloudformation/constants.ts";
import { cloudformationRoutes } from "../../../src/services/cloudformation/routes.ts";
import { stackTemplateSchema } from "../../../src/services/cloudformation/schemas.ts";
import {
  editLockReason,
  isCdkStack,
  isNoUpdatesError,
  isRunning,
  needsTls,
  statusGroup,
} from "../../../src/services/cloudformation/status.ts";
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
  it("links secrets by ARN and parameters by name", () => {
    expect(
      resourceHref(
        "AWS::SecretsManager::Secret",
        "arn:aws:secretsmanager:ap-southeast-1:000000000000:secret:app/db-AbC123",
      ),
    ).toBe("/secretsmanager/secrets/detail?name=app%2Fdb");
    expect(resourceHref("AWS::SSM::Parameter", "/app/dev/db-host")).toBe(
      "/ssm/parameters/detail?name=%2Fapp%2Fdev%2Fdb-host",
    );
  });

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

    expect(resourceHref("AWS::Cognito::UserPool", "ap-southeast-1_abc123")).toBe(
      "/cognito/user-pools/ap-southeast-1_abc123",
    );

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

describe("stackTemplateSchema", () => {
  it("accepts an AWS stack name and a template", () => {
    const result = stackTemplateSchema(false).safeParse({
      name: "my-stack-1",
      template: STARTER_TEMPLATE,
    });

    expect(result.success).toBe(true);
  });

  it("rejects names that start with a digit, have other characters or are too long, and an empty template", () => {
    const issue = (name: string, template = "x") =>
      stackTemplateSchema(false).safeParse({ name, template }).error?.issues[0]?.message;

    expect(issue("1stack")).toBe("Start with a letter; use only letters, numbers and hyphens (-).");

    expect(issue("my_stack")).toBe(
      "Start with a letter; use only letters, numbers and hyphens (-).",
    );

    expect(issue(`a${"b".repeat(128)}`)).toBe("Must be at most 128 characters.");
    expect(issue("ok", "   ")).toBe("Enter a template.");
  });
});

describe("edit helpers", () => {
  it("knows a CDK stack by its metadata resource", () => {
    expect(
      isCdkStack([{ ResourceType: "AWS::SQS::Queue" }, { ResourceType: "AWS::CDK::Metadata" }]),
    ).toBe(true);

    expect(isCdkStack([{ ResourceType: "AWS::SQS::Queue" }])).toBe(false);
  });

  it("tells a no-op update from a real error", () => {
    expect(isNoUpdatesError(new Error("No updates are to be performed."))).toBe(true);
    expect(isNoUpdatesError(new Error("Template format error"))).toBe(false);
    expect(isNoUpdatesError("oops")).toBe(false);
  });
});

describe("stack template form", () => {
  it("keeps the template text as typed, trailing newline included", () => {
    const { template } = stackTemplateSchema(false).parse({ name: "a", template: "Resources:\n" });

    expect(template).toBe("Resources:\n");
  });

  it("does not check the name when editing: a stack made elsewhere may break the rule", () => {
    expect(stackTemplateSchema(true).safeParse({ name: "my_stack", template: "x" }).success).toBe(
      true,
    );
  });

  it("a stack named create still opens its own page", () => {
    const stackPattern = "/cloudformation/stacks/:stack";

    expect(matchPath(stackPattern, cloudformationRoutes.stack("create"))?.params.stack).toBe(
      "create",
    );

    expect(matchPath(stackPattern, cloudformationRoutes.createStack)).toBeNull();
  });

  it("the create page stays under Stacks, so the sidebar keeps CloudFormation selected", () => {
    expect(cloudformationRoutes.createStack.startsWith(`${cloudformationRoutes.stacks}/`)).toBe(
      true,
    );

    expect(
      matchPath("/cloudformation/stacks/:stack/edit", cloudformationRoutes.createStack),
    ).toBeNull();
  });

  it("locks editing while the stack runs, while it loads, and for CDK stacks", () => {
    const queue = [{ ResourceType: "AWS::SQS::Queue" }];
    const cdk = [...queue, { ResourceType: "AWS::CDK::Metadata" }];
    const done = { StackStatus: "CREATE_COMPLETE" };

    expect(editLockReason({ StackStatus: "UPDATE_IN_PROGRESS" }, queue)).toBe(
      RUNNING_EDIT_LOCK_REASON,
    );

    expect(editLockReason({ StackStatus: "REVIEW_IN_PROGRESS" }, queue)).toBe(
      RUNNING_EDIT_LOCK_REASON,
    );

    expect(editLockReason(done, undefined)).toBe(LOADING_EDIT_LOCK_REASON);
    expect(editLockReason(undefined, queue)).toBe(LOADING_EDIT_LOCK_REASON);
    expect(editLockReason(done, cdk)).toBe(CDK_EDIT_LOCK_REASON);
    expect(editLockReason(done, queue)).toBeUndefined();
  });

  it("locks the CDK bootstrap stack, known by its BootstrapVersion output", () => {
    const bootstrap = {
      StackStatus: "CREATE_COMPLETE",
      Outputs: [{ OutputKey: "BucketName" }, { OutputKey: "BootstrapVersion" }],
    };

    expect(editLockReason(bootstrap, [{ ResourceType: "AWS::S3::Bucket" }])).toBe(
      CDK_EDIT_LOCK_REASON,
    );
  });
});
