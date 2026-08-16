/**
 * The one door every system-generated push goes through.
 *
 * Jobs and the notification queue call `deliverToUser` rather than
 * `NotificationsService.sendToUsers`, so a single place decides whether the
 * user actually wants to be buzzed right now. The in-app notification row is
 * written either way — turning a category off silences the phone, it does not
 * hide the event from the app's own list.
 */

import { NotificationsModel } from './model';
import { NotificationsService, type PushPayload } from './service';
import { getPreferenceContext, resolveDelivery } from './preferences';

export type DeliveryResult = {
  outcome: 'sent' | 'deferred' | 'suppressed';
  sent: number;
  failed: number;
  deferUntil?: string;
  reason?: string;
};

const recordInApp = async (userId: string, payload: PushPayload) => {
  try {
    await NotificationsModel.insertUserNotification({
      userId,
      type: payload.type ?? 'SYSTEM',
      title: payload.title,
      body: payload.body,
      dataJson: JSON.stringify(payload.data ?? {}),
    });
  } catch {}
};

export const deliverToUser = async (userId: string, payload: PushPayload): Promise<DeliveryResult> => {
  const { prefs, timezone } = await getPreferenceContext(userId);
  const decision = resolveDelivery(prefs, timezone, { type: payload.type, priority: payload.priority });

  if (decision.push === 'send') {
    const res = await NotificationsService.sendToUsers([userId], payload, { targetMode: 'single' });
    return { outcome: 'sent', sent: res.sent ?? 0, failed: res.failed ?? 0 };
  }

  await recordInApp(userId, payload);

  if (decision.push === 'suppress') {
    return { outcome: 'suppressed', sent: 0, failed: 0, reason: decision.reason };
  }

  // Quiet hours: hold the push until the user is awake rather than dropping it.
  // Imported lazily because the queue imports this module's siblings — a static
  // import here would close the cycle at module-evaluation time.
  try {
    const { enqueueDeferredPush } = await import('@/shared/queue');
    await enqueueDeferredPush(userId, payload, decision.deferUntil);
  } catch (e: any) {
    console.warn('[notifications] deferred push could not be queued:', e?.message ?? e);
  }

  return {
    outcome: 'deferred',
    sent: 0,
    failed: 0,
    deferUntil: decision.deferUntil.toISOString(),
    reason: decision.reason,
  };
};
