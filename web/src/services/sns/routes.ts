import { snsRoutes } from "@localconsole/core/sns";

export const snsBaseCrumbs = [
  { text: "Amazon SNS", href: snsRoutes.topics },
  { text: "Topics", href: snsRoutes.topics },
];

export const smsCrumbs = [
  { text: "Amazon SNS", href: snsRoutes.topics },
  { text: "Text messaging (SMS)", href: snsRoutes.sms },
];

export const topicCrumbs = (topic: string) => [
  ...snsBaseCrumbs,
  { text: topic, href: snsRoutes.topic(topic) },
];
