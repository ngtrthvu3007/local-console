import { generatePath } from "react-router";
import { withTab } from "@shared/routes.ts";

export const EC2_SERVICE_ID = "ec2";
const EC2_ROOT = `/${EC2_SERVICE_ID}`;

export const INSTANCE_TABS = { details: "details", userData: "user-data" } as const;
export type InstanceTab = (typeof INSTANCE_TABS)[keyof typeof INSTANCE_TABS];

// Đường dẫn tương đối khai báo route của react-router; link đầy đủ dựng từ đây
export const EC2_ROUTE_PATTERNS = {
  instances: "instances",
  launchInstance: "instances/launch",
  instance: "instances/:instanceId",
} as const;

const fullPath = (pattern: string) => `${EC2_ROOT}/${pattern}`;

export const ec2Routes = {
  instances: fullPath(EC2_ROUTE_PATTERNS.instances),
  launchInstance: fullPath(EC2_ROUTE_PATTERNS.launchInstance),
  // Tab mặc định (Details) không ghi lên URL
  instance: (instanceId: string, tab?: InstanceTab) =>
    withTab(
      generatePath(fullPath(EC2_ROUTE_PATTERNS.instance), { instanceId }),
      tab,
      INSTANCE_TABS.details,
    ),
};

export const ec2BaseCrumbs = [
  { text: "Amazon EC2", href: ec2Routes.instances },
  { text: "Instances", href: ec2Routes.instances },
];

export const instanceCrumbs = (instanceId: string) => [
  ...ec2BaseCrumbs,
  { text: instanceId, href: ec2Routes.instance(instanceId) },
];
