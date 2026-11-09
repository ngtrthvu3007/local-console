import { useForm, type DefaultValues, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

// Form của react-hook-form validate bằng schema zod.
// Chỉ báo lỗi sau lần submit đầu, rồi cập nhật theo từng lần gõ. Không báo khi rời ô nhập,
// vì Cloudscape Modal tự chuyển focus lúc mở làm ô autoFocus bị "rời" và báo lỗi ngay.
export function useZodForm<TInput extends FieldValues, TOutput extends FieldValues>(
  schema: z.ZodType<TOutput, TInput>,
  defaultValues: DefaultValues<TInput>,
) {
  return useForm<TInput, unknown, TOutput>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
}
