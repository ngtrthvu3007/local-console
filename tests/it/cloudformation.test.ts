import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CloudFormationClient,
  CreateStackCommand,
  DeleteStackCommand,
  DescribeStackEventsCommand,
  DescribeStacksCommand,
  GetTemplateSummaryCommand,
  ListStackResourcesCommand,
  type StackResourceSummary,
} from "@aws-sdk/client-cloudformation";
import { GetQueueUrlCommand, SQSClient } from "@aws-sdk/client-sqs";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { consoleConfig, uniqueName, viaConsole, waitFor } from "./helpers.ts";

// Hình dữ liệu mà web/src/services/cloudformation dựa vào: DescribeStacks, events, resources, GetTemplateSummary, DeleteStack

const STUB_REASON_MARKER = "was stubbed and nothing was created";
const MISSING_EXPORT = "lc-it-cfn-export-that-does-not-exist";

const okName = uniqueName("cfn");
const failName = uniqueName("cfn-fail");
const bucketName = uniqueName("cfn-bucket");
const queueName = uniqueName("cfn-queue");
const tableName = uniqueName("cfn-table");
const exportName = uniqueName("cfn-export");
const STUB_LOGICAL_ID = "StubbedDatabase";

let cloudformation: CloudFormationClient;
let sqs: SQSClient;
let s3: S3Client;
let dynamodb: DynamoDBClient;

const okTemplate = {
  AWSTemplateFormatVersion: "2010-09-09",
  Description: "lc-it cloudformation",
  Resources: {
    Bucket: { Type: "AWS::S3::Bucket", Properties: { BucketName: bucketName } },
    Queue: { Type: "AWS::SQS::Queue", Properties: { QueueName: queueName } },
    Table: {
      Type: "AWS::DynamoDB::Table",
      Properties: {
        TableName: tableName,
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: [{ AttributeName: "pk", AttributeType: "S" }],
        KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
      },
    },
    // Type Floci không hỗ trợ: stack vẫn CREATE_COMPLETE nhưng không tạo gì
    [STUB_LOGICAL_ID]: {
      Type: "AWS::Glue::Database",
      Properties: { CatalogId: "000000000000", DatabaseInput: { Name: "lc_it_cfn_db" } },
    },
  },
  Outputs: {
    QueueName: { Value: { "Fn::GetAtt": ["Queue", "QueueName"] }, Export: { Name: exportName } },
  },
};

// Import một export không có: CREATE_FAILED rồi rollback
const failTemplate = {
  AWSTemplateFormatVersion: "2010-09-09",
  Resources: {
    Queue: {
      Type: "AWS::SQS::Queue",
      Properties: { QueueName: { "Fn::ImportValue": MISSING_EXPORT } },
    },
  },
};

const describeStack = async (name: string) => {
  const { Stacks } = await cloudformation.send(new DescribeStacksCommand({ StackName: name }));
  return Stacks?.[0];
};

// Floci chạy CreateStack đồng bộ, nhưng đợi tới khi hết *_IN_PROGRESS cho chắc
const settled = (name: string) =>
  waitFor(`stack ${name} to settle`, async () => {
    const stack = await describeStack(name);
    return stack?.StackStatus?.endsWith("_IN_PROGRESS") ? undefined : stack;
  });

const events = async (name: string) =>
  (await cloudformation.send(new DescribeStackEventsCommand({ StackName: name }))).StackEvents ??
  [];

beforeAll(async () => {
  const { region } = await consoleConfig();
  const config = viaConsole(region);
  cloudformation = new CloudFormationClient(config);
  sqs = new SQSClient(config);
  s3 = new S3Client({ ...config, forcePathStyle: true });
  dynamodb = new DynamoDBClient(config);
  await cloudformation.send(
    new CreateStackCommand({ StackName: okName, TemplateBody: JSON.stringify(okTemplate) }),
  );
  await cloudformation.send(
    new CreateStackCommand({ StackName: failName, TemplateBody: JSON.stringify(failTemplate) }),
  );
});

afterAll(async () => {
  for (const name of [okName, failName]) {
    await cloudformation.send(new DeleteStackCommand({ StackName: name })).catch(() => undefined);
  }
});

