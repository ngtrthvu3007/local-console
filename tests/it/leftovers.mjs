// Resource lc-it-* / lc-e2e-* còn sót trong Floci sau khi chạy test.
//   node it/leftovers.mjs            liệt kê
//   node it/leftovers.mjs --delete   xoá (chỉ resource có tiền tố của test)
import { execFileSync } from "node:child_process";
import {
  S3Client,
  ListBucketsCommand,
  ListObjectVersionsCommand,
  DeleteObjectsCommand,
  DeleteBucketCommand,
} from "@aws-sdk/client-s3";
import { DynamoDBClient, ListTablesCommand, DeleteTableCommand } from "@aws-sdk/client-dynamodb";
import { LambdaClient, ListFunctionsCommand, DeleteFunctionCommand } from "@aws-sdk/client-lambda";
import {
  SESv2Client,
  ListConfigurationSetsCommand,
  DeleteConfigurationSetCommand,
  ListEmailIdentitiesCommand,
  ListEmailTemplatesCommand,
  DeleteEmailIdentityCommand,
  DeleteEmailTemplateCommand,
} from "@aws-sdk/client-sesv2";
import { SQSClient, ListQueuesCommand, DeleteQueueCommand } from "@aws-sdk/client-sqs";
import { SNSClient, ListTopicsCommand, DeleteTopicCommand } from "@aws-sdk/client-sns";
import {
  SchedulerClient,
  ListScheduleGroupsCommand,
  ListSchedulesCommand,
  DeleteScheduleCommand,
  DeleteScheduleGroupCommand,
} from "@aws-sdk/client-scheduler";
import {
  SFNClient,
  ListStateMachinesCommand,
  DeleteStateMachineCommand,
} from "@aws-sdk/client-sfn";
import {
  CloudFormationClient,
  DescribeStacksCommand,
  DeleteStackCommand,
} from "@aws-sdk/client-cloudformation";
import {
  EventBridgeClient,
  ListEventBusesCommand,
  ListRulesCommand,
  ListTargetsByRuleCommand,
  RemoveTargetsCommand,
  DeleteRuleCommand,
  DeleteEventBusCommand,
} from "@aws-sdk/client-eventbridge";

const consoleUrl = process.env.LOCAL_CONSOLE_URL ?? "http://localhost:3701";
const { region } = await (await fetch(`${consoleUrl}/api/config`)).json();
const config = {
  region,
  endpoint: `${consoleUrl}/aws`,
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
};
// IT dùng lc-it-, e2e dùng lc-e2e-
const PREFIXES = ["lc-it-", "lc-e2e-"];
const mine = (names) => names.filter((name) => PREFIXES.some((prefix) => name?.startsWith(prefix)));

const s3 = new S3Client({ ...config, forcePathStyle: true });
const dynamodb = new DynamoDBClient(config);
const lambda = new LambdaClient(config);
const sqs = new SQSClient(config);
const sns = new SNSClient(config);
const ses = new SESv2Client(config);
const eventbridge = new EventBridgeClient(config);
const scheduler = new SchedulerClient(config);
const sfn = new SFNClient(config);
const cloudformation = new CloudFormationClient(config);

const buckets = mine(
  ((await s3.send(new ListBucketsCommand({}))).Buckets ?? []).map((bucket) => bucket.Name),
);
const tables = mine((await dynamodb.send(new ListTablesCommand({}))).TableNames ?? []);
const functions = mine(
  ((await lambda.send(new ListFunctionsCommand({}))).Functions ?? []).map((fn) => fn.FunctionName),
);
const queues = [];
for (const prefix of PREFIXES) {
  queues.push(
    ...((await sqs.send(new ListQueuesCommand({ QueueNamePrefix: prefix }))).QueueUrls ?? []),
  );
}
const identities = mine(
  ((await ses.send(new ListEmailIdentitiesCommand({}))).EmailIdentities ?? []).map(
    (item) => item.IdentityName,
  ),
);
const configurationSets = mine(
  (await ses.send(new ListConfigurationSetsCommand({}))).ConfigurationSets ?? [],
);
const templates = mine(
  ((await ses.send(new ListEmailTemplatesCommand({}))).TemplatesMetadata ?? []).map(
    (item) => item.TemplateName,
  ),
);
// Hộp thư không có tên: lọc theo Source, xóa theo id
const mailbox = (await (await fetch(`${consoleUrl}/aws/_aws/ses`)).json()).messages ?? [];
const emails = mailbox
  .filter((mail) => PREFIXES.some((prefix) => mail.Source?.startsWith(prefix)))
  .map((mail) => mail.Id)
  .filter(Boolean);

// Tên topic là phần cuối của ARN
const topics = ((await sns.send(new ListTopicsCommand({}))).Topics ?? [])
  .map((topic) => topic.TopicArn)
  .filter((arn) => mine([arn?.split(":").pop()]).length);

// Rule của test trên bus default (bus của test thì xóa luôn cả bus)
const defaultRules = mine(
  ((await eventbridge.send(new ListRulesCommand({ EventBusName: "default" }))).Rules ?? []).map(
    (rule) => rule.Name,
  ),
);
const buses = mine(
  ((await eventbridge.send(new ListEventBusesCommand({}))).EventBuses ?? []).map((bus) => bus.Name),
);

