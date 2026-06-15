import { Elysia } from 'elysia';
import { hasPermission } from '../constants/permissions';

export const mediaReadGuard = (app: Elysia) =>
  app.guard({
    beforeHandle: ({ user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      const role = String(user.role || '').toUpperCase();
      if (!hasPermission(role, 'media.read')) {
        set.status = 403;
        return { error: 'Forbidden', message: 'Missing permission: media.read' };
      }
    },
  });

export const mediaManageGuard = (app: Elysia) =>
  app.guard({
    beforeHandle: ({ user, set }) => {
      const role = String(user?.role || '').toUpperCase();
      if (!hasPermission(role, 'media.manage')) {
        set.status = 403;
        return { error: 'Forbidden', message: 'Missing permission: media.manage' };
      }
    },
  });
