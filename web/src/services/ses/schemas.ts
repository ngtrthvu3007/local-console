import { z } from "zod";
import {
  CONFIGURATION_SET_NAME_MAX_LENGTH,
  CONFIGURATION_SET_NAME_PATTERN,
  DESTINATION_KIND_LABELS,
  EVENT_TYPE_LABELS,
  type AddableEventType,
  type DestinationKind,
} from "./constants.ts";

export const addEmailSchema = z.object({
  email: z.string().trim().pipe(z.email("Enter a valid email address.")),
});
export type AddEmailForm = z.infer<typeof addEmailSchema>;

// Tên configuration set và tên event destination chung một luật
const nameSchema = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter a ${label} name.`)
    .max(
      CONFIGURATION_SET_NAME_MAX_LENGTH,
      `Must be at most ${CONFIGURATION_SET_NAME_MAX_LENGTH} characters.`,
    )
    .regex(
      CONFIGURATION_SET_NAME_PATTERN,
      "Use only letters, numbers, hyphens (-) and underscores (_).",
    );

export const createConfigurationSetSchema = z.object({ name: nameSchema("configuration set") });

export const addDestinationSchema = z.object({
  name: nameSchema("destination"),
  eventTypes: z
    .array(z.enum(Object.keys(EVENT_TYPE_LABELS) as [AddableEventType, ...AddableEventType[]]))
    .min(1, "Choose at least one event type."),
  kind: z.enum(Object.keys(DESTINATION_KIND_LABELS) as [DestinationKind, ...DestinationKind[]]),
  arn: z.string().min(1, "Choose a resource."),
  enabled: z.boolean(),
});

// Modal "Set configuration set" của identity; rỗng = gỡ
export const setConfigurationSetSchema = z.object({ configurationSet: z.string() });
