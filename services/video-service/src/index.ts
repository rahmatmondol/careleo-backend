// =====================================
// Video Service — Entry Point
// =====================================

import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { authGuard } from './middleware/auth';
import { adminController } from './modules/admin';
import { consultationsController } from './modules/consultations';
import { camerasController } from './modules/cameras';
import { sessionsController } from './modules/sessions';

export const app = new Elysia()
  .use(cors())
  .use(authGuard)
  .use(adminController)
  .use(consultationsController)
  .use(camerasController)
  .use(sessionsController)
  .get('/health', () => ({
    status: 'ok',
    service: 'video-service',
    timestamp: new Date().toISOString(),
  }));

if (import.meta.main) {
  const port = Number(process.env.PORT) || 3014;
  app.listen(port, () => console.log(`🎥 Video Service running at :${port}`));
}
