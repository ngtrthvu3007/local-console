import { z } from "zod";
import { STACK_NAME_MAX_LENGTH, STACK_NAME_PATTERN } from "./constants.ts";

const stackName = z
  .string()
  .trim()
  .regex(STACK_NAME_PATTERN, "Start with a letter; use only letters, numbers and hyphens (-).")
  .max(STACK_NAME_MAX_LENGTH, `Must be at most ${STACK_NAME_MAX_LENGTH} characters.`);

// Khi sửa không kiểm tên: stack tạo bên ngoài có thể mang tên Floci nhận nhưng AWS không nhận.
// Template chỉ kiểm không rỗng, gửi đi nguyên văn
export const stackTemplateSchema = (editing: boolean) =>
  z.object({
    name: editing ? z.string() : stackName,
    template: z.string().refine((text) => text.trim().length > 0, "Enter a template."),
  });

export type StackTemplateForm = z.input<ReturnType<typeof stackTemplateSchema>>;
