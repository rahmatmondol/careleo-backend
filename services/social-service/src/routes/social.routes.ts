// =====================================
// Social Routes — Feed, Posts, Comments, Likes, Shares, Follows
// =====================================

import { Elysia, t } from 'elysia';
import * as h from '../handlers/social.handlers';

const fwd = (r: any, s: any) => { if (r?.status >= 400) s.status = r.status; return r; };
const auth = (u: any, s: any) => { if (!u) { s.status = 401; return { error: 'Unauthorized' }; } return null; };

export const socialRoutes = new Elysia()
  // Public
  .get('/api/v1/social/feed', async ({ query, set }) => fwd(await h.getFeed(Number((query as any)?.page)||1, Number((query as any)?.limit)||20), set))
  .get('/api/v1/social/feed/trending', async ({ set }) => fwd(await h.getTrendingFeed(), set))
  .get('/api/v1/social/posts/:id', async ({ params, set }) => fwd(await h.getPost(params.id), set))
  .get('/api/v1/social/posts/:id/comments', async ({ params, set }) => fwd(await h.getComments(params.id), set))

  // Protected
  .post('/api/v1/social/posts', async ({ user, body, set }) => {
    const err = auth(user, set); if (err) return err;
    return fwd(await h.createPost(user!.id, body), set);
  }, { body: t.Object({ content: t.Optional(t.String()), imageUrl: t.Optional(t.String()), videoUrl: t.Optional(t.String()), petId: t.Optional(t.String()) }) })

  .delete('/api/v1/social/posts/:id', async ({ user, params, set }) => {
    const err = auth(user, set); if (err) return err;
    return fwd(await h.deletePost(params.id, user!.id), set);
  })

  .post('/api/v1/social/posts/:id/comments', async ({ user, params, body, set }) => {
    const err = auth(user, set); if (err) return err;
    return fwd(await h.addComment(params.id, user!.id, (body as any).content), set);
  }, { body: t.Object({ content: t.String({ minLength: 1 }) }) })

  .delete('/api/v1/social/posts/:id/comments/:commentId', async ({ user, params, set }) => {
    const err = auth(user, set); if (err) return err;
    return fwd(await h.deleteComment(params.commentId, user!.id), set);
  })

  .post('/api/v1/social/posts/:id/like', async ({ user, params, set }) => {
    const err = auth(user, set); if (err) return err;
    return fwd(await h.toggleLike(params.id, user!.id), set);
  })

  .post('/api/v1/social/posts/:id/share', async ({ user, params, body, set }) => {
    const err = auth(user, set); if (err) return err;
    return fwd(await h.sharePost(params.id, user!.id, (body as any)?.platform), set);
  }, { body: t.Optional(t.Object({ platform: t.Optional(t.String()) })) })

  .get('/api/v1/social/posts/:id/shares', async ({ params, set }) => fwd(await h.getShares(params.id), set))

  .post('/api/v1/social/users/:userId/follow', async ({ user, params, set }) => {
    const err = auth(user, set); if (err) return err;
    return fwd(await h.toggleFollow(user!.id, params.userId), set);
  })

  .get('/api/v1/social/users/:userId/posts', async ({ params, set }) => fwd(await h.getUserPosts(params.userId), set))
  .get('/api/v1/social/users/:userId/followers', async ({ params, set }) => fwd(await h.getFollowers(params.userId), set))
  .get('/api/v1/social/users/:userId/following', async ({ params, set }) => fwd(await h.getFollowing(params.userId), set))

  // Current user
  .get('/api/v1/social/followers', async ({ user, set }) => {
    const err = auth(user, set); if (err) return err;
    return fwd(await h.getFollowers(user!.id), set);
  })
  .get('/api/v1/social/following', async ({ user, set }) => {
    const err = auth(user, set); if (err) return err;
    return fwd(await h.getFollowing(user!.id), set);
  })
  .get('/api/v1/social/users/me/following/feed', async ({ user, set }) => {
    const err = auth(user, set); if (err) return err;
    return fwd(await h.getFollowingFeed(user!.id), set);
  })
  .get('/api/v1/social/notifications', async ({ user, set }) => {
    const err = auth(user, set); if (err) return err;
    return fwd(await h.getNotifications(user!.id), set);
  })
  .put('/api/v1/social/notifications/:id/read', async ({ user, params, set }) => {
    const err = auth(user, set); if (err) return err;
    return fwd(await h.markNotificationRead(params.id, user!.id), set);
  });
