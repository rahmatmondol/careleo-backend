import { Elysia } from 'elysia';
import { UsersService } from './service';
import { requireAuth } from '@/shared/auth/guards';

export const usersController = new Elysia({ name: 'users-controller' }).group('/users', (app) =>
  app
    /** Get authenticated user's editable profile payload. */
    .get('/profile', async (ctx: any) => {
      const { headers, jwt } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return UsersService.getMyProfile(authUser.id);
    })
    /** Update authenticated user's profile details from app edit screen. */
    .put('/profile', async (ctx: any) => {
      const { headers, jwt, body } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return UsersService.updateMyProfile(authUser.id, body as Record<string, unknown>);
    }),
);
