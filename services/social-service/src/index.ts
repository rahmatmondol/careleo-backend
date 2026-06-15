// =====================================
// Social Service — Entry Point
// =====================================

import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { authGuard } from './middleware/auth';
import { feedRoutes } from './routes/feed.routes';
import { postsRoutes } from './routes/posts.routes';
import { commentsRoutes } from './routes/comments.routes';
import { likesRoutes } from './routes/likes.routes';
import { socialActionsRoutes } from './routes/social-actions.routes';

export const app = new Elysia()
  .use(cors())
  .use(authGuard)
  .use(feedRoutes)
  .use(postsRoutes)
  .use(commentsRoutes)
  .use(likesRoutes)
  .use(socialActionsRoutes)
  .get('/health', () => ({
    status: 'ok',
    service: 'social-service',
    timestamp: new Date().toISOString(),
  }));

if (import.meta.main) {
  const port = Number(process.env.PORT) || 3008;
  app.listen(port, () => console.log(`📱 Social Service running at :${port}`));
}