// Schedule của test trên group default (group của test thì xóa luôn cả group, kéo theo schedule)
const defaultSchedules = mine(
  ((await scheduler.send(new ListSchedulesCommand({ GroupName: "default" }))).Schedules ?? []).map(
    (schedule) => schedule.Name,
  ),
);
const scheduleGroups = mine(
  ((await scheduler.send(new ListScheduleGroupsCommand({}))).ScheduleGroups ?? []).map(
    (group) => group.Name,
  ),
);

const stateMachines = ((await sfn.send(new ListStateMachinesCommand({}))).stateMachines ?? [])
  .filter((machine) => mine([machine.name]).length)
  .map((machine) => machine.stateMachineArn);

// Stack đã xóa xong (DELETE_COMPLETE) vẫn nằm trong list một lúc nên bỏ qua
const stacks = mine(
  ((await cloudformation.send(new DescribeStacksCommand({}))).Stacks ?? [])
    .filter((stack) => stack.StackStatus !== "DELETE_COMPLETE")
    .map((stack) => stack.StackName),
);

// SMS chỉ liệt kê, không xóa: Floci không xóa được từng tin, DELETE /_aws/sns xóa cả hộp thư của mọi region
const SMS_TEST_PHONE_PREFIX = "+8490000";
const smsInbox = (await (await fetch(`${consoleUrl}/aws/_aws/sns`)).json()).messages ?? [];
const texts = smsInbox
  .filter((sms) => sms.PhoneNumber?.startsWith(SMS_TEST_PHONE_PREFIX))
  .map((sms) => sms.Id)
  .filter(Boolean);

console.log(
  JSON.stringify(
    {
      buckets,
      tables,
      functions,
      queues,
      topics,
      buses,
      defaultRules,
      defaultSchedules,
      scheduleGroups,
      stateMachines,
      stacks,
      identities,
      configurationSets,
      templates,
      emails,
      texts,
    },
    null,
    2,
  ),
);

if (process.argv.includes("--delete")) {
  if (stacks.length) {
    // Xóa stack trước rồi chạy lại: xóa lẻ resource của stack thì DeleteStack lỗi DELETE_FAILED
    for (const name of stacks)
      await cloudformation.send(new DeleteStackCommand({ StackName: name }));
    execFileSync(process.execPath, [process.argv[1], "--delete"], { stdio: "inherit" });
    process.exit();
  }
  for (const bucket of buckets) {
    // Bucket phải rỗng (cả version) mới xoá được
    const { Versions = [], DeleteMarkers = [] } = await s3.send(
      new ListObjectVersionsCommand({ Bucket: bucket }),
    );
    const objects = [...Versions, ...DeleteMarkers].map(({ Key, VersionId }) => ({
      Key,
      VersionId,
    }));
    if (objects.length)
      await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects } }));
    await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
  }
  for (const table of tables) await dynamodb.send(new DeleteTableCommand({ TableName: table }));
  for (const name of functions)
    await lambda.send(new DeleteFunctionCommand({ FunctionName: name }));
  for (const url of queues) await sqs.send(new DeleteQueueCommand({ QueueUrl: url }));
  for (const arn of topics) await sns.send(new DeleteTopicCommand({ TopicArn: arn }));
  // Rule phải gỡ hết target mới xóa được
  const deleteRule = async (bus, name) => {
    const { Targets = [] } = await eventbridge.send(
      new ListTargetsByRuleCommand({ EventBusName: bus, Rule: name }),
    );
    if (Targets.length)
      await eventbridge.send(
        new RemoveTargetsCommand({
          EventBusName: bus,
          Rule: name,
          Ids: Targets.map((target) => target.Id),
        }),
      );
    await eventbridge.send(new DeleteRuleCommand({ EventBusName: bus, Name: name }));
  };
  for (const name of defaultRules) await deleteRule("default", name);
  for (const bus of buses) {
    const { Rules = [] } = await eventbridge.send(new ListRulesCommand({ EventBusName: bus }));
    for (const { Name } of Rules) await deleteRule(bus, Name);
    await eventbridge.send(new DeleteEventBusCommand({ Name: bus }));
  }
  for (const name of defaultSchedules)
    await scheduler.send(new DeleteScheduleCommand({ GroupName: "default", Name: name }));
  for (const name of scheduleGroups)
    await scheduler.send(new DeleteScheduleGroupCommand({ Name: name }));
  for (const arn of stateMachines)
    await sfn.send(new DeleteStateMachineCommand({ stateMachineArn: arn }));
  for (const name of identities)
    await ses.send(new DeleteEmailIdentityCommand({ EmailIdentity: name }));
  for (const name of configurationSets)
    await ses.send(new DeleteConfigurationSetCommand({ ConfigurationSetName: name }));
  for (const name of templates)
    await ses.send(new DeleteEmailTemplateCommand({ TemplateName: name }));
  for (const id of emails)
    await fetch(`${consoleUrl}/aws/_aws/ses?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  console.log("deleted");
}
