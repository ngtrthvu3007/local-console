// Resource lc-it-* / lc-e2e-* còn sót trong Floci sau khi chạy test.
//   node it/leftovers.mjs            liệt kê
//   node it/leftovers.mjs --delete   xoá (chỉ resource có tiền tố của test)
import { S3Client, ListBucketsCommand, ListObjectVersionsCommand, DeleteObjectsCommand, DeleteBucketCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, ListTablesCommand, DeleteTableCommand } from "@aws-sdk/client-dynamodb";
import { LambdaClient, ListFunctionsCommand, DeleteFunctionCommand } from "@aws-sdk/client-lambda";
import { SESv2Client, ListEmailIdentitiesCommand, ListEmailTemplatesCommand, DeleteEmailIdentityCommand, DeleteEmailTemplateCommand } from "@aws-sdk/client-sesv2";
import { SQSClient, ListQueuesCommand, DeleteQueueCommand } from "@aws-sdk/client-sqs";
import { SNSClient, ListTopicsCommand, DeleteTopicCommand } from "@aws-sdk/client-sns";

const consoleUrl = process.env.LOCAL_CONSOLE_URL ?? "http://localhost:3701";
const { region } = await (await fetch(`${consoleUrl}/api/config`)).json();
const config = { region, endpoint: `${consoleUrl}/aws`, credentials: { accessKeyId: "test", secretAccessKey: "test" } };
// IT dùng lc-it-, e2e dùng lc-e2e-
const PREFIXES = ["lc-it-", "lc-e2e-"];
const mine = (names) => names.filter((name) => PREFIXES.some((prefix) => name?.startsWith(prefix)));

const s3 = new S3Client({ ...config, forcePathStyle: true });
const dynamodb = new DynamoDBClient(config);
const lambda = new LambdaClient(config);
const sqs = new SQSClient(config);
const sns = new SNSClient(config);
const ses = new SESv2Client(config);

const buckets = mine(((await s3.send(new ListBucketsCommand({}))).Buckets ?? []).map((bucket) => bucket.Name));
const tables = mine((await dynamodb.send(new ListTablesCommand({}))).TableNames ?? []);
const functions = mine(((await lambda.send(new ListFunctionsCommand({}))).Functions ?? []).map((fn) => fn.FunctionName));
const queues = [];
for (const prefix of PREFIXES) {
  queues.push(...((await sqs.send(new ListQueuesCommand({ QueueNamePrefix: prefix }))).QueueUrls ?? []));
}
const identities = mine(((await ses.send(new ListEmailIdentitiesCommand({}))).EmailIdentities ?? []).map((item) => item.IdentityName));
const templates = mine(((await ses.send(new ListEmailTemplatesCommand({}))).TemplatesMetadata ?? []).map((item) => item.TemplateName));
// Hộp thư không có tên: lọc theo Source, xóa theo id
const mailbox = (await (await fetch(`${consoleUrl}/aws/_aws/ses`)).json()).messages ?? [];
const emails = mailbox.filter((mail) => PREFIXES.some((prefix) => mail.Source?.startsWith(prefix))).map((mail) => mail.Id).filter(Boolean);

// Tên topic là phần cuối của ARN
const topics = ((await sns.send(new ListTopicsCommand({}))).Topics ?? [])
  .map((topic) => topic.TopicArn)
  .filter((arn) => mine([arn?.split(":").pop()]).length);

// SMS chỉ liệt kê, không xóa: Floci không xóa được từng tin, DELETE /_aws/sns xóa cả hộp thư của mọi region
const SMS_TEST_PHONE_PREFIX = "+8490000";
const smsInbox = (await (await fetch(`${consoleUrl}/aws/_aws/sns`)).json()).messages ?? [];
const texts = smsInbox.filter((sms) => sms.PhoneNumber?.startsWith(SMS_TEST_PHONE_PREFIX)).map((sms) => sms.Id).filter(Boolean);

console.log(JSON.stringify({ buckets, tables, functions, queues, topics, identities, templates, emails, texts }, null, 2));

if (process.argv.includes("--delete")) {
  for (const bucket of buckets) {
    // Bucket phải rỗng (cả version) mới xoá được
    const { Versions = [], DeleteMarkers = [] } = await s3.send(new ListObjectVersionsCommand({ Bucket: bucket }));
    const objects = [...Versions, ...DeleteMarkers].map(({ Key, VersionId }) => ({ Key, VersionId }));
    if (objects.length) await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects } }));
    await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
  }
  for (const table of tables) await dynamodb.send(new DeleteTableCommand({ TableName: table }));
  for (const name of functions) await lambda.send(new DeleteFunctionCommand({ FunctionName: name }));
  for (const url of queues) await sqs.send(new DeleteQueueCommand({ QueueUrl: url }));
  for (const arn of topics) await sns.send(new DeleteTopicCommand({ TopicArn: arn }));
  for (const name of identities) await ses.send(new DeleteEmailIdentityCommand({ EmailIdentity: name }));
  for (const name of templates) await ses.send(new DeleteEmailTemplateCommand({ TemplateName: name }));
  for (const id of emails) await fetch(`${consoleUrl}/aws/_aws/ses?id=${encodeURIComponent(id)}`, { method: "DELETE" });  console.log("deleted");
}
