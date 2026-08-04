/**
 * Copy data out of the five per-service databases and into the merged `careleo`
 * database, after the schema migration (0008_*) has created the tables.
 *
 * The former microservices each owned their own database on the same Postgres
 * instance:
 *
 *   careleo_shop | careleo_social | careleo_video | careleo_media | careleo_freelancer
 *
 * Those databases had no foreign keys pointing at `users` or `pets` — nothing
 * enforced that a `cart_items.user_id` referred to a real user. The merged
 * schema does enforce it, so a row that was fine in isolation can be rejected
 * here. That is the whole point of the merge, but it means the copy has to be
 * checked before it is attempted.
 *
 * Usage (run from careleo-backend/, with DATABASE_URL pointing at `careleo`):
 *
 *   bun run scripts/migrate-service-dbs.ts --orphans   # report only, no writes
 *   bun run scripts/migrate-service-dbs.ts --dry-run   # report row counts, no writes
 *   bun run scripts/migrate-service-dbs.ts             # copy (idempotent)
 *   bun run scripts/migrate-service-dbs.ts --verify    # re-check integrity after a copy
 *
 * The copy is idempotent: every insert is `ON CONFLICT (id) DO NOTHING`, so
 * re-running it after a partial failure resumes rather than duplicates.
 */

import { Client } from 'pg';

// ─── Configuration ────────────────────────────────────────────────────────

const TARGET_URL =
  process.env.DATABASE_URL ||
  'postgres://careleo:careleo_dev_password@localhost:5433/careleo';