describe("stack list and header", () => {
  it("lists a deployed stack with status, creation time and outputs", async () => {
    const stack = await settled(okName);
    expect(stack?.StackStatus).toBe("CREATE_COMPLETE");
    expect(stack?.CreationTime).toBeInstanceOf(Date);
    expect(stack?.Outputs?.find((output) => output.OutputKey === "QueueName")).toMatchObject({
      OutputValue: queueName,
      ExportName: exportName,
    });
  });

  it("is in the list of every stack", async () => {
    const { Stacks } = await cloudformation.send(new DescribeStacksCommand({}));
    expect(Stacks?.map((stack) => stack.StackName)).toEqual(
      expect.arrayContaining([okName, failName]),
    );
  });

  it("gives the description only through GetTemplateSummary", async () => {
    const { Description } = await cloudformation.send(
      new GetTemplateSummaryCommand({ StackName: okName }),
    );
    expect(Description).toBe(okTemplate.Description);
  });

  it("answers an unknown stack with a ValidationError that says it does not exist", async () => {
    await expect(describeStack(uniqueName("cfn-missing"))).rejects.toMatchObject({
      name: "ValidationError",
      message: expect.stringContaining("does not exist"),
    });
  });
});

describe("resources", () => {
  let resources: StackResourceSummary[];

  beforeAll(async () => {
    await settled(okName);
    resources =
      (await cloudformation.send(new ListStackResourcesCommand({ StackName: okName })))
        .StackResourceSummaries ?? [];
  });

  it("lists physical IDs that match the service pages (queue by URL, others by name)", () => {
    const physicalId = (type: string) =>
      resources.find((resource) => resource.ResourceType === type)?.PhysicalResourceId;
    expect(physicalId("AWS::S3::Bucket")).toBe(bucketName);
    expect(physicalId("AWS::DynamoDB::Table")).toBe(tableName);
    expect(physicalId("AWS::SQS::Queue")?.endsWith(`/${queueName}`)).toBe(true);
  });

  it("created the resources for real", async () => {
    await s3.send(new HeadBucketCommand({ Bucket: bucketName }));
    await dynamodb.send(new DescribeTableCommand({ TableName: tableName }));
    const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }));
    expect(QueueUrl).toContain(queueName);
  });

  it("has no reason in the list: the reason comes from the events", async () => {
    const stubbed = resources.find((resource) => resource.LogicalResourceId === STUB_LOGICAL_ID);
    expect(stubbed?.ResourceStatus).toBe("CREATE_COMPLETE");
    expect(stubbed?.ResourceStatusReason).toBeUndefined();
    const reason = (await events(okName)).find(
      (event) => event.LogicalResourceId === STUB_LOGICAL_ID && event.ResourceStatusReason,
    )?.ResourceStatusReason;
    expect(reason).toContain(STUB_REASON_MARKER);
  });
});

describe("events", () => {
  it("returns the newest event first, ending at the stack's own CREATE_COMPLETE", async () => {
    await settled(okName);
    const all = await events(okName);
    expect(all[0]).toMatchObject({ LogicalResourceId: okName, ResourceStatus: "CREATE_COMPLETE" });
  });

  it("explains a failed deploy: a *_FAILED event with a reason, then the rollback", async () => {
    const stack = await settled(failName);
    expect(stack?.StackStatus).toBe("ROLLBACK_COMPLETE");
    const failed = (await events(failName)).find((event) =>
      event.ResourceStatus?.endsWith("_FAILED"),
    );
    expect(failed?.ResourceStatusReason).toBeTruthy();
  });
});

describe("delete", () => {
  it("removes the stack and its resources; the stack then reads as not existing", async () => {
    await settled(okName);
    await cloudformation.send(new DeleteStackCommand({ StackName: okName }));
    // Console hỏi tới khi stack mất hoặc DELETE_COMPLETE
    await waitFor("stack to be gone", async () => {
      try {
        const stack = await describeStack(okName);
        return stack?.StackStatus === "DELETE_COMPLETE" ? true : undefined;
      } catch (error) {
        if ((error as Error).message?.includes("does not exist")) return true;
        throw error;
      }
    });
    await expect(s3.send(new HeadBucketCommand({ Bucket: bucketName }))).rejects.toBeTruthy();
    await expect(sqs.send(new GetQueueUrlCommand({ QueueName: queueName }))).rejects.toBeTruthy();
  });
});
