import type { RouteObject } from "react-router";
import type { Icon } from "@tabler/icons-react";
import type { ServiceCategory } from "@shared/constants.ts";
import { appsyncService } from "./services/appsync/index.tsx";
import { cloudformationService } from "./services/cloudformation/index.tsx";
import { cloudfrontService } from "./services/cloudfront/index.tsx";
import { cognitoService } from "./services/cognito/index.tsx";
import { dynamodbService } from "./services/dynamodb/index.tsx";
import { ec2Service } from "./services/ec2/index.tsx";
import { ecsService } from "./services/ecs/index.tsx";
import { elasticacheService } from "./services/elasticache/index.tsx";
import { eventbridgeService } from "./services/eventbridge/index.tsx";
import { kinesisService } from "./services/kinesis/index.tsx";
import { kmsService } from "./services/kms/index.tsx";
import { lambdaService } from "./services/lambda/index.tsx";
import { mqService } from "./services/mq/index.tsx";
import { rdsService } from "./services/rds/index.tsx";
import { s3Service } from "./services/s3/index.tsx";
import { secretsManagerService } from "./services/secretsmanager/index.tsx";
import { sesService } from "./services/ses/index.tsx";
import { snsService } from "./services/sns/index.tsx";
import { sqsService } from "./services/sqs/index.tsx";
import { ssmService } from "./services/ssm/index.tsx";
import { stepfunctionsService } from "./services/stepfunctions/index.tsx";

interface ServiceLink {
  text: string;
  href: string;
}

// Thêm service = thêm một phần tử. Sidebar, router và ô search đều đọc từ đây
export interface ServiceDefinition {
  id: string; // đường dẫn: /<id>
  name: string; // tên ngắn, vd: "S3"
  fullName: string; // vd: "Amazon S3"
  description: string;
  icon: Icon; // glyph Tabler, vd: IconBucket; nằm trên ô màu của category
  category: ServiceCategory; // nhóm trên sidebar
  navigation: ServiceLink[]; // menu con trên sidebar
  routes: RouteObject[];
}

export const services: ServiceDefinition[] = [
  s3Service,
  lambdaService,
  ec2Service,
  ecsService,
  dynamodbService,
  rdsService,
  cloudfrontService,
  sqsService,
  snsService,
  kinesisService,
  eventbridgeService,
  appsyncService,
  stepfunctionsService,
  cloudformationService,
  elasticacheService,
  mqService,
  sesService,
  cognitoService,
  secretsManagerService,
  kmsService,
  ssmService,
];

export const servicePath = (service: ServiceDefinition) => `/${service.id}`;