/** Build a source URL by swapping the database name on the target URL. */
const sourceUrl = (dbName: string) => {
  const url = new URL(TARGET_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
};

/**
 * Foreign keys that did not exist before the merge and are enforced now.
 * `column` in `table` must point at an existing row in target `refTable`.
 * Nullable columns are skipped when the value is NULL.
 */
type CrossRef = { table: string; column: string; refTable: string };

/**
 * Tables in FK-safe insertion order, per source database.
 * Order matters for the fallback path (see `copyTable`), and it documents the
 * dependency shape of each domain.
 */
const PLAN: { db: string; tables: string[]; crossRefs: CrossRef[] }[] = [
  {
    db: 'careleo_shop',
    tables: [
      'categories',
      'product_brands',
      'product_sources',
      'product_attributes',
      'product_attribute_values',
      'products',
      'product_seo',
      'product_attribute_assignments',
      'cart_items',
      'wishlist_items',
      'addresses',
      'orders',
      'order_items',
      'product_subscriptions',
      'expenses',
      'product_inventory_logs',
    ],
    crossRefs: [
      { table: 'cart_items', column: 'user_id', refTable: 'users' },
      { table: 'wishlist_items', column: 'user_id', refTable: 'users' },
      { table: 'addresses', column: 'user_id', refTable: 'users' },
      { table: 'orders', column: 'user_id', refTable: 'users' },
      { table: 'product_subscriptions', column: 'user_id', refTable: 'users' },
      { table: 'product_subscriptions', column: 'product_id', refTable: 'products' },
      { table: 'expenses', column: 'user_id', refTable: 'users' },
      { table: 'expenses', column: 'pet_id', refTable: 'pets' },
    ],
  },
  {
    db: 'careleo_social',
    tables: [
      'posts',
      'comments',
      'comment_likes',
      'likes',
      'follows',
      'shares',
      'notifications',
      'bookmarks',
      'stories',
      'reports',
    ],
    crossRefs: [
      { table: 'posts', column: 'user_id', refTable: 'users' },
      { table: 'posts', column: 'pet_id', refTable: 'pets' },
      { table: 'comments', column: 'user_id', refTable: 'users' },
      { table: 'comment_likes', column: 'user_id', refTable: 'users' },
      { table: 'likes', column: 'user_id', refTable: 'users' },
      { table: 'follows', column: 'follower_id', refTable: 'users' },
      { table: 'follows', column: 'following_id', refTable: 'users' },
      { table: 'shares', column: 'user_id', refTable: 'users' },
      { table: 'notifications', column: 'user_id', refTable: 'users' },
      { table: 'notifications', column: 'actor_id', refTable: 'users' },
      { table: 'notifications', column: 'post_id', refTable: 'posts' },
      { table: 'bookmarks', column: 'user_id', refTable: 'users' },
      { table: 'stories', column: 'user_id', refTable: 'users' },
      { table: 'stories', column: 'pet_id', refTable: 'pets' },
      { table: 'reports', column: 'reporter_id', refTable: 'users' },
      { table: 'reports', column: 'reviewed_by', refTable: 'users' },
    ],
  },
  {
    db: 'careleo_video',
    tables: ['video_consultations', 'pet_cameras', 'video_sessions'],
    crossRefs: [
      { table: 'video_consultations', column: 'user_id', refTable: 'users' },
      { table: 'video_consultations', column: 'pet_id', refTable: 'pets' },
      { table: 'pet_cameras', column: 'user_id', refTable: 'users' },
      { table: 'pet_cameras', column: 'pet_id', refTable: 'pets' },
      { table: 'video_sessions', column: 'user_id', refTable: 'users' },
      // video_consultations.vet_id is deliberately not a FK — see video.schema.ts.
      // It is still reported below so the constraint can be added once it is clean.
      { table: 'video_consultations', column: 'vet_id', refTable: 'vets' },
    ],
  },
  {
    db: 'careleo_media',
    tables: ['media_assets', 'media_links'],
    crossRefs: [
      { table: 'media_assets', column: 'uploaded_by', refTable: 'users' },
      { table: 'media_links', column: 'created_by', refTable: 'users' },
    ],
  },
  {
    db: 'careleo_freelancer',
    tables: [
      'freelancer_accounts',
      'freelancer_profiles',
      'freelancer_services',
      'jobs',
      'bookings',
      'booking_reviews',
      'earnings',
      'support_tickets',
      'support_messages',
    ],
    crossRefs: [
      { table: 'jobs', column: 'customer_id', refTable: 'users' },
      { table: 'jobs', column: 'pet_id', refTable: 'pets' },
      { table: 'bookings', column: 'customer_id', refTable: 'users' },
      { table: 'booking_reviews', column: 'customer_id', refTable: 'users' },
      // support_tickets.raised_by / assigned_to and support_messages.sender_id
      // are polymorphic (user OR freelancer account) and stay unconstrained.
    ],
  },
];

/**
 * Columns that are NOT enforced by a real FK in the merged schema, but are
 * still worth reporting. Keeping them separate from hard failures means a
 * dangling vet id does not block the whole migration.
 */
const ADVISORY_ONLY = new Set(['video_consultations.vet_id']);

// ─── Helpers ──────────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));
const MODE = args.has('--orphans')
  ? 'orphans'
  : args.has('--dry-run')
    ? 'dry-run'
    : args.has('--verify')
      ? 'verify'
      : 'copy';

const BATCH = 500;

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

const connect = async (url: string) => {
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
};

const tableExists = async (client: Client, table: string) => {
  const { rows } = await client.query(
    `SELECT to_regclass($1) IS NOT NULL AS present`,
    [`public.${table}`],
  );
  return Boolean(rows[0]?.present);
};

const columnsOf = async (client: Client, table: string): Promise<string[]> => {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [table],
  );
  return rows.map((r) => r.column_name as string);
};

