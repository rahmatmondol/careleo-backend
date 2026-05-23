import { Elysia } from 'elysia';

const PORT = Number(process.env.PORT || 4000);
const PREFIX = process.env.API_PREFIX || '/api/v1';

const serviceMap: Record<string, string> = {
  '/auth': process.env.AUTH_SERVICE_URL || 'http://localhost:4013',
  '/users': process.env.USER_SERVICE_URL || 'http://localhost:4014',
  '/user': process.env.USER_SERVICE_URL || 'http://localhost:4014',
  '/pets': process.env.PET_SERVICE_URL || 'http://localhost:4015',
  '/adoption': process.env.ADOPTION_SERVICE_URL || 'http://localhost:4010',
  '/admin/adoption': process.env.ADOPTION_SERVICE_URL || 'http://localhost:4010',
  '/vets': process.env.VET_SERVICE_URL || 'http://localhost:4011',
  '/walkers': process.env.CARE_SERVICE_URL || 'http://localhost:4012',
  '/store': process.env.SHOP_BRIDGE_SERVICE_URL || 'http://localhost:4016',
  '/integrations/woo': process.env.SHOP_BRIDGE_SERVICE_URL || 'http://localhost:4016',
  '/sync': process.env.SHOP_BRIDGE_SERVICE_URL || 'http://localhost:4016',
  '/notifications': process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:4018',
  '/tasks': process.env.SOCIAL_SERVICE_URL || 'http://localhost:4017',
  '/reminders': process.env.SOCIAL_SERVICE_URL || 'http://localhost:4017',
  '/admin': process.env.ADMIN_SERVICE_URL || 'http://localhost:4019',
  '/audit': process.env.ADMIN_SERVICE_URL || 'http://localhost:4019',
  '/ai': process.env.ADMIN_SERVICE_URL || 'http://localhost:4019',
  '/health': process.env.AUTH_SERVICE_URL || 'http://localhost:4013',
};

const pickTarget = (path: string) => {
  const withoutPrefix = path.startsWith(PREFIX) ? path.slice(PREFIX.length) : path;
  const keys = Object.keys(serviceMap).sort((a, b) => b.length - a.length);
  for (const key of keys) if (withoutPrefix.startsWith(key)) return serviceMap[key];
  return null;
};

const app = new Elysia().all('*', async ({ request, path, set }) => {
  const target = pickTarget(path);
  if (!target) {
    set.status = 404;
    return { success: false, error: { code: 'NOT_FOUND', message: 'Route not mapped in api-gateway' } };
  }

  const url = new URL(request.url);
  const upstreamUrl = `${target}${url.pathname}${url.search}`;

  return fetch(upstreamUrl, {
    method: request.method,
    headers: request.headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    duplex: 'half' as any,
  });
});

app.listen(PORT);
console.log(`🚀 api-gateway running at http://localhost:${PORT}`);
