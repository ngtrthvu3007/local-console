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
  CognitoIdentityProviderClient,
  ListUserPoolsCommand,
  DescribeUserPoolCommand,
  DeleteUserPoolDomainCommand,
  DeleteUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  SecretsManagerClient,
  paginateListSecrets,
  DeleteSecretCommand,
} from "@aws-sdk/client-secrets-manager";
import {
  RDSClient,
  paginateDescribeDBInstances,
  DeleteDBInstanceCommand,
} from "@aws-sdk/client-rds";
import {
  SSMClient,
  paginateDescribeParameters,
  DeleteParametersCommand,
} from "@aws-sdk/client-ssm";
import {
  EventBridgeClient,
  ListEventBusesCommand,
  ListRulesCommand,
  ListTargetsByRuleCommand,
  RemoveTargetsCommand,
  DeleteRuleCommand,
  DeleteEventBusCommand,
} from "@aws-sdk/client-eventbridge";
import {
  APIGatewayClient,
  GetRestApisCommand,
  DeleteRestApiCommand,
} from "@aws-sdk/client-api-gateway";
import { ApiGatewayV2Client, GetApisCommand, DeleteApiCommand } from "@aws-sdk/client-apigatewayv2";

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
const cognito = new CognitoIdentityProviderClient(config);
const secretsManager = new SecretsManagerClient(config);
const ssm = new SSMClient(config);
const rds = new RDSClient(config);
const apigateway = new APIGatewayClient(config);
const apigatewayV2 = new ApiGatewayV2Client(config);

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
// Hộp thư không có tên: lọc theo Source hoặc người nhận (thư Cognito gửi từ From mặc định), xóa theo id
const mailbox = (await (await fetch(`${consoleUrl}/aws/_aws/ses`)).json()).messages ?? [];
const emails = mailbox
  .filter((mail) =>
    PREFIXES.some(
      (prefix) =>
        mail.Source?.startsWith(prefix) ||
        mail.Destination?.ToAddresses?.some((to) => to.startsWith(prefix)),
    ),
  )
  .map((mail) => mail.Id)
  .filter(Boolean);

// Tên topic là phần cuối của ARN
const topics = ((await sns.send(new ListTopicsCommand({}))).Topics ?? [])
  .map((topic) => topic.TopicArn)
  .filter((arn) => mine([arn?.split(":").pop()]).length);

// Floci không trả NextToken cho ListUserPools: một trang tối đa là đủ
const LIST_POOLS_PAGE_SIZE = 60;
const pools = (
  (await cognito.send(new ListUserPoolsCommand({ MaxResults: LIST_POOLS_PAGE_SIZE }))).UserPools ??
  []
)
  .filter((pool) => mine([pool.Name]).length)
  .map((pool) => pool.Id);

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

// Secret đang chờ xóa vẫn giữ tên (tạo lại cùng tên lỗi) nên tính cả
const secrets = [];
for await (const page of paginateListSecrets(
  { client: secretsManager },
  { IncludePlannedDeletion: true },
)) {
  secrets.push(...mine((page.SecretList ?? []).map((secret) => secret.Name)));
}
// Tên parameter dạng path bắt đầu bằng "/": bỏ "/" đầu rồi so tiền tố
const parameters = [];
for await (const page of paginateDescribeParameters({ client: ssm }, {})) {
  parameters.push(
    ...(page.Parameters ?? [])
      .map((parameter) => parameter.Name)
      .filter((name) => mine([name?.replace(/^\//, "")]).length),
  );
}
// Volume Docker của DB đã xóa vẫn còn (Floci hybrid): xóa tay bằng docker volume rm nếu cần
const databases = [];
for await (const page of paginateDescribeDBInstances({ client: rds }, {})) {
  databases.push(
    ...mine((page.DBInstances ?? []).map((database) => database.DBInstanceIdentifier)),
  );
}
// Floci 2.4.0 trả hết một lượt, không cần phân trang (REST: limit mặc định 25 nên đặt cao)
const API_LIST_LIMIT = 500;
const restApis = (
  (await apigateway.send(new GetRestApisCommand({ limit: API_LIST_LIMIT }))).items ?? []
)
  .filter((api) => mine([api.name]).length)
  .map((api) => api.id);
const httpApis = ((await apigatewayV2.send(new GetApisCommand({}))).Items ?? [])
  .filter((api) => mine([api.Name]).length)
  .map((api) => api.ApiId);
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
      pools,
      buses,
      defaultRules,
      defaultSchedules,
      scheduleGroups,
      stateMachines,
      stacks,
      secrets,
      parameters,
      databases,
      restApis,
      httpApis,
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
  // Pool còn domain thì Floci không cho xóa: xóa domain trước
  for (const id of pools) {
    const { UserPool } = await cognito.send(new DescribeUserPoolCommand({ UserPoolId: id }));
    if (UserPool?.Domain)
      await cognito.send(
        new DeleteUserPoolDomainCommand({ UserPoolId: id, Domain: UserPool.Domain }),
      );
    await cognito.send(new DeleteUserPoolCommand({ UserPoolId: id }));
  }
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
  for (const name of secrets) {
    await secretsManager.send(
      new DeleteSecretCommand({ SecretId: name, ForceDeleteWithoutRecovery: true }),
    );
  }
  // DeleteParameters nhận tối đa 10 tên một lần
  for (let start = 0; start < parameters.length; start += 10)
    await ssm.send(new DeleteParametersCommand({ Names: parameters.slice(start, start + 10) }));
  for (const id of databases)
    await rds.send(
      new DeleteDBInstanceCommand({ DBInstanceIdentifier: id, SkipFinalSnapshot: true }),
    );
  for (const id of restApis) await apigateway.send(new DeleteRestApiCommand({ restApiId: id }));
  for (const id of httpApis) await apigatewayV2.send(new DeleteApiCommand({ ApiId: id }));
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
