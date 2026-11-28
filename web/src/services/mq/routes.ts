import { mqRoutes } from "@localconsole/core/mq";

export const mqBaseCrumbs = [
  { text: "Amazon MQ", href: mqRoutes.brokers },
  { text: "Brokers", href: mqRoutes.brokers },
];

export const brokerCrumbs = (broker: string, name: string) => [
  ...mqBaseCrumbs,
  { text: name, href: mqRoutes.broker(broker) },
];
