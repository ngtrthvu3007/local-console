import { generatePath } from "react-router";
import { withTab } from "@shared/routes.ts";

export const KINESIS_SERVICE_ID = "kinesis";
const KINESIS_ROOT = `/${KINESIS_SERVICE_ID}`;

export const STREAM_TABS = {
  dataViewer: "data-viewer",
  configuration: "configuration",
  lambdaTriggers: "lambda-triggers",
} as const;
export type StreamTab = (typeof STREAM_TABS)[keyof typeof STREAM_TABS];

// Đường dẫn tương đối khai báo route của react-router; link đầy đủ dựng từ đây
export const KINESIS_ROUTE_PATTERNS = {
  streams: "streams",
  createStream: "streams/create",
  stream: "streams/:streamName",
} as const;

const fullPath = (pattern: string) => `${KINESIS_ROOT}/${pattern}`;

export const kinesisRoutes = {
  streams: fullPath(KINESIS_ROUTE_PATTERNS.streams),
  createStream: fullPath(KINESIS_ROUTE_PATTERNS.createStream),
  // Tab mặc định (Data viewer) không ghi lên URL
  stream: (streamName: string, tab?: StreamTab) =>
    withTab(
      generatePath(fullPath(KINESIS_ROUTE_PATTERNS.stream), { streamName }),
      tab,
      STREAM_TABS.dataViewer,
    ),
};

export const kinesisBaseCrumbs = [
  { text: "Amazon Kinesis", href: kinesisRoutes.streams },
  { text: "Data streams", href: kinesisRoutes.streams },
];

export const streamCrumbs = (streamName: string) => [
  ...kinesisBaseCrumbs,
  { text: streamName, href: kinesisRoutes.stream(streamName) },
];
