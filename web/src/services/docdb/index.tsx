import { Navigate } from "react-router";
import { IconLeaf } from "@tabler/icons-react";
import type { ServiceDefinition } from "../../registry.ts";
import { lazyPage } from "@shared/lazyPage.ts";
import { DOCDB_ROUTE_PATTERNS, DOCDB_SERVICE_ID, docdbRoutes } from "./routes.ts";

export const docdbService: ServiceDefinition = {
  id: DOCDB_SERVICE_ID,
  name: "DocumentDB",
  fullName: "Amazon DocumentDB",
  description: "MongoDB-compatible clusters and instances, with a connection for Compass",
  icon: IconLeaf,
  category: "database",
  navigation: [{ text: "Clusters", href: docdbRoutes.clusters }],
  routes: [
    { index: true, element: <Navigate to={docdbRoutes.clusters} replace /> },
    {
      path: DOCDB_ROUTE_PATTERNS.clusters,
      ...lazyPage(() => import("./pages/ClusterList.tsx"), "ClusterList"),
    },
    {
      path: DOCDB_ROUTE_PATTERNS.createCluster,
      ...lazyPage(() => import("./pages/CreateCluster.tsx"), "CreateCluster"),
    },
    {
      path: DOCDB_ROUTE_PATTERNS.cluster,
      ...lazyPage(() => import("./pages/ClusterDetail.tsx"), "ClusterDetail"),
    },
  ],
};
