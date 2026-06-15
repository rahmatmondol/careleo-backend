import type { Config } from 'drizzle-kit';

/**
 * Drizzle Kit config for Careleo backend.
 * Reads DATABASE_URL from environment.
 */
export default {
  schema: './src/shared/db/schema/index.ts',
  out: './db/migrations/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://careleo:careleo_dev_password@localhost:5433/careleo',
  },
  strict: true,
  verbose: true,
} satisfies Config;
