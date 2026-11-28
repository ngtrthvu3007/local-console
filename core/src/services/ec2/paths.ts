import { fillPath, withTab } from "#shared/utils/paths.ts";

export const EC2_SERVICE_ID = "ec2";
const EC2_ROOT = `/${EC2_SERVICE_ID}`;

export const INSTANCE_TABS = { details: "details", userData: "user-data" } as const;
export type InstanceTab = (typeof INSTANCE_TABS)[keyof typeof INSTANCE_TABS];

export const EC2_ROUTE_PATTERNS = {
  instances: "instances",
  launchInstance: "instances/launch",
  instance: "instances/:instanceId",
} as const;

const fullPath = (pattern: string) => `${EC2_ROOT}/${pattern}`;

export const ec2Routes = {
  instances: fullPath(EC2_ROUTE_PATTERNS.instances),
  launchInstance: fullPath(EC2_ROUTE_PATTERNS.launchInstance),
  instance: (instanceId: string, tab?: InstanceTab) =>
    withTab(
      fillPath(fullPath(EC2_ROUTE_PATTERNS.instance), { instanceId }),
      tab,
      INSTANCE_TABS.details,
    ),
};
