import { generatePath } from "react-router";

export const KINESIS_SERVICE_ID = "kinesis";
const KINESIS_ROOT = `/${KINESIS_SERVICE_ID}`;

export const STREAM_TABS = {
  dataViewer: "data-viewer",
  configuration: "configuration",
  lambdaTriggers: "lambda-triggers",
} as const;
export type StreamTab = (typeof STREAM_TABS)[keyof typeof STREAM_TABS];

export const SEARCH_PARAMS = { tab: "tab" } as const;

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
  stream: (streamName: string, tab?: StreamTab) => {
    const path = generatePath(fullPath(KINESIS_ROUTE_PATTERNS.stream), { streamName });
    return tab && tab !== STREAM_TABS.dataViewer
      ? `${path}?${new URLSearchParams({ [SEARCH_PARAMS.tab]: tab })}`
      : path;
  },
};

export const kinesisBaseCrumbs = [
  { text: "Amazon Kinesis", href: kinesisRoutes.streams },
  { text: "Data streams", href: kinesisRoutes.streams },
];

export const streamCrumbs = (streamName: string) => [
  ...kinesisBaseCrumbs,
  { text: streamName, href: kinesisRoutes.stream(streamName) },
];
