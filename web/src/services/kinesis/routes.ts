import { kinesisRoutes } from "@localconsole/core/kinesis";

export const kinesisBaseCrumbs = [
  { text: "Amazon Kinesis", href: kinesisRoutes.streams },
  { text: "Data streams", href: kinesisRoutes.streams },
];

export const streamCrumbs = (streamName: string) => [
  ...kinesisBaseCrumbs,
  { text: streamName, href: kinesisRoutes.stream(streamName) },
];
