import { z } from "zod";
import { enumOfKeys, isWholeNumberIn } from "@shared/schemas.ts";
import {
  DEFAULT_BEHAVIOR_PATH,
  ORIGIN_PROTOCOL_LABELS,
  ORIGIN_TYPES,
  PORT_RANGE,
} from "./constants.ts";

// Floci nhận cấu hình sai mà AWS từ chối (spec 7 #11): form tự chặn để URL local không trả 502

const PATH_PREFIX = "/";
// Giới hạn Comment của AWS
const DESCRIPTION_MAX_LENGTH = 128;

// AWS coi path pattern có và không có "/" đầu là một
const withoutPrefix = (path: string) =>
  path.startsWith(PATH_PREFIX) ? path.slice(PATH_PREFIX.length) : path;

const settingsShape = {
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX_LENGTH, `Use at most ${DESCRIPTION_MAX_LENGTH} characters.`),
  // AWS từ chối root object bắt đầu bằng "/", Floci thì nhận
  defaultRootObject: z
    .string()
    .trim()
    .refine((name) => !name.startsWith(PATH_PREFIX), `Don't start with ${PATH_PREFIX}.`),
  spa: z.boolean(),
};

// SPA trả root object cho 403 / 404, nên cần có root object
const spaNeedsRoot = <T extends { spa: boolean; defaultRootObject: string }>(values: T) =>
  !values.spa || Boolean(values.defaultRootObject);
const SPA_ROOT_ERROR = { path: ["spa"], message: "Set a default root object first." };

export const settingsSchema = z.object(settingsShape).refine(spaNeedsRoot, SPA_ROOT_ERROR);

export const createDistributionSchema = z
  .object({ bucket: z.string().min(1, "Choose a bucket."), ...settingsShape })
  .refine(spaNeedsRoot, SPA_ROOT_ERROR);

// Origin path: rỗng, hoặc bắt đầu "/" và không kết thúc "/" (luật AWS)
const isOriginPath = (path: string) =>
  !path || (path.startsWith(PATH_PREFIX) && !path.endsWith(PATH_PREFIX));
// Custom origin chỉ là tên host: protocol và path có field riêng
const HOST_ONLY = /^[^/:\s]+$/;

export const originSchema = (existingIds: readonly string[]) =>
  z
    .object({
      type: enumOfKeys(ORIGIN_TYPES),
      bucket: z.string(),
      domain: z.string().trim(),
      protocol: enumOfKeys(ORIGIN_PROTOCOL_LABELS),
      port: z.string().trim(),
      path: z
        .string()
        .trim()
        .refine(isOriginPath, "Start with / and don't end with /, or leave empty."),
      id: z
        .string()
        .trim()
        .min(1, "Enter an origin ID.")
        .refine((id) => !existingIds.includes(id), "Another origin has this ID."),
    })
    .superRefine((values, context) => {
      const addIssue = (path: string, message: string) =>
        context.addIssue({ code: "custom", path: [path], message });
      if (values.type === ORIGIN_TYPES.s3) {
        if (!values.bucket) addIssue("bucket", "Choose a bucket.");
        return;
      }
      if (!HOST_ONLY.test(values.domain))
        addIssue("domain", "Enter a host name only, like api.example.com.");
      if (!isWholeNumberIn(values.port, PORT_RANGE))
        addIssue("port", `Enter a port from ${PORT_RANGE.min} to ${PORT_RANGE.max}.`);
    });
export type OriginForm = z.input<ReturnType<typeof originSchema>>;

// editingDefault: behavior mặc định không có path, chỉ đổi origin
export const behaviorSchema = (existingPaths: readonly string[], editingDefault = false) =>
  z.object({
    path: editingDefault
      ? z.string()
      : z
          .string()
          .trim()
          .min(1, "Enter a path pattern.")
          .refine(
            (path) => path !== DEFAULT_BEHAVIOR_PATH,
            "The default behavior already matches *.",
          )
          .refine(
            (path) => !existingPaths.map(withoutPrefix).includes(withoutPrefix(path)),
            "Another behavior has this path.",
          ),
    originId: z.string().min(1, "Choose an origin."),
  });

// Mỗi dòng một path; bỏ dòng trống, thiếu "/" đầu thì thêm (Floci nhận, AWS từ chối — spec 7 #4)
export const invalidationSchema = z.object({
  paths: z
    .string()
    .transform((text) =>
      text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((path) => (path.startsWith(PATH_PREFIX) ? path : `${PATH_PREFIX}${path}`)),
    )
    .refine((paths) => paths.length > 0, "Enter at least one path."),
});
