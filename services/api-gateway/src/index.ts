import { Elysia } from 'elysia';
import { swagger } from '@elysiajs/swagger';
import { corsPlugin } from './middleware/cors';
import { rateLimiter } from './middleware/rate-limit';
import { healthRoutes } from './routes/health.routes';
import { shopRoutes } from './routes/shop.routes';
import { socialRoutes } from './routes/social.routes';
import { videoRoutes } from './routes/video.routes';
import { mediaRoutes } from './routes/media.routes';
import { freelancerRoutes } from './routes/freelancer.routes';
import { careleoRoutes } from './routes/careleo.routes';

const PORT = Number(Bun.env.PORT) || 3000;

const app = new Elysia()
  // --- Global middleware ---
  .use(corsPlugin)
  .use(swagger({
    path: '/docs',
    documentation: {
      info: {
        title: 'CareLeo API Gateway',
        version: '2.0.0',
        description: 'Hybrid gateway: standalone shop/social/video services + careleo-backend monolith.',
      },
    },
  }))
  .use(rateLimiter)

  // --- Global error handler ---
  .onError(({ code, error, set }) => {
    if (code === 'NOT_FOUND') {
      set.status = 404;
      return { error: 'Not Found', message: 'The requested route does not exist on the gateway.' };
    }
    set.status = 500;
    return { error: 'Internal Server Error', message: error instanceof Error ? error.message : String(error) };
  })

  // --- Health ---
  .use(healthRoutes)

  // --- Standalone microservices (specific prefixes first) ---
  .use(shopRoutes)        // /api/v1/shop/*        -> shop-service
  .use(socialRoutes)      // /api/v1/social/*      -> social-service
  .use(videoRoutes)       // /api/v1/video/*       -> video-service
  .use(mediaRoutes)       // /api/v1/media/*       -> media-service
  .use(freelancerRoutes)  // /api/v1/freelancer/*  -> freelancer-service

  // --- Everything else -> careleo-backend (catch-all, registered last) ---
  .use(careleoRoutes) // /api/v1/*        -> careleo-backend

  .listen(PORT);

console.log(`🚪 CareLeo API Gateway running at http://localhost:${PORT}`);
console.log(`📖 Swagger docs at http://localhost:${PORT}/docs`);
console.log(`   /api/v1/shop/*        -> ${Bun.env.SHOP_SERVICE_URL || 'http://localhost:3004'}`);
console.log(`   /api/v1/social/*      -> ${Bun.env.SOCIAL_SERVICE_URL || 'http://localhost:3008'}`);
console.log(`   /api/v1/video/*       -> ${Bun.env.VIDEO_SERVICE_URL || 'http://localhost:3014'}`);
console.log(`   /api/v1/media/*       -> ${Bun.env.MEDIA_SERVICE_URL || 'http://localhost:3017'}`);
console.log(`   /api/v1/freelancer/*  -> ${Bun.env.FREELANCER_SERVICE_URL || 'http://localhost:3020'}`);
console.log(`   /api/v1/*             -> ${Bun.env.CARELEO_SERVICE_URL || 'http://localhost:3000'}`);

export { app };
