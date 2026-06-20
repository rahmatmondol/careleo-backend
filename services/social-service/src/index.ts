// =====================================
// Social Service — Entry Point
// =====================================

import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { authGuard } from './middleware/auth';
import { feedController } from './modules/feed';
import { postsController } from './modules/posts';
import { commentsController } from './modules/comments';
import { likesController } from './modules/likes';
import { followsController } from './modules/follows';
import { sharesController } from './modules/shares';
import { notificationsController } from './modules/notifications';
import { bookmarksController } from './modules/bookmarks';
import { storiesController } from './modules/stories';
import { reportsController } from './modules/reports';
import { adminController } from './modules/admin';

export const app = new Elysia()
  .use(cors())
  .use(authGuard)
  .use(feedController)
  .use(postsController)
  .use(commentsController)
  .use(likesController)
  .use(followsController)
  .use(sharesController)
  .use(notificationsController)
  .use(bookmarksController)
  .use(storiesController)
  .use(reportsController)
  .use(adminController)
  .get('/health', () => ({
    status: 'ok',
    service: 'social-service',
    timestamp: new Date().toISOString(),
  }));

if (import.meta.main) {
  const port = Number(process.env.PORT) || 3008;
  app.listen(port, () => console.log(`📱 Social Service running at :${port}`));
}
