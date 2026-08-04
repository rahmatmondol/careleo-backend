import { pgPool } from './index';

/**
 * A `postgres.js`-compatible tagged template that runs on the shared `pg` pool.
 *
 * The media module was written against `postgres.js`:
 *
 *   const rows = await sql`SELECT * FROM media_assets WHERE id = ${id}`;
 *
 * Its queries are hand-written SQL with CTEs, `COUNT(*) FILTER (WHERE …)` and
 * aliased joins — the kind of thing that is clearer as SQL than as a query
 * builder. Rewriting them into Drizzle to merge the module would have meant
 * re-deriving a dozen non-trivial queries with no functional gain and a real
 * chance of changing results.
 *
 * This shim keeps those call sites byte-for-byte identical while removing the
 * second connection pool: interpolations become `$1, $2, …` placeholders and
 * are passed as parameters, so they are still parameterised, not concatenated.
 * Rows come back as plain objects keyed by column name, exactly as before.
 *
 * Use Drizzle for new queries. This exists to carry ported raw SQL, not to
 * invite more of it.
 */
export const sql = async <T = any>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> => {
  const text = strings.reduce(
    (acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ''),
    '',
  );
  const result = await pgPool.query(text, values);
  return result.rows as T[];
};

/**
 * Run several statements inside one transaction on a single connection.
 *
 * `sql` above takes a fresh connection from the pool per call, so a sequence of
 * `sql` calls is *not* atomic. Anything that must be all-or-nothing goes here.
 */
export const sqlTransaction = async <T>(
  fn: (tx: <R = any>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<R[]>) => Promise<T>,
): Promise<T> => {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const tx = async <R = any>(strings: TemplateStringsArray, ...values: unknown[]): Promise<R[]> => {
      const text = strings.reduce(
        (acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ''),
        '',
      );
      const result = await client.query(text, values);
      return result.rows as R[];
    };
    const out = await fn(tx);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
