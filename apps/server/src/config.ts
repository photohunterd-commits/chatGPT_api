import dotenv from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  OPENAI_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-5.4"),
  OPENAI_REASONING_EFFORT: z.enum(["low", "medium", "high", "xhigh"]).default("medium"),
  JWT_SECRET: z.string().min(32),
  PORT: z.coerce.number().int().positive().default(3030),
  HOST: z.string().default("0.0.0.0"),
  CORS_ORIGIN: z.string().default("*"),
  DATA_DIR: z.string().default("./data"),
  SMTP_HOST: z.string().trim().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: z
    .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
    .optional()
    .transform((value) => value === "true" || value === "1"),
  SMTP_USER: z.string().trim().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_FROM: z.string().trim().min(1).optional(),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(30)
});

const env = envSchema.parse(process.env);

export const config = {
  corsOrigin: env.CORS_ORIGIN,
  dataDir: resolve(process.cwd(), env.DATA_DIR),
  host: env.HOST,
  openAiApiKey: env.OPENAI_API_KEY,
  openAiBaseUrl: env.OPENAI_BASE_URL,
  openAiModel: env.OPENAI_MODEL,
  openAiReasoningEffort: env.OPENAI_REASONING_EFFORT,
  jwtSecret: env.JWT_SECRET,
  passwordResetTokenTtlMinutes: env.PASSWORD_RESET_TOKEN_TTL_MINUTES,
  smtp: env.SMTP_HOST && env.SMTP_PORT && env.SMTP_FROM
    ? {
        from: env.SMTP_FROM,
        host: env.SMTP_HOST,
        password: env.SMTP_PASSWORD,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        user: env.SMTP_USER
      }
    : null,
  port: env.PORT
};

export type ReasoningEffort = (typeof env)["OPENAI_REASONING_EFFORT"];
