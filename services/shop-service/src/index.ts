import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { auth } from './middleware/auth';
import { publicRoutes } from './routes/public.routes';
import { adminRoutes } from './routes/admin.routes';
import { customerRoutes } from './routes/customer.routes';

const PORT = Number(Bun.env.PORT) || 3004;

const app = new Elysia()
  .use(cors())
  .use(auth)
  .use(publicRoutes)
  .use(adminRoutes)
  .use(customerRoutes)
  .get('/health', () => ({ status: 'ok', service: 'shop-service' }))
  .listen(PORT);

console.log('🛒 Shop Service running at localhost:' + PORT);
