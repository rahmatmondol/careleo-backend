/**
 * Normalise stored image URLs on the way out.
 *
 * ## Why this is needed
 *
 * media-service wrote **absolute** URLs into `media_assets.url`, built from
 * whatever `MEDIA_PUBLIC_BASE_URL` was set to at upload time. In this stack
 * that was the api-gateway:
 *
 *     MEDIA_PUBLIC_BASE_URL: http://192.168.0.103:8090/api/v1/media/files
 *
 * Those URLs were then copied into `products.image_url` and
 * `products.gallery_images` when an admin picked an image. So the catalogue is
 * full of rows hard-coding **:8090** (the gateway) and **:3017**
 * (media-service) — two ports that no longer listen, because both processes
 * were folded into careleo-backend on :3000.
 *
 * The result is a catalogue whose images all 404: the storefront's next/image
 * rejects the unknown host and swaps in "No photo yet", and the mobile app's
 * <Image> just fails to connect.
 *
 * Rewriting the host as rows are read fixes every existing product without a
 * migration and without a deploy ordering problem. `scripts/backfill-media-urls.ts`
 * does the same thing permanently in the database; this stays afterwards as the
 * safety net for any row that slips through (an old backup restore, a hand-typed
 * value, a stale export).
 *
 * External URLs — Unsplash, a supplier's CDN, your own cdn.careleo.care — are
 * left untouched. Only the retired internal origins are rewritten.
 */

/** Ports the retired processes listened on: api-gateway and media-service. */
const RETIRED_PORTS = ['8090', '3017', '3004'];

/**
 * Hosts that only ever resolve on the machine that wrote the URL.
 *
 * `MEDIA_PUBLIC_BASE_URL` defaulting to `http://localhost:3000` meant uploads
 * were stored as `http://localhost:3000/api/v1/media/files/...`. On the mobile
 * app `localhost` is the *phone*, so every one of those images failed to load —
 * the same class of bug as the retired :8090 origin, from a different cause.
 *
 * New uploads store a relative path (see `media/storage/local.ts`); this is for
 * the rows written before that.
 */
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];

/** Paths this API serves images under. */
const SERVED_PREFIXES = ['/api/v1/media/files/', '/api/v1/uploads/', '/uploads/'];

const publicBase = () =>
  (process.env.MEDIA_PUBLIC_BASE_URL || 'http://localhost:3000/api/v1/media/files')
    .replace(/\/api\/v1\/media\/files\/?$/, '')
    .replace(/\/$/, '');

/**
 * @returns the URL rewritten onto the current origin, or unchanged when it is
 *          external, already correct, or empty.
 */
export const normaliseMediaUrl = (value?: string | null): string => {
  const url = String(value ?? '').trim();
  if (!url) return '';

  // Relative already — make it absolute so a browser resolves it against this
  // API rather than against the storefront's own origin.
  if (url.startsWith('/')) return `${publicBase()}${url}`;

  if (!/^https?:\/\//i.test(url)) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const isRetiredPort = RETIRED_PORTS.includes(parsed.port);
  const isLoopback = LOOPBACK_HOSTS.includes(parsed.hostname);
  const isServedPath = SERVED_PREFIXES.some((p) => parsed.pathname.startsWith(p));

  // Only touch URLs that are unmistakably ours: a dead internal port or a
  // loopback host, *and* a path this API serves. A supplier CDN on :8090, or a
  // real host serving /uploads/, is left alone.
  if (!(isRetiredPort || isLoopback) || !isServedPath) return url;

  return `${publicBase()}${parsed.pathname}${parsed.search}`;
};

/** Map over a list, dropping anything that normalises to empty. */
export const normaliseMediaUrls = (values?: unknown): string[] => {
  if (!Array.isArray(values)) return [];
  return values.map((v) => normaliseMediaUrl(typeof v === 'string' ? v : (v as any)?.url)).filter(Boolean);
};
