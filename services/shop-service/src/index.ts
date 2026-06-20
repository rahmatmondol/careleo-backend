import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { auth } from './middleware/auth';
import { publicRoutes } from './routes/public.routes';
import { adminRoutes } from './routes/admin.routes';
import { customerRoutes } from './routes/customer.routes';
import { internalRoutes } from './routes/internal.routes';
import { startSubscriptionRunner } from './jobs/subscription-runner';

const PORT = Number(Bun.env.PORT) || 3004;

const app = new Elysia()
  .use(cors())
  .use(auth)
  .use(publicRoutes)
  .use(internalRoutes)
  .use(adminRoutes)
  .use(customerRoutes)
  .get('/health', () => ({ status: 'ok', service: 'shop-service' }))
  .listen(PORT);

startSubscriptionRunner();

console.log('🛒 Shop Service running at localhost:' + PORT);
