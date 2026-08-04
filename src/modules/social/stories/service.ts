import { StoriesModel } from './model';

const STORY_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export const StoriesService = {
  async create(userId: string, body: { imageUrl?: string; caption?: string; petId?: string }) {
    if (!body.imageUrl) return { status: 400, error: 'A story needs an image' };
    const story = await StoriesModel.insert({
      userId,
      petId: body.petId,
      imageUrl: body.imageUrl,
      caption: body.caption,
      expiresAt: new Date(Date.now() + STORY_TTL_MS),
    });
    return { data: { story } };
  },

  /** Active stories grouped by user, for the stories rail. */
  async listActive() {
    const rows = await StoriesModel.listActive();
    const groups = new Map<string, { userId: string; stories: typeof rows }>();
    for (const s of rows) {
      if (!groups.has(s.userId)) groups.set(s.userId, { userId: s.userId, stories: [] });
      groups.get(s.userId)!.stories.push(s);
    }
    return { data: { stories: Array.from(groups.values()) } };
  },

  async remove(storyId: string, userId: string) {
    const story = await StoriesModel.findById(storyId);
    if (!story) return { status: 404, error: 'Story not found' };
    if (story.userId !== userId) return { status: 403, error: 'Not authorized' };
    await StoriesModel.remove(storyId, userId);
    return { data: { message: 'Story deleted' } };
  },
};
