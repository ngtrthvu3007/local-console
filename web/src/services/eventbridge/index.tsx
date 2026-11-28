import { Navigate } from "react-router";
import { IconCalendarEvent } from "@tabler/icons-react";
import type { ServiceDefinition } from "../../registry.ts";
import { lazyPage } from "@shared/lazyPage.ts";
import {
  EVENTBRIDGE_ROUTE_PATTERNS,
  EVENTBRIDGE_SERVICE_ID,
  eventbridgeRoutes,
} from "@localconsole/core/eventbridge";

export const eventbridgeService: ServiceDefinition = {
  id: EVENTBRIDGE_SERVICE_ID,
  name: "EventBridge",
  fullName: "Amazon EventBridge",
  description: "Event buses: send events, route them with rules and schedules",
  icon: IconCalendarEvent,
  category: "integration",
  navigation: [
    { text: "Event buses", href: eventbridgeRoutes.buses },
    { text: "Rules", href: eventbridgeRoutes.rules() },
    { text: "Schedules", href: eventbridgeRoutes.schedules() },
  ],
  routes: [
    { index: true, element: <Navigate to={eventbridgeRoutes.buses} replace /> },
    {
      path: EVENTBRIDGE_ROUTE_PATTERNS.buses,
      ...lazyPage(() => import("./pages/BusList.tsx"), "BusList"),
    },
    {
      path: EVENTBRIDGE_ROUTE_PATTERNS.rules,
      ...lazyPage(() => import("./pages/RuleList.tsx"), "RuleList"),
    },
    {
      path: EVENTBRIDGE_ROUTE_PATTERNS.createRule,
      ...lazyPage(() => import("./pages/RuleForm.tsx"), "RuleForm"),
    },
    {
      path: EVENTBRIDGE_ROUTE_PATTERNS.rule,
      ...lazyPage(() => import("./pages/RuleDetail.tsx"), "RuleDetail"),
    },
    {
      path: EVENTBRIDGE_ROUTE_PATTERNS.editRule,
      ...lazyPage(() => import("./pages/RuleForm.tsx"), "RuleForm"),
    },
    {
      path: EVENTBRIDGE_ROUTE_PATTERNS.schedules,
      ...lazyPage(() => import("./pages/ScheduleList.tsx"), "ScheduleList"),
    },
    {
      path: EVENTBRIDGE_ROUTE_PATTERNS.createSchedule,
      ...lazyPage(() => import("./pages/ScheduleForm.tsx"), "ScheduleForm"),
    },
    {
      path: EVENTBRIDGE_ROUTE_PATTERNS.schedule,
      ...lazyPage(() => import("./pages/ScheduleDetail.tsx"), "ScheduleDetail"),
    },
    {
      path: EVENTBRIDGE_ROUTE_PATTERNS.editSchedule,
      ...lazyPage(() => import("./pages/ScheduleForm.tsx"), "ScheduleForm"),
    },
  ],
};
