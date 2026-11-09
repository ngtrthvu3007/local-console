import { z } from "zod";
import { DEFAULTS, MAX_PORT, MIN_PORT } from "./constants.ts";

const schema = z.object({
  PORT: z.coerce.number().int().min(MIN_PORT).max(MAX_PORT).default(DEFAULTS.port),
  AWS_ENDPOINT_URL: z.url().default(DEFAULTS.flociInternalUrl),
  FLOCI_PUBLIC_URL: z.url().default(DEFAULTS.flociPublicUrl),
  AWS_REGION: z.string().min(1).default(DEFAULTS.region),
  STATIC_DIR: z.string().optional(), // trống khi dev: Vite phục vụ giao diện
});

export type Config = z.infer<typeof schema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): Config {
  const result = schema.safeParse(environment);
  if (!result.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
