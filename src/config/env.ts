import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('/api/v1'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  WOO_BASE_URL: z.string().url(),
  WOO_CONSUMER_KEY: z.string().min(1),
  WOO_CONSUMER_SECRET: z.string().min(1),
  WOO_WEBHOOK_SECRET: z.string().min(1)
});

export const env = EnvSchema.parse(process.env);
