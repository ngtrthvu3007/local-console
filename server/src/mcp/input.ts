import { z } from "zod";
import { LIST_METHOD, MCP_PAGE_SIZE } from "./constants.ts";

const OFFSET_PATTERN = /^\d+$/;

export const pageShape = {
  limit: z.int().min(1).max(MCP_PAGE_SIZE).optional().describe("Items per page."),
  nextToken: z
    .string()
    .regex(OFFSET_PATTERN, "Use the nextToken of the previous page.")
    .optional()
    .describe("nextToken of the previous page."),
};

// Tool đọc gom theo method: mọi method trừ list cần định danh (handler dùng key! nhờ bước này)
export const requiredUnlessList =
  (key: string) =>
  (values: { method: string } & Record<string, unknown>, context: z.RefinementCtx) => {
    if (values.method !== LIST_METHOD && !values[key])
      context.addIssue({
        code: "custom",
        path: [key],
        message: `Enter ${key} for method "${values.method}".`,
      });
  };

// Schema form của core + mặc định như form UI (agent chỉ gửi trường cần đổi) + định danh form không có.
// prefault: mặc định ở phía input nên vẫn qua transform và refinement của form, câu lỗi giữ nguyên
export function formInput<S extends z.ZodObject, E extends z.ZodRawShape>(
  schema: S,
  defaults: Partial<z.input<S>>,
  extra: E,
) {
  const base: z.ZodObject = schema;
  const prefaulted = Object.fromEntries(
    Object.entries(defaults).map(([key, value]) => [key, base.shape[key].prefault(value)]),
  );
  const extended = base.safeExtend({ ...extra, ...prefaulted });

  // Shape tính lúc chạy nên TypeScript mất kiểu; prefault không đổi output nên output vẫn là form + extra
  return extended as unknown as z.ZodType<z.output<S> & z.output<z.ZodObject<E>>>;
}
