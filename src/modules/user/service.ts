import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ValidationError } from '@/shared/errors';
import { UserModel } from './model';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

export const UserService = {
  /** Get current user profile. */
  async getMe(userId: string) {
    return { success: true, data: await UserModel.getMe(userId), error: null };
  },

  /** Update current user profile fields. */
  async updateMe(userId: string, payload: Record<string, unknown>) {
    return { success: true, data: await UserModel.updateMe(userId, payload), error: null };
  },

  /** Upload user profile image and persist avatarUrl. */
  async uploadProfileImage(userId: string, file: File) {
    if (!file) throw new ValidationError('file is required');

    const extFromType = file.type?.includes('/') ? file.type.split('/')[1] : 'jpg';
    const safeExt = sanitizeFileName(extFromType || 'jpg');
    const safeName = sanitizeFileName(file.name || `profile.${safeExt}`);

    const dir = path.join(UPLOAD_ROOT, 'users', userId);
    await mkdir(dir, { recursive: true });

    const filename = `${Date.now()}-${safeName}`;
    const absolutePath = path.join(dir, filename);

    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(absolutePath, bytes);

    const avatarUrl = `/api/v1/uploads/users/${userId}/${filename}`;
    const updated = await UserModel.updateMe(userId, { avatarUrl });

    return {
      success: true,
      data: {
        message: 'Profile image uploaded successfully',
        avatarUrl,
        user: updated,
      },
      error: null,
    };
  },
};
