import { z } from "zod";
import { wholeNumberIn } from "@shared/schemas.ts";
import {
  CLUSTER_IDENTIFIER_MAX_LENGTH,
  CLUSTER_IDENTIFIER_RULE,
  IDENTIFIER_MAX_LENGTH,
  IDENTIFIER_PATTERN,
  IDENTIFIER_RULE,
  INSTANCE_CLASSES,
  INSTANCE_COUNT,
  PASSWORD_LENGTH,
  PASSWORD_PATTERN,
  PASSWORD_RULE,
  USERNAME_MAX_LENGTH,
  USERNAME_PATTERN,
  USERNAME_RULE,
} from "./constants.ts";

const identifier = (max: number, rule: string) =>
  z.string().trim().max(max, rule).regex(IDENTIFIER_PATTERN, rule);
const instanceClass = z.enum(INSTANCE_CLASSES);

export const createClusterSchema = z
  .object({
    identifier: identifier(CLUSTER_IDENTIFIER_MAX_LENGTH, CLUSTER_IDENTIFIER_RULE),
    username: z
      .string()
      .trim()
      .max(USERNAME_MAX_LENGTH, USERNAME_RULE)
      .regex(USERNAME_PATTERN, USERNAME_RULE),
    password: z
      .string()
      .min(PASSWORD_LENGTH.min, PASSWORD_RULE)
      .max(PASSWORD_LENGTH.max, PASSWORD_RULE)
      .regex(PASSWORD_PATTERN, PASSWORD_RULE),
    confirmPassword: z.string(),
    instanceClass,
    instanceCount: wholeNumberIn(INSTANCE_COUNT),
  })
  .refine((form) => form.password === form.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match.",
  });
export type CreateClusterForm = z.input<typeof createClusterSchema>;
export type NewCluster = z.output<typeof createClusterSchema>;

export const addInstanceSchema = z.object({
  identifier: identifier(IDENTIFIER_MAX_LENGTH, IDENTIFIER_RULE),
  instanceClass,
});
