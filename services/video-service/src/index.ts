import { Elysia } from 'elysia';
import { authPlugin } from './middleware/auth';
import { consultationRoutes } from './routes/consultations.routes';
import { cameraRoutes } from './routes/cameras.routes';
import { sessionRoutes } from './routes/sessions.routes';

const app = new Elysia()
  // Health check (no auth)
  .get('/health', () => ({
    status: 'ok',
    service: 'video-service',
    timestamp: new Date().toISOString(),
  }))

  // Protected video routes
  .group('/api/v1/video', (group) =>
    group
      .use(authPlugin)
      .use(consultationRoutes)
      .use(cameraRoutes)
      .use(sessionRoutes)
  );

if (import.meta.main) {
  const PORT = parseInt(process.env.PORT || '3014');
  app.listen(PORT, () => {
    console.log(`🎥 Pawly Video Service running on port ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   API:    http://localhost:${PORT}/api/v1/video`);
  });
}

export { app };
