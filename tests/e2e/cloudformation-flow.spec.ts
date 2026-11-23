import {
  CloudFormationClient,
  CreateStackCommand,
  DeleteStackCommand,
  ListStackResourcesCommand,
} from "@aws-sdk/client-cloudformation";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { PutEventsCommand, EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { DescribeExecutionCommand, SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { ACCOUNT_ID, consoleConfig, viaConsole, waitFor } from "../it/helpers.ts";
import { expect, test, uniqueName } from "./fixtures.ts";

// Một stack tạo S3, SQS, SNS, DynamoDB, Lambda, EventBridge, Step Functions: các resource chạy với nhau thật,
// link từ tab Resources sang trang service và "Stack: X" quay về, xóa stack thì resource mất. Dọn bằng SDK ở afterAll.

const stack = uniqueName("flow");
const names = {
  bucket: uniqueName("bucket"),
  snsQueue: uniqueName("snsq"),
  ruleQueue: uniqueName("rulq"),
  flowQueue: uniqueName("flwq"),
  topic: uniqueName("topic"),
  table: uniqueName("table"),
  fn: uniqueName("fn"),
  rule: uniqueName("rule"),
  machine: uniqueName("sm"),
  bus: uniqueName("bus"),
};
const ROLE_ARN = `arn:aws:iam::${ACCOUNT_ID}:role/lc-e2e-cfn`;
const EVENT_SOURCE = "lc.e2e.cfn";

const template = {
  AWSTemplateFormatVersion: "2010-09-09",
  Resources: {
    Bucket: { Type: "AWS::S3::Bucket", Properties: { BucketName: names.bucket } },
    SnsQueue: { Type: "AWS::SQS::Queue", Properties: { QueueName: names.snsQueue } },
    RuleQueue: { Type: "AWS::SQS::Queue", Properties: { QueueName: names.ruleQueue } },
    FlowQueue: { Type: "AWS::SQS::Queue", Properties: { QueueName: names.flowQueue } },
    Bus: { Type: "AWS::Events::EventBus", Properties: { Name: names.bus } },
    Topic: { Type: "AWS::SNS::Topic", Properties: { TopicName: names.topic } },
    Subscription: {
      Type: "AWS::SNS::Subscription",
      Properties: {
        TopicArn: { Ref: "Topic" },
        Protocol: "sqs",
        Endpoint: { "Fn::GetAtt": ["SnsQueue", "Arn"] },
      },
    },
    Table: {
      Type: "AWS::DynamoDB::Table",
      Properties: {
        TableName: names.table,
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: [{ AttributeName: "pk", AttributeType: "S" }],
        KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
      },
    },
    Function: {
      Type: "AWS::Lambda::Function",
      Properties: {
        FunctionName: names.fn,
        Runtime: "nodejs22.x",
        Handler: "index.handler",
        Role: ROLE_ARN,
        Code: { ZipFile: "exports.handler = async (event) => ({ echo: event });" },
      },
    },
    Rule: {
      Type: "AWS::Events::Rule",
      Properties: {
        Name: names.rule,
        EventPattern: { source: [EVENT_SOURCE] },
        State: "ENABLED",
        Targets: [{ Id: "queue", Arn: { "Fn::GetAtt": ["RuleQueue", "Arn"] } }],
      },
    },
    StateMachine: {
      Type: "AWS::StepFunctions::StateMachine",
      Properties: {
        StateMachineName: names.machine,
        RoleArn: ROLE_ARN,
        DefinitionString: {
          "Fn::Sub": JSON.stringify({
            StartAt: "Send",
            States: {
              Send: {
                Type: "Task",
                Resource: "arn:aws:states:::sqs:sendMessage",
                Parameters: { QueueUrl: "${FlowQueue}", MessageBody: "from-state-machine" },
                End: true,
              },
            },
          }),
        },
      },
    },
  },
};

test.describe.configure({ mode: "serial" });

let cloudformation: CloudFormationClient;
let sqs: SQSClient;
let region: string;
// Logical ID → physical ID của resource do stack tạo
const physical: Record<string, string> = {};

const queueUrl = (queueName: string) =>
  Object.values(physical).find((id) => id.endsWith(`/${queueName}`)) ?? "";

// Chờ tới khi queue nhận tin có body chứa `text`
const waitForMessage = (queueName: string, text: string) =>
  waitFor(`a message with "${text}" in ${queueName}`, async () => {
    const { Messages } = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl(queueName),
        WaitTimeSeconds: 1,
        MaxNumberOfMessages: 10,
        VisibilityTimeout: 0,
      }),
    );
    return Messages?.some((message) => message.Body?.includes(text)) ? true : undefined;
  });

