import { CommentsModel } from './model';
import { NotificationsModel } from '../notifications/model';

export const CommentsService = {
  /** Add a comment or reply. parentId (optional) makes it a reply. */
  async add(postId: string, userId: string, content: string, parentId?: string) {
    const text = content?.trim();
    if (!text) return { status: 400, error: 'Comment cannot be empty' };

    // If replying, the parent must exist and belong to the same post.
    if (parentId) {
      const parent = await CommentsModel.findById(parentId);
      if (!parent || parent.postId !== postId) return { status: 404, error: 'Parent comment not found' };
      // Keep threading one level deep: a reply to a reply attaches to the top-level parent.
      if (parent.parentId) parentId = parent.parentId;
    }

    const comment = await CommentsModel.add({ postId, userId, content: text, parentId });

    const ownerId = await CommentsModel.postOwner(postId);
    if (ownerId && ownerId !== userId) {
      await NotificationsModel.create({ userId: ownerId, actorId: userId, type: 'comment', message: 'Someone commented on your post', postId });
    }
    return { data: { comment } };
  },

  /** Top-level comments with their replies nested one level deep. */
  async list(postId: string) {
    const [top, replies] = await Promise.all([
      CommentsModel.listTopLevel(postId),
      CommentsModel.listReplies(postId),
    ]);
    const byParent = new Map<string, any[]>();
    for (const r of replies) {
      const key = r.parentId as string;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(r);
    }
    const comments = top.map((c) => ({ ...c, replies: byParent.get(c.id) ?? [] }));
    return { data: { comments } };
  },

  async remove(commentId: string, userId: string) {
    const comment = await CommentsModel.findById(commentId);
    if (!comment) return { status: 404, error: 'Comment not found' };
    if (comment.userId !== userId) return { status: 403, error: 'Not authorized' };
    await CommentsModel.remove(commentId, comment.postId);
    return { data: { message: 'Comment deleted' } };
  },

  /** Toggle a like on a comment. */
  async toggleLike(commentId: string, userId: string) {
    const comment = await CommentsModel.findById(commentId);
    if (!comment) return { status: 404, error: 'Comment not found' };

    const existing = await CommentsModel.findLike(commentId, userId);
    if (existing) {
      await CommentsModel.removeLike(existing.id, commentId);
      return { data: { liked: false, message: 'Unliked' } };
    }
    await CommentsModel.addLike(commentId, userId);
    if (comment.userId !== userId) {
      await NotificationsModel.create({ userId: comment.userId, actorId: userId, type: 'comment_like', message: 'Someone liked your comment', postId: comment.postId });
    }
    return { data: { liked: true, message: 'Liked' } };
  },
};
