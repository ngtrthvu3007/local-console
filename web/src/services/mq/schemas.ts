import { z } from "zod";
import {
  BROKER_NAME_MAX_LENGTH,
  BROKER_NAME_PATTERN,
  PASSWORD_FORBIDDEN_CHARACTERS,
  PASSWORD_LENGTH,
  PASSWORD_MIN_UNIQUE_CHARACTERS,
  PEEK_COUNT,
  RESERVED_USERNAME,
  USERNAME_LENGTH,
  USERNAME_PATTERN,
} from "./constants.ts";

const usernameSchema = z
  .string()
  .trim()
  .min(USERNAME_LENGTH.min, `Must be at least ${USERNAME_LENGTH.min} characters.`)
  .max(USERNAME_LENGTH.max, `Must be at most ${USERNAME_LENGTH.max} characters.`)
  .regex(USERNAME_PATTERN, "Use only letters, numbers, dots, hyphens, underscores and tildes.")
  .refine((name) => name !== RESERVED_USERNAME, `Can't be "${RESERVED_USERNAME}".`);

// Luật password của Amazon MQ
const passwordSchema = z
  .string()
  .min(PASSWORD_LENGTH.min, `Must be at least ${PASSWORD_LENGTH.min} characters.`)
  .max(PASSWORD_LENGTH.max, `Must be at most ${PASSWORD_LENGTH.max} characters.`)
  .refine(
    (password) => new Set(password).size >= PASSWORD_MIN_UNIQUE_CHARACTERS,
    `Use at least ${PASSWORD_MIN_UNIQUE_CHARACTERS} different characters.`,
  )
  .refine(
    (password) => !PASSWORD_FORBIDDEN_CHARACTERS.some((character) => password.includes(character)),
    `Can't contain ${PASSWORD_FORBIDDEN_CHARACTERS.join(" ")}.`,
  );

export const createBrokerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a broker name.")
    .max(BROKER_NAME_MAX_LENGTH, `Must be at most ${BROKER_NAME_MAX_LENGTH} characters.`)
    .regex(BROKER_NAME_PATTERN, "Use only letters, numbers, hyphens and underscores."),
  username: usernameSchema,
  password: passwordSchema,
});
export type CreateBrokerForm = z.input<typeof createBrokerSchema>;

// Đăng nhập không kiểm tra luật đặt password: sai thì RabbitMQ trả 401
export const signInSchema = z.object({
  username: z.string().trim().min(1, "Enter the username."),
  password: z.string().min(1, "Enter the password."),
});
export type SignInForm = z.input<typeof signInSchema>;

export const createQueueSchema = z.object({
  name: z.string().trim().min(1, "Enter a queue name."),
  durable: z.boolean(),
});
export type CreateQueueForm = z.input<typeof createQueueSchema>;

export const publishSchema = z.object({
  exchange: z.string().min(1, "Choose an exchange."),
  routingKey: z.string(),
  payload: z.string(),
});
export type PublishForm = z.input<typeof publishSchema>;

// Input của Cloudscape luôn trả chuỗi
export const peekSchema = z.object({
  count: z
    .string()
    .trim()
    .refine((text) => {
      const count = Number(text);
      return Number.isInteger(count) && count >= PEEK_COUNT.min && count <= PEEK_COUNT.max;
    }, `Enter a whole number from ${PEEK_COUNT.min} to ${PEEK_COUNT.max}.`)
    .transform(Number),
});
export type PeekForm = z.input<typeof peekSchema>;