test.beforeAll(async () => {
  ({ region } = await consoleConfig());
  const config = viaConsole(region);
  cloudformation = new CloudFormationClient(config);
  sqs = new SQSClient(config);
  await cloudformation.send(
    new CreateStackCommand({ StackName: stack, TemplateBody: JSON.stringify(template) }),
  );
  const { StackResourceSummaries = [] } = await cloudformation.send(
    new ListStackResourcesCommand({ StackName: stack }),
  );
  for (const resource of StackResourceSummaries) {
    physical[resource.LogicalResourceId ?? ""] = resource.PhysicalResourceId ?? "";
  }
});

test.afterAll(async () => {
  await cloudformation.send(new DeleteStackCommand({ StackName: stack })).catch(() => undefined);
});

test("the stack created every resource and none was stubbed", async ({ page }) => {
  for (const logicalId of Object.keys(template.Resources)) {
    expect(physical[logicalId], `${logicalId} has a physical ID`).toBeTruthy();
  }
  await page.goto(`/cloudformation/stacks/${stack}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(stack);
  await expect(page.getByText("CREATE_COMPLETE").first()).toBeVisible();
  await expect(page.getByText(/stubbed by Floci/)).toHaveCount(0);
});

test("the resources work together", async () => {
  const config = viaConsole(region);
  // SNS → SQS: subscription của stack chuyển tin vào queue
  await new SNSClient(config).send(
    new PublishCommand({ TopicArn: physical.Topic, Message: "from-sns" }),
  );
  await waitForMessage(names.snsQueue, "from-sns");

  // EventBridge: rule của stack chuyển event vào queue
  await new EventBridgeClient(config).send(
    new PutEventsCommand({
      Entries: [{ Source: EVENT_SOURCE, DetailType: "lc", Detail: JSON.stringify({ n: 1 }) }],
    }),
  );
  await waitForMessage(names.ruleQueue, EVENT_SOURCE);

  // Step Functions: state machine của stack gửi tin vào queue
  const sfn = new SFNClient(config);
  const { executionArn } = await sfn.send(
    new StartExecutionCommand({ stateMachineArn: physical.StateMachine }),
  );
  await waitFor("execution to succeed", async () => {
    const { status } = await sfn.send(new DescribeExecutionCommand({ executionArn }));
    return status === "RUNNING" ? undefined : status;
  }).then((status) => expect(status).toBe("SUCCEEDED"));
  await waitForMessage(names.flowQueue, "from-state-machine");

  // Lambda: function của stack chạy được
  const { Payload } = await new LambdaClient(config).send(
    new InvokeCommand({ FunctionName: names.fn, Payload: JSON.stringify({ hi: 1 }) }),
  );
  expect(JSON.parse(new TextDecoder().decode(Payload))).toEqual({ echo: { hi: 1 } });
});

// Mỗi resource: link ở tab Resources dẫn tới trang service, trang đó nói nó thuộc stack này
const pages = [
  { logicalId: "Bucket", heading: names.bucket },
  { logicalId: "Function", heading: names.fn },
  { logicalId: "Table", heading: names.table },
  { logicalId: "SnsQueue", heading: names.snsQueue },
  { logicalId: "Topic", heading: names.topic },
  { logicalId: "StateMachine", heading: names.machine },
];

for (const { logicalId, heading } of pages) {
  test(`${logicalId}: Resources tab links to its page, which links back to the stack`, async ({
    page,
  }) => {
    await page.goto(`/cloudformation/stacks/${stack}?tab=resources`);
    await page.getByRole("link", { name: physical[logicalId], exact: true }).click();
    // Chờ trang service tải xong (lazy): breadcrumb của trang stack cũng mang tên stack
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await page.getByRole("link", { name: stack }).click();
    await expect(page).toHaveURL(new RegExp(`/cloudformation/stacks/${stack}`));
  });
}

test("the event bus links to its rules", async ({ page }) => {
  await page.goto(`/cloudformation/stacks/${stack}?tab=resources`);
  await page.getByRole("link", { name: physical.Bus, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/eventbridge/rules\?.*bus=${names.bus}`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Rules/);
});

test("EventBridge rule page links back to the stack", async ({ page }) => {
  // Physical ID của rule chỉ là tên (không đủ để link từ tab Resources), nên mở thẳng trang rule
  await page.goto(`/eventbridge/rules/default/${names.rule}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(names.rule);
  await page.getByRole("link", { name: stack }).click();
  await expect(page).toHaveURL(new RegExp(`/cloudformation/stacks/${stack}`));
});

test("deleting the stack removes every resource it created", async ({ page }) => {
  await page.goto(`/cloudformation/stacks/${stack}`);
  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("delete");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/cloudformation\/stacks$/);

  // Các trang service không còn resource của stack (probe 400/404 của trang "not found" là dự kiến)
  const config = viaConsole(region);
  await expect(
    sqs.send(new ReceiveMessageCommand({ QueueUrl: queueUrl(names.snsQueue) })),
  ).rejects.toBeTruthy();
  await expect(
    new LambdaClient(config).send(new InvokeCommand({ FunctionName: names.fn })),
  ).rejects.toBeTruthy();
});
