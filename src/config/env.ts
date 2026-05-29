import { z } from 'zod';

const EnvSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('/api/v1'),

  // Database
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  // Authentication
  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_EXPIRY_HOURS: z.coerce.number().default(7 * 24), // 7 days

  // Firebase
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_PRIVATE_KEY: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().min(1),
  FIREBASE_STORAGE_BUCKET: z.string().optional(),

  // AI Models Configuration (comma-separated or JSON)
  AI_DEFAULT_MODEL: z.string().default('gpt-3.5-turbo'),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_GEMINI_API_KEY: z.string().optional(),

  // WooCommerce Integration
  WOO_BASE_URL: z.string().url(),
  WOO_CONSUMER_KEY: z.string().min(1),
  WOO_CONSUMER_SECRET: z.string().min(1),
  WOO_WEBHOOK_SECRET: z.string().min(1),

  // File Storage
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  STORAGE_TYPE: z.enum(['s3', 'local']).default('local'), // Use 'local' for dev, 's3' for prod
  STORAGE_LOCAL_PATH: z.string().default('./public/uploads'),

  // Notifications
  FCM_SERVER_KEY: z.string().optional(), // Firebase Cloud Messaging

  // App Config
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:3000/api/v1')
});

export const env = EnvSchema.parse(process.env);
