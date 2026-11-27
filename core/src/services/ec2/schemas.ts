import { z } from "zod";
import { byteLength } from "#shared/utils/format.ts";
import { INSTANCE_TYPES, NAME_MAX_LENGTH, USER_DATA_MAX_BYTES } from "./constants.ts";

export const launchInstanceSchema = z.object({
  name: z.string().trim().max(NAME_MAX_LENGTH, `Must be at most ${NAME_MAX_LENGTH} characters.`),
  imageId: z.string().min(1, "Choose an AMI."),
  instanceType: z.enum(INSTANCE_TYPES),
  userData: z
    .string()
    .refine(
      (text) => byteLength(text) <= USER_DATA_MAX_BYTES,
      `Must be at most ${USER_DATA_MAX_BYTES} bytes.`,
    ),
});

export type LaunchInstanceForm = z.input<typeof launchInstanceSchema>;
export type NewInstance = z.output<typeof launchInstanceSchema>;
