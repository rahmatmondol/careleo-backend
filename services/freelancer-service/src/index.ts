// =====================================
// Freelancer Service — Entry Point
// =====================================

import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { authGuard } from './middleware/auth';
import { authController } from './modules/auth';
import { profilesController } from './modules/profiles';
import { servicesController } from './modules/services';
import { jobsController } from './modules/jobs';
import { bookingsController } from './modules/bookings';
import { earningsController } from './modules/earnings';
import { supportController } from './modules/support';
import { internalController } from './modules/internal';
import { adminController } from './modules/admin';

export const app = new Elysia()
  .use(cors())
  .use(authGuard)
  .use(authController)
  .use(profilesController)
  .use(servicesController)
  .use(jobsController)
  .use(bookingsController)
  .use(earningsController)
  .use(supportController)
  .use(internalController)
  .use(adminController)
  .get('/health', () => ({
    status: 'ok',
    service: 'freelancer-service',
    timestamp: new Date().toISOString(),
  }));

if (import.meta.main) {
  const port = Number(process.env.PORT) || 3020;
  app.listen(port, () => console.log(`🤝 Freelancer Service running at :${port}`));
}
