import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../../config/env';

/**
 * Shared PostgreSQL pool instance for the app.
 */
export const pgPool = new Pool({
  connectionString: env.DATABASE_URL,
});

/**
 * Shared Drizzle DB client.
 */
export const db = drizzle(pgPool);
