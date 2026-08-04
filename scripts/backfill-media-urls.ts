/**
 * Rewrite stored image URLs that point at the retired api-gateway (:8090) and
 * media-service (:3017) origins onto the current public origin.
 *
 * media-service stored **absolute** URLs built from `MEDIA_PUBLIC_BASE_URL`,
 * which in this stack was the gateway:
 *
 *     http://192.168.0.103:8090/api/v1/media/files/products/xyz.jpg
 *
 * Those URLs were copied into `products.image_url` and `gallery_images` as
 * admins picked images. Both ports are gone — the gateway and media-service
 * are part of careleo-backend on :3000 now — so every one of those images
 * 404s: the storefront shows "No photo yet", the app shows a blank tile.
 *
 * The API already rewrites these as rows are read (`shared/http/media-url.ts`),
 * so the catalogue looks correct without running this. This makes the fix
 * permanent so the data itself is right — worth doing before anything exports,
 * caches or copies those URLs somewhere the API isn't in the path.
 *
 * Usage (from careleo-backend/, DATABASE_URL pointing at `careleo`):
 *
 *   bun run scripts/backfill-media-urls.ts --dry-run   # report only
 *   bun run scripts/backfill-media-urls.ts             # apply
 *
 * Idempotent: re-running finds nothing left to change.
 */

import { Client } from 'pg';

const DRY_RUN = process.argv.includes('--dry-run');

const TARGET_URL =
  process.env.DATABASE_URL || 'postgres://careleo:careleo_dev_password@localhost:5433/careleo';

/** The origin every rewritten URL should end up on. */
const PUBLIC_BASE = (
  process.env.MEDIA_PUBLIC_BASE_URL || 'http://localhost:3000/api/v1/media/files'
)
  .replace(/\/api\/v1\/media\/files\/?$/, '')
  .replace(/\/$/, '');

/** Ports the retired processes listened on. */
const RETIRED_PORTS = ['8090', '3017', '3004'];

/**
 * Hosts that only resolve on the machine that wrote them. `localhost` in a
 * stored URL is the phone when the mobile app reads it, so those rows render
 * blank on every device.
 */
const LOOPBACK_HOSTS = ['localhost', '127\\.0\\.0\\.1', '0\\.0\\.0\\.0'];

/** Columns holding a single URL, and columns holding a JSON array of them. */
const SINGLE: { table: string; column: string }[] = [
  { table: 'media_assets', column: 'url' },
  { table: 'products', column: 'image_url' },
  { table: 'categories', column: 'image_url' },
  { table: 'product_brands', column: 'logo' },
  { table: 'posts', column: 'image_url' },
  { table: 'posts', column: 'video_url' },
  { table: 'stories', column: 'image_url' },
  { table: 'users', column: 'avatar_url' },
  { table: 'pets', column: 'photo_url' },
];

const JSON_ARRAY: { table: string; column: string }[] = [
  { table: 'products', column: 'gallery_images' },
];

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

/**
 * Matches a URL that is unmistakably ours and unreachable: either a retired
 * port or a loopback host, followed by a path this API serves.
 */
const SERVED = '(/api/v1/media/files/|/api/v1/uploads/|/uploads/)';
const pattern = () =>
  `^https?://([^/]+:(${RETIRED_PORTS.join('|')})|(${LOOPBACK_HOSTS.join('|')})(:[0-9]+)?)${SERVED}`;

async function tableExists(client: Client, table: string) {
  const { rows } = await client.query(`SELECT to_regclass($1) IS NOT NULL AS present`, [
    `public.${table}`,
  ]);
  return Boolean(rows[0]?.present);
}

async function columnExists(client: Client, table: string, column: string) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [table, column],
  );
  return rows.length > 0;
}

