import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/shared/db';
import { users, pets, likes, bookmarks } from '@/shared/db/schema';

/**
 * Decorate raw post rows with everything a client needs to render a feed card.
 *
 * `posts` stores only `userId` and `petId`. While social lived in its own
 * database (`careleo_social`) there was no way to resolve those into a name and
 * an avatar, so every consumer invented something: the mobile feed read an
 * `author` field the API never sent and rendered blank cards, and the admin
 * panel fell back to showing `User a1b2c3d4`. Now that `users` and `pets` sit
 * in the same database as `posts`, one join fixes both.
 *
 * Two batched queries regardless of page size — collect the distinct ids, fetch
 * them in one `IN (…)` each, then stitch. Enriching row-by-row would be N+1.
 *
 * Everything added here is *additive*: the original columns are untouched, so
 * the admin panel's existing `normalizeSocialPost` keeps working unchanged and
 * simply gains real names.
 */

export type EnrichedPost = Record<string, any>;

const displayNameOf = (u?: { firstName?: string | null; lastName?: string | null; email?: string | null }) => {
  if (!u) return 'CareLeo user';
  const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return full || u.email?.split('@')[0] || 'CareLeo user';
};

const userNameOf = (u?: { email?: string | null }, id?: string) =>
  u?.email ? `@${u.email.split('@')[0]}` : `@user${String(id ?? '').slice(0, 6)}`;

/**
 * @param rows      raw post rows
 * @param viewerId  the signed-in user, if any — drives `isLiked` / `isMine`
 */
export async function enrichPosts<T extends { id: string; userId: string; petId?: string | null }>(
  rows: T[],
  viewerId?: string | null,
): Promise<EnrichedPost[]> {
  if (!rows.length) return [];

  const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))];
  const petIds = [...new Set(rows.map((r) => r.petId).filter(Boolean) as string[])];
  const postIds = rows.map((r) => r.id);

  const [authorRows, petRows, likedRows, bookmarkedRows] = await Promise.all([
    userIds.length
      ? db
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            avatarUrl: users.avatarUrl,
          })
          .from(users)
          .where(inArray(users.id, userIds))
      : [],
    petIds.length
      ? db.select({ id: pets.id, name: pets.name }).from(pets).where(inArray(pets.id, petIds))
      : [],
    // Only ask which posts the viewer liked when there *is* a viewer — and
    // scope it to that viewer, or every post with a single like from anyone
    // would come back marked as liked by everyone.
    viewerId
      ? db
          .select({ postId: likes.postId })
          .from(likes)
          .where(and(inArray(likes.postId, postIds), eq(likes.userId, viewerId)))
      : [],
    viewerId
      ? db
          .select({ postId: bookmarks.postId })
          .from(bookmarks)
          .where(and(inArray(bookmarks.postId, postIds), eq(bookmarks.userId, viewerId)))
      : [],
  ]);

  const authorById = new Map(authorRows.map((u) => [u.id, u]));
  const petById = new Map(petRows.map((p) => [p.id, p]));
  const likedIds = new Set(likedRows.map((r) => r.postId));
  const bookmarkedIds = new Set(bookmarkedRows.map((r) => r.postId));

  return rows.map((row) => {
    const author = authorById.get(row.userId);
    const pet = row.petId ? petById.get(row.petId) : undefined;

    return {
      ...row,

      /** Nested author, matching the shape the mobile feed and admin panel expect. */
      author: {
        id: row.userId,
        displayName: displayNameOf(author),
        userName: userNameOf(author, row.userId),
        avatarUrl: author?.avatarUrl ?? null,
      },
      // Flattened duplicates so a card can read them without drilling in.
      displayName: displayNameOf(author),
      userName: userNameOf(author, row.userId),
      avatarUrl: author?.avatarUrl ?? null,
      petName: pet?.name ?? null,

      /**
       * The columns are `likeCount` / `commentCount` / `shareCount`; the app was
       * written against `likesCount` / `commentsCount` / `sharesCount`. Both are
       * sent so neither side has to be wrong.
       */
      likesCount: (row as any).likeCount ?? 0,
      commentsCount: (row as any).commentCount ?? 0,
      sharesCount: (row as any).shareCount ?? 0,

      /** Viewer-relative state. False for anonymous callers. */
      isLiked: likedIds.has(row.id),
      isBookmarked: bookmarkedIds.has(row.id),
      isMine: Boolean(viewerId) && row.userId === viewerId,
    };
  });
}

/** Single-row convenience wrapper. */
export async function enrichPost<T extends { id: string; userId: string; petId?: string | null }>(
  row: T,
  viewerId?: string | null,
): Promise<EnrichedPost> {
  const [enriched] = await enrichPosts([row], viewerId);
  return enriched;
}

/**
 * Same treatment for comment rows, which carry only `userId` too.
 */
export async function enrichComments<T extends { id: string; userId: string }>(
  rows: T[],
  viewerId?: string | null,
): Promise<EnrichedPost[]> {
  if (!rows.length) return [];

  const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))];
  const authorRows = userIds.length
    ? await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(inArray(users.id, userIds))
    : [];

  const authorById = new Map(authorRows.map((u) => [u.id, u]));

  return rows.map((row) => {
    const author = authorById.get(row.userId);
    return {
      ...row,
      author: {
        id: row.userId,
        displayName: displayNameOf(author),
        userName: userNameOf(author, row.userId),
        avatarUrl: author?.avatarUrl ?? null,
      },
      displayName: displayNameOf(author),
      avatarUrl: author?.avatarUrl ?? null,
      likesCount: (row as any).likeCount ?? 0,
      isMine: Boolean(viewerId) && row.userId === viewerId,
    };
  });
}
