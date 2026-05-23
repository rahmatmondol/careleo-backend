import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';

type RouteTarget = {
  prefix: string;
  serviceBaseUrl: string;
};

const port = Number(process.env.GATEWAY_PORT ?? '8088');

const targets: RouteTarget[] = [
  { prefix: '/api/v1/auth', serviceBaseUrl: process.env.AUTH_SERVICE_URL ?? 'http://localhost:3001' },
  { prefix: '/api/v1/users', serviceBaseUrl: process.env.USER_SERVICE_URL ?? 'http://localhost:3002' },
  { prefix: '/api/v1/pets', serviceBaseUrl: process.env.PET_SERVICE_URL ?? 'http://localhost:3003' },
  { prefix: '/api/v1/adoption', serviceBaseUrl: process.env.ADOPTION_SERVICE_URL ?? 'http://localhost:3004' },
  { prefix: '/api/v1/admin/adoption', serviceBaseUrl: process.env.ADOPTION_SERVICE_URL ?? 'http://localhost:3004' },
  { prefix: '/api/v1/vets', serviceBaseUrl: process.env.VET_SERVICE_URL ?? 'http://localhost:3005' },
  { prefix: '/api/v1/walkers', serviceBaseUrl: process.env.CARE_SERVICE_URL ?? 'http://localhost:3006' },
  { prefix: '/api/v1/sitters', serviceBaseUrl: process.env.CARE_SERVICE_URL ?? 'http://localhost:3006' },
  { prefix: '/api/v1/bookings', serviceBaseUrl: process.env.CARE_SERVICE_URL ?? 'http://localhost:3006' },
  { prefix: '/api/v1/social', serviceBaseUrl: process.env.SOCIAL_SERVICE_URL ?? 'http://localhost:3007' },
  { prefix: '/api/v1/integrations/woo', serviceBaseUrl: process.env.SHOP_BRIDGE_SERVICE_URL ?? 'http://localhost:3008' },
  { prefix: '/api/v1/store', serviceBaseUrl: process.env.SHOP_BRIDGE_SERVICE_URL ?? 'http://localhost:3008' },
  { prefix: '/api/v1/notifications', serviceBaseUrl: process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:3009' },
  { prefix: '/api/v1/admin', serviceBaseUrl: process.env.ADMIN_SERVICE_URL ?? 'http://localhost:3010' },
];

const findTarget = (path: string) => targets.find((t) => path === t.prefix || path.startsWith(`${t.prefix}/`));

const buildForwardUrl = (base: string, incoming: URL) => `${base}${incoming.pathname}${incoming.search}`;

const app = new Elysia()
  .use(cors())
  .get('/health', () => ({ status: 'ok', service: 'api-gateway' }))
  .all('/*', async ({ request, path, set }) => {
    const target = findTarget(path);
    if (!target) {
      set.status = 404;
      return {
        success: false,
        data: null,
        error: {
          code: 'ROUTE_NOT_MAPPED',
          message: `No service mapping for path: ${path}`,
        },
      };
    }

    const incomingUrl = new URL(request.url);
    const forwardUrl = buildForwardUrl(target.serviceBaseUrl, incomingUrl);

    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('content-length');
    headers.set('x-gateway', 'careleo-api-gateway');

    const method = request.method.toUpperCase();
    const body = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();

    try {
      const upstreamResponse = await fetch(forwardUrl, {
        method,
        headers,
        body,
      });

      const responseHeaders = new Headers(upstreamResponse.headers);
      responseHeaders.set('x-routed-by', 'api-gateway');

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: responseHeaders,
      });
    } catch (error: any) {
      set.status = 502;
      return {
        success: false,
        data: null,
        error: {
          code: 'UPSTREAM_UNAVAILABLE',
          message: `Failed to reach upstream for ${path}`,
          details: error?.message ?? 'unknown upstream error',
        },
      };
    }
  })
  .listen(port);

console.log(`API Gateway running at http://localhost:${port}`);
