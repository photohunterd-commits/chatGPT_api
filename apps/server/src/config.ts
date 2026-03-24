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
  DATA_DIR: z.string().default("./data")
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
  port: env.PORT
};

export type ReasoningEffort = (typeof env)["OPENAI_REASONING_EFFORT"];
