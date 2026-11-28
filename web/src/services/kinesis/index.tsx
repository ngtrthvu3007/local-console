import { Navigate } from "react-router";
import { IconWaveSine } from "@tabler/icons-react";
import type { ServiceDefinition } from "../../registry.ts";
import { lazyPage } from "@shared/lazyPage.ts";
import { KINESIS_ROUTE_PATTERNS, KINESIS_SERVICE_ID, kinesisRoutes } from "./routes.ts";

export const kinesisService: ServiceDefinition = {
  id: KINESIS_SERVICE_ID,
  name: "Kinesis",
  fullName: "Amazon Kinesis Data Streams",
  description: "Data streams: view records by shard, put test records, Lambda triggers",
  icon: IconWaveSine,
  category: "integration",
  navigation: [{ text: "Data streams", href: kinesisRoutes.streams }],
  routes: [
    { index: true, element: <Navigate to={kinesisRoutes.streams} replace /> },
    {
      path: KINESIS_ROUTE_PATTERNS.streams,
      ...lazyPage(() => import("./pages/StreamList.tsx"), "StreamList"),
    },
    {
      path: KINESIS_ROUTE_PATTERNS.createStream,
      ...lazyPage(() => import("./pages/CreateStream.tsx"), "CreateStream"),
    },
    {
      path: KINESIS_ROUTE_PATTERNS.stream,
      ...lazyPage(() => import("./pages/StreamDetail.tsx"), "StreamDetail"),
    },
  ],
};
