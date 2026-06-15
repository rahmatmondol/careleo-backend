import { Elysia } from 'elysia';
import { mediaReadGuard, mediaManageGuard } from './guards';
import { mediaReadRoutes } from './media.read.routes';
import { mediaManageRoutes } from './media.manage.routes';

export const mediaRoutes = (app: Elysia) =>
  mediaReadGuard(app).use(mediaReadRoutes).guard({}, (g) => mediaManageGuard(g).use(mediaManageRoutes));
