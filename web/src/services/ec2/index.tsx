import { Navigate } from "react-router";
import { IconCpu } from "@tabler/icons-react";
import type { ServiceDefinition } from "../../registry.ts";
import { lazyPage } from "@shared/lazyPage.ts";
import { EC2_ROUTE_PATTERNS, EC2_SERVICE_ID, ec2Routes } from "./routes.ts";

export const ec2Service: ServiceDefinition = {
  id: EC2_SERVICE_ID,
  name: "EC2",
  fullName: "Amazon EC2",
  description: "Instances as containers: launch with user data, stop, start, reboot, terminate",
  icon: IconCpu,
  category: "compute",
  navigation: [{ text: "Instances", href: ec2Routes.instances }],
  routes: [
    { index: true, element: <Navigate to={ec2Routes.instances} replace /> },
    {
      path: EC2_ROUTE_PATTERNS.instances,
      ...lazyPage(() => import("./pages/InstanceList.tsx"), "InstanceList"),
    },
    {
      path: EC2_ROUTE_PATTERNS.launchInstance,
      ...lazyPage(() => import("./pages/LaunchInstance.tsx"), "LaunchInstance"),
    },
    {
      path: EC2_ROUTE_PATTERNS.instance,
      ...lazyPage(() => import("./pages/InstanceDetail.tsx"), "InstanceDetail"),
    },
  ],
};
