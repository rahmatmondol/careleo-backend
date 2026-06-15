// =====================================
// Social Actions Routes — share, follow/unfollow, followers/following, notifications
// =====================================

import { Elysia, t } from 'elysia';
import {
  sharePost, getShares,
  followUser, unfollowUser, getFollowers, getFollowing,
  getNotifications, markNotificationRead,
} from '../handlers/social-actions.handlers';

const fwd = (r: any, s: any) => { if (r?.status >= 400) s.status = r.status; return r; };

export const socialActionsRoutes = (app: Elysia) =>
  app.group('/api/v1/social', (group) =>
    group
      // Public
      .get('/posts/:id/shares', async ({ params, set }) =>
        fwd(await getShares((params as any).id), set))
      .get('/users/:id/followers', async ({ params, set }) =>
        fwd(await getFollowers((params as any).id), set))
      .get('/users/:id/following', async ({ params, set }) =>
        fwd(await getFollowing((params as any).id), set))
      // Auth-protected
      .guard({
        beforeHandle: ({ user, set }) => { if (!user) { set.status = 401; return { error: 'Unauthorized' }; } }
      }, (g) =>
        g
          .post('/posts/:id/share', async ({ user, params, body, set }) =>
            fwd(await sharePost((params as any).id, user!.id, (body as any)?.platform), set), {
            body: t.Optional(t.Object({ platform: t.Optional(t.String()) }))
          })
          .post('/users/:id/follow', async ({ user, params, set }) =>
            fwd(await followUser(user!.id, (params as any).id), set))
          .delete('/users/:id/follow', async ({ user, params, set }) =>
            fwd(await unfollowUser(user!.id, (params as any).id), set))
          .get('/notifications', async ({ user, set }) =>
            fwd(await getNotifications(user!.id), set))
          .put('/notifications/:id/read', async ({ user, params, set }) =>
            fwd(await markNotificationRead((params as any).id, user!.id), set))
      )
  );
