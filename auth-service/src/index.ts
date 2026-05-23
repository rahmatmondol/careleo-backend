import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';

const port = Number(process.env.AUTH_SERVICE_PORT ?? '3001');
const upstreamBase = process.env.AUTH_UPSTREAM_URL ?? 'http://localhost:3000/api/v1/auth';

const app = new Elysia()
  .use(cors())
  .get('/health', () => ({ status: 'ok', service: 'auth-service', upstreamBase }))
  .all('/auth', async ({ request, set }) => proxyToUpstream(request, set, '/auth'))
  .all('/auth/*', async ({ request, set, path }) => proxyToUpstream(request, set, path))
  .all('/api/v1/auth', async ({ request, set }) => proxyToUpstream(request, set, '/api/v1/auth'))
  .all('/api/v1/auth/*', async ({ request, set, path }) => proxyToUpstream(request, set, path))
  .listen(port);

async function proxyToUpstream(request: Request, set: any, path: string) {
  const incomingUrl = new URL(request.url);
  const suffix = path
    .replace(/^\/api\/v1\/auth/, '')
    .replace(/^\/auth/, '');
  const forwardUrl = `${upstreamBase}${suffix}${incomingUrl.search}`;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');
  headers.set('x-service', 'auth-service');

  const method = request.method.toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();

  try {
    const upstream = await fetch(forwardUrl, { method, headers, body });
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set('x-proxied-by', 'auth-service');

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    set.status = 502;
    return {
      success: false,
      data: null,
      error: {
        code: 'AUTH_UPSTREAM_UNAVAILABLE',
        message: 'Auth upstream is unavailable',
        details: error?.message ?? 'unknown error',
      },
    };
  }
}

console.log(`Auth service running at http://localhost:${port}`);
