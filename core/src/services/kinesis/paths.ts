import { fillPath, withTab } from "#shared/utils/paths.ts";

export const KINESIS_SERVICE_ID = "kinesis";
const KINESIS_ROOT = `/${KINESIS_SERVICE_ID}`;

export const STREAM_TABS = {
  dataViewer: "data-viewer",
  configuration: "configuration",
  lambdaTriggers: "lambda-triggers",
} as const;
export type StreamTab = (typeof STREAM_TABS)[keyof typeof STREAM_TABS];

export const KINESIS_ROUTE_PATTERNS = {
  streams: "streams",
  createStream: "streams/create",
  stream: "streams/:streamName",
} as const;

const fullPath = (pattern: string) => `${KINESIS_ROOT}/${pattern}`;

export const kinesisRoutes = {
  streams: fullPath(KINESIS_ROUTE_PATTERNS.streams),
  createStream: fullPath(KINESIS_ROUTE_PATTERNS.createStream),
  stream: (streamName: string, tab?: StreamTab) =>
    withTab(
      fillPath(fullPath(KINESIS_ROUTE_PATTERNS.stream), { streamName }),
      tab,
      STREAM_TABS.dataViewer,
    ),
};
