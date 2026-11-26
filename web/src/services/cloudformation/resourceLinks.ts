import { ARN_SEPARATOR, lastArnPart } from "@shared/arn.ts";
import { API_TABS, appsyncRoutes } from "../appsync/routes.ts";
import { cloudfrontRoutes } from "../cloudfront/routes.ts";
import { cognitoRoutes } from "../cognito/routes.ts";
import { eventbridgeRoutes } from "../eventbridge/routes.ts";
import { dynamodbRoutes } from "../dynamodb/routes.ts";
import { ec2Routes } from "../ec2/routes.ts";
import { serviceRefOf, taskDefinitionRefOf } from "../ecs/arns.ts";
import { ecsRoutes } from "../ecs/routes.ts";
import { elasticacheRoutes } from "../elasticache/routes.ts";
import { kinesisRoutes } from "../kinesis/routes.ts";
import { kmsRoutes } from "../kms/routes.ts";
import { functionNameOfArn } from "../lambda/helpers.ts";
import { FUNCTION_TABS, lambdaRoutes } from "../lambda/routes.ts";
import { rdsRoutes } from "../rds/routes.ts";
import { s3Routes } from "../s3/routes.ts";
import { secretsRoutes } from "../secretsmanager/routes.ts";
import { sesRoutes } from "../ses/routes.ts";
import { snsRoutes } from "../sns/routes.ts";
import { sqsRoutes } from "../sqs/routes.ts";
import { ssmRoutes } from "../ssm/routes.ts";
import { queueNameOfUrl } from "../sqs/queues.ts";
import { stepfunctionsRoutes } from "../stepfunctions/routes.ts";
import { cloudformationRoutes } from "./routes.ts";

const LAMBDA_LOG_GROUP_PREFIX = "/aws/lambda/";
// ARN stack: "…:stack/<tên>/<uuid>"
const STACK_ARN_SEPARATOR = "/";
const STACK_ARN_NAME_INDEX = 1;
// ARN AppSync: "…:apis/<apiId>/types/<type>/resolvers/<field>", "…/datasources/<tên>", "…/functions/<id>"
const APPSYNC_ARN_SEPARATOR = "/";
const appsyncArnParts = (arn: string) => lastArnPart(arn).split(APPSYNC_ARN_SEPARATOR);
// Physical ID của AWS::AppSync::GraphQLSchema là "<apiId>GraphQLSchema"
const GRAPHQL_SCHEMA_SUFFIX = "GraphQLSchema";

function appsyncDataSourceHref(arn: string) {
  const [, apiId] = appsyncArnParts(arn);
  return apiId ? appsyncRoutes.api(apiId, API_TABS.dataSources) : undefined;
}

function appsyncResolverHref(arn: string) {
  const [, apiId, , typeName, , fieldName] = appsyncArnParts(arn);
  return apiId && typeName && fieldName
    ? appsyncRoutes.resolver(apiId, typeName, fieldName)
    : undefined;
}

function appsyncFunctionHref(arn: string) {
  const [, apiId, , functionId] = appsyncArnParts(arn);
  return apiId && functionId ? appsyncRoutes.function(apiId, functionId) : undefined;
}

// ARN của subscription là ARN topic + ":<uuid>"
const topicNameOfSubscriptionArn = (arn: string) =>
  arn.split(ARN_SEPARATOR).slice(-2, -1)[0] ?? arn;
export const stackNameOfArn = (arn: string) =>
  lastArnPart(arn).split(STACK_ARN_SEPARATOR)[STACK_ARN_NAME_INDEX] ?? arn;

// Chỉ link khi physical ID khớp thẳng route
const LINK_BUILDERS: Record<string, (physicalId: string) => string | undefined> = {
  "AWS::S3::Bucket": (id) => s3Routes.bucket(id),
  "AWS::CloudFront::Distribution": (id) => cloudfrontRoutes.distribution(id),
  "AWS::AppSync::GraphQLApi": (id) => appsyncRoutes.api(id),
  "AWS::AppSync::GraphQLSchema": (id) =>
    id.endsWith(GRAPHQL_SCHEMA_SUFFIX)
      ? appsyncRoutes.api(id.slice(0, -GRAPHQL_SCHEMA_SUFFIX.length))
      : undefined,
  "AWS::AppSync::DataSource": appsyncDataSourceHref,
  "AWS::AppSync::Resolver": appsyncResolverHref,
  "AWS::AppSync::FunctionConfiguration": appsyncFunctionHref,
  "AWS::Lambda::Function": (id) => lambdaRoutes.function(id),
  "AWS::Lambda::Url": (id) => lambdaRoutes.function(functionNameOfArn(id)),
  "AWS::Logs::LogGroup": (id) =>
    id.startsWith(LAMBDA_LOG_GROUP_PREFIX)
      ? lambdaRoutes.function(id.slice(LAMBDA_LOG_GROUP_PREFIX.length), FUNCTION_TABS.monitor)
      : undefined,
  "AWS::DynamoDB::Table": (id) => dynamodbRoutes.table(id),
  "AWS::SQS::Queue": (id) => sqsRoutes.queue(queueNameOfUrl(id)),
  "AWS::EC2::Instance": (id) => ec2Routes.instance(id),
  "AWS::ECS::Cluster": (name) => ecsRoutes.cluster(name),
  "AWS::ECS::Service": (arn) => {
    const ref = serviceRefOf(arn);
    return ref && ecsRoutes.service(ref.cluster, ref.service);
  },
  "AWS::ECS::TaskDefinition": (arn) => {
    const { family, revision } = taskDefinitionRefOf(arn);
    return ecsRoutes.revision(family, revision);
  },
  "AWS::ElastiCache::CacheCluster": (id) => elasticacheRoutes.cluster(id),
  "AWS::RDS::DBInstance": (id) => rdsRoutes.database(id),
  "AWS::CloudFormation::Stack": (id) => cloudformationRoutes.stack(stackNameOfArn(id)),
  "AWS::SNS::Topic": (id) => snsRoutes.topic(lastArnPart(id)),
  "AWS::SNS::Subscription": (id) => snsRoutes.topic(topicNameOfSubscriptionArn(id)),
  "AWS::SES::EmailIdentity": () => sesRoutes.identities,
  "AWS::Cognito::UserPool": (id) => cognitoRoutes.pool(id),
  "AWS::SecretsManager::Secret": (id) => secretsRoutes.secretOfArn(id),
  "AWS::SSM::Parameter": (id) => ssmRoutes.parameter(id),
  "AWS::KMS::Key": (id) => kmsRoutes.key(id),
  "AWS::Kinesis::Stream": (name) => kinesisRoutes.stream(name),
  "AWS::KMS::Alias": (name) => kmsRoutes.key(name),
  "AWS::Events::EventBus": (id) => eventbridgeRoutes.rules(id),
  "AWS::StepFunctions::StateMachine": (id) => stepfunctionsRoutes.stateMachine(lastArnPart(id)),
};

export const resourceHref = (type: string, physicalId: string): string | undefined =>
  LINK_BUILDERS[type]?.(physicalId);
