import { ValidationError } from '@/shared/errors';
import { NotificationsModel } from './model';

export const NotificationsService = {
  /**
   * Save or refresh device token for push delivery.
   */
  async registerDeviceToken(userId: string, payload: Record<string, unknown>) {
    const fcmToken = String(payload.fcmToken ?? '').trim();
    const platform = String(payload.platform ?? '').trim().toLowerCase();
    const appVersion = String(payload.appVersion ?? '').trim();

    if (!fcmToken || !platform) {
      throw new ValidationError('fcmToken and platform are required');
    }

    if (!['android', 'ios', 'web'].includes(platform)) {
      throw new ValidationError('platform must be android, ios, or web');
    }

    const token = await NotificationsModel.upsertDeviceToken({
      userId,
      fcmToken,
      platform,
      appVersion: appVersion || undefined,
    });

    return {
      id: token?.id,
      fcmToken,
      platform,
      isActive: true,
    };
  },

  /**
   * Deactivate device token on logout/uninstall.
   */
  async removeDeviceToken(userId: string, payload: Record<string, unknown>) {
    const fcmToken = String(payload.fcmToken ?? '').trim();
    if (!fcmToken) throw new ValidationError('fcmToken is required');

    await NotificationsModel.deactivateDeviceToken(userId, fcmToken);

    return { removed: true, fcmToken };
  },
};
