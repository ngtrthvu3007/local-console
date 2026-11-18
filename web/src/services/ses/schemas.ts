import { z } from "zod";

export const addEmailSchema = z.object({
  email: z.string().trim().pipe(z.email("Enter a valid email address.")),
});
export type AddEmailForm = z.infer<typeof addEmailSchema>;
