import { ARN_SEPARATOR } from "@shared/arn.ts";
import { streamNameOfArn } from "../kinesis/recordData.ts";
import { DOCDB_LOG_GROUP_PREFIX } from "../docdb/constants.ts";
import { docdbRoutes } from "../docdb/routes.ts";
import { ELASTICACHE_LOG_GROUP_PREFIX } from "../elasticache/constants.ts";
import { elasticacheRoutes } from "../elasticache/routes.ts";
import { LOG_GROUP_PREFIX } from "../lambda/constants.ts";
import { functionNameOfArn } from "../lambda/helpers.ts";
import { lambdaRoutes } from "../lambda/routes.ts";
import { MQ_LOG_GROUP_PREFIX } from "../mq/constants.ts";
import { mqRoutes } from "../mq/routes.ts";
import { RDS_LOG_GROUP_PREFIX } from "../rds/constants.ts";
import { rdsRoutes } from "../rds/routes.ts";

interface LogSource {
  label: "Function" | "Database" | "Cluster" | "Broker";
  name: string;
  href: string;
}

const SEGMENT_SEPARATOR = "/";
const wholeRest = (rest: string) => rest;
// <prefix><id>/<loại log>: id là đoạn đầu
const firstSegment = (rest: string) => rest.split(SEGMENT_SEPARATOR)[0];

// Chỉ tách tên, không gọi API: resource không còn thì trang đích tự báo not found
const SOURCES: {
  prefix: string;
  label: LogSource["label"];
  nameOf: (rest: string) => string;
  href: (name: string) => string;
}[] = [
  { prefix: LOG_GROUP_PREFIX, label: "Function", nameOf: wholeRest, href: lambdaRoutes.function },
  {
    prefix: RDS_LOG_GROUP_PREFIX,
    label: "Database",
    nameOf: firstSegment,
    href: rdsRoutes.database,
  },
  {
    prefix: DOCDB_LOG_GROUP_PREFIX,
    label: "Cluster",
    nameOf: firstSegment,
    href: docdbRoutes.cluster,
  },
  {
    prefix: ELASTICACHE_LOG_GROUP_PREFIX,
    label: "Cluster",
    nameOf: firstSegment,
    href: elasticacheRoutes.cluster,
  },
  { prefix: MQ_LOG_GROUP_PREFIX, label: "Broker", nameOf: firstSegment, href: mqRoutes.broker },
];

export function logSourceOf(group: string): LogSource | undefined {
  const source = SOURCES.find(({ prefix }) => group.startsWith(prefix));
  if (!source) return undefined;

  const name = source.nameOf(group.slice(source.prefix.length));
  return name ? { label: source.label, name, href: source.href(name) } : undefined;
}

export interface Destination {
  kind: "lambda" | "kinesis" | "other";
  name: string;
}

// Service nằm ở đoạn thứ 3 của ARN: arn:aws:<service>:…
const ARN_SERVICE_INDEX = 2;

// Đích của subscription filter: Lambda / Kinesis có trang để link, đích khác hiện nguyên ARN
export function destinationOf(arn: string): Destination {
  const service = arn.split(ARN_SEPARATOR)[ARN_SERVICE_INDEX];
  if (service === "lambda") return { kind: "lambda", name: functionNameOfArn(arn) };
  if (service === "kinesis") return { kind: "kinesis", name: streamNameOfArn(arn) };
  return { kind: "other", name: arn };
}