async function main() {
  console.log(c.bold(`\nmedia URL backfill${DRY_RUN ? ' — dry run' : ''}`));
  console.log(c.dim(`target origin: ${PUBLIC_BASE}`));
  console.log(c.dim(`rewriting ports: ${RETIRED_PORTS.join(', ')}\n`));

  // Rewriting localhost onto localhost achieves nothing, and it is the most
  // likely way to run this and think it worked.
  if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(PUBLIC_BASE)) {
    console.log(
      c.yellow(
        '  ⚠️  MEDIA_PUBLIC_BASE_URL points at a loopback host.\n' +
          '      Stored URLs would be rewritten to localhost, which the mobile app\n' +
          '      still cannot reach — on a device localhost is the device.\n' +
          '      Set it to the address clients actually use, e.g.\n' +
          '        MEDIA_PUBLIC_BASE_URL=http://192.168.0.103:3000/api/v1/media/files\n',
      ),
    );
  }

  const client = new Client({ connectionString: TARGET_URL });
  await client.connect();

  let total = 0;
  const re = pattern();

  // ── Single-URL columns ────────────────────────────────────────────────
  for (const { table, column } of SINGLE) {
    if (!(await tableExists(client, table)) || !(await columnExists(client, table, column))) {
      console.log(c.dim(`  ${`${table}.${column}`.padEnd(30)} — not present, skipped`));
      continue;
    }

    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM "${table}" WHERE "${column}" ~ $1`,
      [re],
    );
    const n = rows[0].n as number;
    if (n === 0) {
      console.log(c.dim(`  ${`${table}.${column}`.padEnd(30)} — clean`));
      continue;
    }

    if (DRY_RUN) {
      const { rows: sample } = await client.query(
        `SELECT "${column}" AS v FROM "${table}" WHERE "${column}" ~ $1 LIMIT 2`,
        [re],
      );
      console.log(c.yellow(`  ${`${table}.${column}`.padEnd(30)} ${n} row(s) would change`));
      for (const s of sample) console.log(c.dim(`      ${s.v}`));
    } else {
      // regexp_replace keeps the path and swaps only scheme://host:port.
      await client.query(
        `UPDATE "${table}"
            SET "${column}" = regexp_replace("${column}", '^https?://[^/]+', $1)
          WHERE "${column}" ~ $2`,
        [PUBLIC_BASE, re],
      );
      console.log(c.green(`  ${`${table}.${column}`.padEnd(30)} ${n} row(s) rewritten`));
    }
    total += n;
  }

  // ── JSON array columns ────────────────────────────────────────────────
  for (const { table, column } of JSON_ARRAY) {
    if (!(await tableExists(client, table)) || !(await columnExists(client, table, column))) continue;

    // Stored as a JSON string, so a plain textual replace of the origin is both
    // correct and far simpler than parsing and re-serialising each array.
    const originRe = `https?://([^"/]+:(${RETIRED_PORTS.join('|')})|(${LOOPBACK_HOSTS.join('|')})(:[0-9]+)?)`;
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM "${table}" WHERE "${column}" ~ $1`,
      [originRe],
    );
    const n = rows[0].n as number;
    if (n === 0) {
      console.log(c.dim(`  ${`${table}.${column}`.padEnd(30)} — clean`));
      continue;
    }

    if (DRY_RUN) {
      console.log(c.yellow(`  ${`${table}.${column}`.padEnd(30)} ${n} row(s) would change`));
    } else {
      await client.query(
        `UPDATE "${table}"
            SET "${column}" = regexp_replace("${column}", $1, $2, 'g')
          WHERE "${column}" ~ $1`,
        [originRe, PUBLIC_BASE],
      );
      console.log(c.green(`  ${`${table}.${column}`.padEnd(30)} ${n} row(s) rewritten`));
    }
    total += n;
  }

  await client.end();

  console.log(
    total === 0
      ? c.green('\nNothing to do — no URLs point at a retired origin.\n')
      : DRY_RUN
        ? c.yellow(`\n${total} row(s) would be rewritten. Re-run without --dry-run to apply.\n`)
        : c.green(`\n${total} row(s) rewritten.\n`),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
