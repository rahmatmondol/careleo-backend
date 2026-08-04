import { PostsModel } from './model';
import { enrichPost, enrichPosts } from '../shared/enrich';

/** Business logic for posts. Returns `{ data }` on success or `{ status, error }` on failure. */
export const PostsService = {
  async list(page = 1, limit = 20, viewerId?: string | null) {
    const offset = (page - 1) * limit;
    const [posts, total] = await Promise.all([PostsModel.listActive(limit, offset), PostsModel.countActive()]);
    return { data: { posts: await enrichPosts(posts, viewerId), total, page, limit } };
  },

  async create(userId: string, body: { content?: string; imageUrl?: string; videoUrl?: string; petId?: string }) {
    const content = body.content?.trim();
    // A post must carry something — reject fully empty submissions.
    if (!content && !body.imageUrl && !body.videoUrl) {
      return { status: 400, error: 'A post needs text, an image, or a video' };
    }
    const post = await PostsModel.insert({
      userId, content, imageUrl: body.imageUrl, videoUrl: body.videoUrl, petId: body.petId,
    });
    if (!post) return { status: 500, error: 'Failed to create post' };
    return { data: { post: await enrichPost(post, userId) }, status: 201 };
  },

  async get(postId: string, viewerId?: string | null) {
    const post = await PostsModel.findById(postId);
    if (!post) return { status: 404, error: 'Post not found' };
    return { data: { post: await enrichPost(post, viewerId) } };
  },

  async update(postId: string, userId: string, body: { content?: string; imageUrl?: string; videoUrl?: string; petId?: string }) {
    const post = await PostsModel.findById(postId);
    if (!post) return { status: 404, error: 'Post not found' };
    if (post.userId !== userId) return { status: 403, error: 'Not authorized' };

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.content !== undefined) updateData.content = body.content;
    if (body.imageUrl !== undefined) updateData.imageUrl = body.imageUrl;
    if (body.videoUrl !== undefined) updateData.videoUrl = body.videoUrl;
    if (body.petId !== undefined) updateData.petId = body.petId;

    const updated = await PostsModel.update(postId, updateData);
    return { data: { post: await enrichPost(updated, userId) } };
  },

  async remove(postId: string, userId: string) {
    const post = await PostsModel.findById(postId);
    if (!post) return { status: 404, error: 'Post not found' };
    if (post.userId !== userId) return { status: 403, error: 'Not authorized' };
    await PostsModel.remove(postId);
    return { data: { message: 'Post deleted' } };
  },

  async listByUser(userId: string, viewerId?: string | null) {
    return { data: { posts: await enrichPosts(await PostsModel.listByUser(userId), viewerId) } };
  },
};
