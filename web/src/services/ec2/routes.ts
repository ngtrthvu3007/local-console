import { ec2Routes } from "@localconsole/core/ec2";

export const ec2BaseCrumbs = [
  { text: "Amazon EC2", href: ec2Routes.instances },
  { text: "Instances", href: ec2Routes.instances },
];

export const instanceCrumbs = (instanceId: string) => [
  ...ec2BaseCrumbs,
  { text: instanceId, href: ec2Routes.instance(instanceId) },
];
