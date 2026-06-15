import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = Bun.env.DATABASE_URL || 'postgres://careleo:careleo_dev_password@localhost:5433/careleo_shop';
const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });
