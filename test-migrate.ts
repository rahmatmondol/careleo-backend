import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://careleo:careleo_dev_password@localhost:5433/careleo',
});

try {
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: './db/migrations/drizzle' });
  console.log('✅ Migrations applied successfully');
} catch (err) {
  console.error('❌ Migration failed:', err);
} finally {
  await pool.end();
}
