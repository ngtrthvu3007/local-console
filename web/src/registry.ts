import type { RouteObject } from "react-router";
import { dynamodbService } from "./services/dynamodb/index.tsx";
import { elasticacheService } from "./services/elasticache/index.tsx";
import { lambdaService } from "./services/lambda/index.tsx";
import { mqService } from "./services/mq/index.tsx";
import { s3Service } from "./services/s3/index.tsx";

export interface ServiceLink {
  text: string;
  href: string;
}

export interface ResourceCount {
  count?: number;
  noun: string; // số ít, vd: "bucket"
}

// Thêm service = thêm một phần tử. Sidebar, router và Home đều đọc từ đây.
export interface ServiceDefinition {
  id: string; // đường dẫn: /<id>
  name: string; // tên ngắn, vd: "S3"
  fullName: string; // vd: "Amazon S3"
  description: string;
  iconPath: string; // file trong web/public/icons
  navigation: ServiceLink[]; // menu con trên sidebar
  quickLinks: ServiceLink[]; // link nhanh trên Home
  routes: RouteObject[];
  useResourceCount?: () => ResourceCount;
}

export const services: ServiceDefinition[] = [
  s3Service,
  lambdaService,
  dynamodbService,
  elasticacheService,
  mqService,
];

export const servicePath = (service: ServiceDefinition) => `/${service.id}`;