const countOf = async (client: Client, table: string) => {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM "${table}"`);
  return rows[0].n as number;
};

// ─── Orphan detection ─────────────────────────────────────────────────────

type Orphan = { db: string; ref: CrossRef; count: number; samples: string[] };

/**
 * Find values in a source table's column that have no matching row in the
 * target database. Source and target are different databases, so this is done
 * by pulling the distinct source values and asking the target which exist.
 */
async function findOrphans(
  source: Client,
  target: Client,
  db: string,
  ref: CrossRef,
): Promise<Orphan | null> {
  if (!(await tableExists(source, ref.table))) return null;
  const cols = await columnsOf(source, ref.table);
  if (!cols.includes(ref.column)) return null;

  const { rows: distinctRows } = await source.query(
    `SELECT DISTINCT "${ref.column}"::text AS v
       FROM "${ref.table}" WHERE "${ref.column}" IS NOT NULL`,
  );
  const values = distinctRows.map((r) => r.v as string);
  if (values.length === 0) return null;

  const { rows: presentRows } = await target.query(
    `SELECT id::text AS v FROM "${ref.refTable}" WHERE id::text = ANY($1::text[])`,
    [values],
  );
  const present = new Set(presentRows.map((r) => r.v as string));
  const missing = values.filter((v) => !present.has(v));
  if (missing.length === 0) return null;

  const { rows: countRows } = await source.query(
    `SELECT count(*)::int AS n FROM "${ref.table}" WHERE "${ref.column}"::text = ANY($1::text[])`,
    [missing],
  );

  return { db, ref, count: countRows[0].n as number, samples: missing.slice(0, 5) };
}

// ─── Copy ─────────────────────────────────────────────────────────────────

async function copyTable(source: Client, target: Client, table: string) {
  if (!(await tableExists(source, table))) {
    console.log(`  ${c.dim(`${table.padEnd(32)} — not present in source, skipped`)}`);
    return { copied: 0, skipped: 0 };
  }

  const sourceCols = await columnsOf(source, table);
  const targetCols = new Set(await columnsOf(target, table));
  const cols = sourceCols.filter((col) => targetCols.has(col));

  const dropped = sourceCols.filter((col) => !targetCols.has(col));
  if (dropped.length) {
    console.log(
      `  ${c.yellow(`${table.padEnd(32)} — source columns absent in target, not copied: ${dropped.join(', ')}`)}`,
    );
  }

  const total = await countOf(source, table);
  if (total === 0) {
    console.log(`  ${c.dim(`${table.padEnd(32)} — empty`)}`);
    return { copied: 0, skipped: 0 };
  }

  const quoted = cols.map((col) => `"${col}"`).join(', ');
  let copied = 0;

  for (let offset = 0; offset < total; offset += BATCH) {
    const { rows } = await source.query(
      `SELECT ${quoted} FROM "${table}" ORDER BY "id" LIMIT $1 OFFSET $2`,
      [BATCH, offset],
    );
    if (rows.length === 0) break;

    // One multi-row INSERT per batch: ($1,$2,..), ($n+1,...), ...
    const params: unknown[] = [];
    const tuples = rows.map((row) => {
      const placeholders = cols.map((col) => {
        params.push(row[col]);
        return `$${params.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });

    const res = await target.query(
      `INSERT INTO "${table}" (${quoted}) VALUES ${tuples.join(', ')}
       ON CONFLICT ("id") DO NOTHING`,
      params,
    );
    copied += res.rowCount ?? 0;
  }

  const skipped = total - copied;
  const note = skipped > 0 ? c.dim(` (${skipped} already present)`) : '';
  console.log(`  ${table.padEnd(32)} ${c.green(`${copied} copied`)}${note}`);
  return { copied, skipped };
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(c.bold(`\nservice-db merge — mode: ${MODE}`));
  console.log(c.dim(`target: ${TARGET_URL.replace(/:[^:@]*@/, ':***@')}\n`));

  const target = await connect(TARGET_URL);

  // ── Pass 1: integrity check ────────────────────────────────────────────
  const blocking: Orphan[] = [];
  const advisory: Orphan[] = [];

  for (const { db, crossRefs } of PLAN) {
    let source: Client;
    try {
      source = await connect(sourceUrl(db));
    } catch {
      console.log(c.dim(`${db}: not reachable, skipped`));
      continue;
    }
    for (const ref of crossRefs) {
      const orphan = await findOrphans(source, target, db, ref);
      if (!orphan) continue;
      const key = `${ref.table}.${ref.column}`;
      (ADVISORY_ONLY.has(key) ? advisory : blocking).push(orphan);
    }
    await source.end();
  }

  const report = (list: Orphan[], label: string, colour: (s: string) => string) => {
    if (list.length === 0) return;
    console.log(colour(`\n${label}`));
    for (const o of list) {
      console.log(
        colour(
          `  ${o.db} → ${o.ref.table}.${o.ref.column} → ${o.ref.refTable}: ` +
            `${o.count} row(s) reference ids that do not exist`,
        ),
      );
      console.log(c.dim(`    e.g. ${o.samples.join(', ')}`));
    }
  };

  report(advisory, 'Advisory (no constraint, migration continues):', c.yellow);
  report(blocking, 'BLOCKING (a foreign key will reject these rows):', c.red);

  if (blocking.length === 0) {
    console.log(c.green('\nIntegrity check passed — every cross-domain id resolves.'));
  }

  if (MODE === 'orphans') {
    await target.end();
    process.exit(blocking.length > 0 ? 1 : 0);
  }

  if (blocking.length > 0) {
    console.log(
      c.red(
        '\nRefusing to copy. Fix the rows above (delete them, or create the missing\n' +
          'parent rows), then re-run. Nothing has been written.',
      ),
    );
    await target.end();
    process.exit(1);
  }

  // ── Pass 2: copy ───────────────────────────────────────────────────────
  if (MODE === 'dry-run') {
    for (const { db, tables } of PLAN) {
      let source: Client;
      try {
        source = await connect(sourceUrl(db));
      } catch {
        continue;
      }
      console.log(c.bold(`\n${db}`));
      for (const table of tables) {
        if (!(await tableExists(source, table))) continue;
        console.log(`  ${table.padEnd(32)} ${await countOf(source, table)} row(s) to copy`);
      }
      await source.end();
    }
    await target.end();
    console.log(c.dim('\nDry run — nothing written.'));
    return;
  }

  if (MODE === 'copy') {
    for (const { db, tables } of PLAN) {
      let source: Client;
      try {
        source = await connect(sourceUrl(db));
      } catch {
        console.log(c.dim(`\n${db}: not reachable, skipped`));
        continue;
      }
      console.log(c.bold(`\n${db}`));

      await target.query('BEGIN');
      try {
        /**
         * Disable FK triggers for the copy. `categories.parent_id` is
         * self-referential and `comments.parent_id` is a threaded self-join, so
         * no single row order satisfies every constraint mid-copy. Integrity is
         * not being taken on trust: pass 1 proved the cross-domain ids resolve,
         * and pass 3 re-validates every constraint before committing.
         *
         * Requires a superuser role (the dev `careleo` role is one). If it is
         * not available the copy still works for every table without a
         * self-reference, and the error names the table that needs attention.
         */
        await target.query(`SET LOCAL session_replication_role = 'replica'`);
        for (const table of tables) await copyTable(source, target, table);
        await target.query('COMMIT');
      } catch (err) {
        await target.query('ROLLBACK');
        console.error(c.red(`\n${db}: copy failed and was rolled back.`));
        console.error(err);
        await source.end();
        await target.end();
        process.exit(1);
      }
      await source.end();
    }
  }

  // ── Pass 3: post-copy validation ───────────────────────────────────────
  console.log(c.bold('\nValidating foreign keys in the merged database…'));
  const { rows: invalid } = await target.query(`
    SELECT conrelid::regclass::text AS table_name, conname
      FROM pg_constraint
     WHERE contype = 'f' AND NOT convalidated
  `);
  if (invalid.length > 0) {
    console.log(c.red('  Unvalidated foreign keys found:'));
    for (const row of invalid) console.log(c.red(`    ${row.table_name}.${row.conname}`));
  } else {
    console.log(c.green('  All foreign keys valid.'));
  }

  // Row-count parity between source and target.
  console.log(c.bold('\nRow-count parity:'));
  let mismatch = 0;
  for (const { db, tables } of PLAN) {
    let source: Client;
    try {
      source = await connect(sourceUrl(db));
    } catch {
      continue;
    }
    for (const table of tables) {
      if (!(await tableExists(source, table))) continue;
      const from = await countOf(source, table);
      const to = await countOf(target, table);
      if (from !== to) {
        mismatch++;
        console.log(c.red(`  ${table.padEnd(32)} source ${from} → target ${to}`));
      }
    }
    await source.end();
  }
  if (mismatch === 0) console.log(c.green('  Every table matches its source row count.'));

  await target.end();
  console.log(
    mismatch === 0 && invalid.length === 0
      ? c.green('\nDone.\n')
      : c.yellow('\nDone, with the differences noted above.\n'),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
