import { z } from "zod";
import {
  ADJACENT_DOTS,
  BUCKET_NAME_MAX_LENGTH,
  BUCKET_NAME_MIN_LENGTH,
  BUCKET_NAME_PATTERN,
  IP_ADDRESS_PATTERN,
  LIFECYCLE_STATUS,
  MIN_LIFECYCLE_DAYS,
  NOTIFICATION_DESTINATIONS,
  NOTIFICATION_EVENT_TYPES,
  PATH_DELIMITER,
  PRESIGN_METHODS,
  VERSIONING_STATUS,
  type NotificationDestination,
} from "./constants.ts";
import { asFolderKey } from "./helpers.ts";

const DESTINATION_IDS = Object.keys(NOTIFICATION_DESTINATIONS) as [
  NotificationDestination,
  ...NotificationDestination[],
];

// Tên một mục trong folder: không rỗng, không chứa "/"
const itemName = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .refine((name) => !name.includes(PATH_DELIMITER), `Names can't contain "${PATH_DELIMITER}".`);

export const bucketNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a bucket name.")
  .min(BUCKET_NAME_MIN_LENGTH, `Must be at least ${BUCKET_NAME_MIN_LENGTH} characters.`)
  .max(BUCKET_NAME_MAX_LENGTH, `Must be at most ${BUCKET_NAME_MAX_LENGTH} characters.`)
  .regex(
    BUCKET_NAME_PATTERN,
    "Use only lowercase letters, numbers, dots (.) and hyphens (-), and start and end with a letter or number.",
  )
  .refine((name) => !name.includes(ADJACENT_DOTS), "Must not contain two adjacent dots.")
  .refine((name) => !IP_ADDRESS_PATTERN.test(name), "Must not be formatted as an IP address.");

const tagSchema = z.object({
  key: z.string(),
  value: z.string(),
  existing: z.boolean(),
  markedForRemoval: z.boolean().optional(),
});

export const createBucketSchema = z.object({
  name: bucketNameSchema,
  versioning: z.enum([VERSIONING_STATUS.disabled, VERSIONING_STATUS.enabled]),
  tags: z.array(tagSchema),
  // TagEditor tự validate tag; form chỉ giữ cờ hợp lệ của nó
  tagsValid: z.boolean().refine(Boolean, "Fix the tag errors above."),
});

export const createFolderSchema = z.object({ name: itemName });

export const renameSchema = (currentName: string) =>
  z.object({
    newName: itemName.refine((name) => name !== currentName, "Enter a different name."),
  });

// Không cho copy/move vào đúng chỗ cũ
export const transferSchema = (sourceBucket: string, sourcePrefix: string) =>
  z
    .object({
      destinationBucket: z.string().min(1, "Choose a bucket."),
      destinationFolder: z.string().trim(),
    })
    .refine(
      ({ destinationBucket, destinationFolder }) => {
        const destinationPrefix = destinationFolder ? asFolderKey(destinationFolder) : "";
        return destinationBucket !== sourceBucket || destinationPrefix !== sourcePrefix;
      },
      { message: "Pick a different destination.", path: ["destinationFolder"] },
    );

export const metadataSchema = z.object({
  contentType: z.string().trim(),
  entries: z.array(z.object({ key: z.string().trim(), value: z.string() })),
});

export const notificationSchema = (existingIds: string[]) =>
  z
    .object({
      id: z
        .string()
        .trim()
        .refine((id) => !existingIds.includes(id), "A notification with this name already exists."),
      events: z.array(z.enum(NOTIFICATION_EVENT_TYPES)).min(1, "Choose at least one event type."),
      prefix: z.string().trim(),
      suffix: z.string().trim(),
      destination: z.enum(DESTINATION_IDS),
      arn: z.string().trim(),
    })
    .superRefine(({ destination, arn }, context) => {
      const target = NOTIFICATION_DESTINATIONS[destination];
      if (target.arnPattern.test(arn)) return;
      context.addIssue({
        code: "custom",
        path: ["arn"],
        message: `Enter the ARN of a ${target.label.toLowerCase()}.`,
      });
    });

// Ô số ngày: để trống là không dùng hành động đó
const optionalDays = z
  .string()
  .trim()
  .refine(
    (text) => !text || (Number.isInteger(Number(text)) && Number(text) >= MIN_LIFECYCLE_DAYS),
    `Enter a whole number of days, ${MIN_LIFECYCLE_DAYS} or more.`,
  )
  .transform((text) => (text ? Number(text) : undefined));

export const lifecycleSchema = (existingIds: string[]) =>
  z
    .object({
      id: z
        .string()
        .trim()
        .min(1, "Enter a rule name.")
        .refine((id) => !existingIds.includes(id), "A rule with this name already exists."),
      prefix: z.string().trim(),
      status: z.enum([LIFECYCLE_STATUS.enabled, LIFECYCLE_STATUS.disabled]),
      expireDays: optionalDays,
      noncurrentDays: optionalDays,
      abortDays: optionalDays,
      deleteExpiredMarkers: z.boolean(),
    })
    .superRefine((rule, context) => {
      const { expireDays, noncurrentDays, abortDays, deleteExpiredMarkers } = rule;
      if (!expireDays && !noncurrentDays && !abortDays && !deleteExpiredMarkers) {
        context.addIssue({
          code: "custom",
          path: ["expireDays"],
          message: "Set at least one action.",
        });
      }
      // S3 không cho dùng chung hai hành động này trong một rule
      if (expireDays && deleteExpiredMarkers) {
        context.addIssue({
          code: "custom",
          path: ["deleteExpiredMarkers"],
          message: "Can't be combined with expiring current versions.",
        });
      }
    });

export type LifecycleFormOutput = z.output<ReturnType<typeof lifecycleSchema>>;

// Kiểm tra tối thiểu: Floci nhận mọi policy, còn AWS thật sẽ từ chối policy thiếu các phần này
const POLICY_EFFECTS = ["Allow", "Deny"] as const;
const policyStatement = z.looseObject({
  Effect: z.enum(POLICY_EFFECTS, { error: 'Each statement needs "Effect": "Allow" or "Deny".' }),
});
export const bucketPolicySchema = z.looseObject({
  Version: z.string({ error: 'Add "Version": "2012-10-17".' }),
  // Statement có thể là một object hoặc một mảng
  Statement: z.preprocess(
    (statement) => (statement === undefined ? [] : [statement].flat()),
    z.array(policyStatement).min(1, "Add at least one statement."),
  ),
});

export const presignSchema = z.object({
  method: z.enum(PRESIGN_METHODS),
  expiresIn: z.string(),
});

export const versioningSchema = z.object({
  status: z.enum([VERSIONING_STATUS.enabled, VERSIONING_STATUS.suspended]),
});
