import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

/**
 * Shared PostgreSQL pool instance for the app.
 */
export const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Shared Drizzle DB client.
 */
export const db = drizzle(pgPool);
