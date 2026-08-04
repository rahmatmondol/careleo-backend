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

  /**
   * Service-to-service secret for the legacy `/shop/internal/*` and
   * `/freelancer/internal/*` routes.
   *
   * Nothing in this repo sends it any more — the shop and freelancer domains
   * are modules in this process, so their callers are plain function calls. It
   * is kept optional for the deployment window in which an older container may
   * still be posting to those routes. Drop it once nothing does.
   *
   * `SHOP_SERVICE_URL` and the other `*_SERVICE_URL` variables are gone with
   * the services they addressed.
   */
  INTERNAL_SERVICE_SECRET: z.string().optional(),

  // File Storage
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  STORAGE_TYPE: z.enum(['s3', 'local']).default('local'), // Use 'local' for dev, 's3' for prod
  STORAGE_LOCAL_PATH: z.string().default('./public/uploads'),

  // Media library (formerly media-service). Local disk unless S3 is configured.
  MEDIA_STORAGE_DRIVER: z.enum(['local', 's3']).optional(),
  MEDIA_LOCAL_UPLOAD_DIR: z.string().default('./uploads/media'),
  MEDIA_PUBLIC_BASE_URL: z.string().default('http://localhost:3000/api/v1/media/files'),

  // Notifications
  FCM_SERVER_KEY: z.string().optional(), // Firebase Cloud Messaging

  // App Config
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:3000/api/v1')
});

export const env = EnvSchema.parse(process.env);
