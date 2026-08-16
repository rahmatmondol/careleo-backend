import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { UnauthorizedError } from '@/shared/errors';

const isNonProd = () => {
  const env = String(process.env.NODE_ENV ?? 'development').toLowerCase();
  return env !== 'production';
};

const base64UrlDecodeJson = (value: string): Record<string, unknown> => {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new UnauthorizedError('Invalid Firebase ID token payload format');
  }
};

const decodeFirebaseIdTokenInsecure = (idToken: string) => {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new UnauthorizedError('Invalid Firebase ID token structure');
  const payload = base64UrlDecodeJson(parts[1]);

  const uid = String((payload as any).user_id ?? (payload as any).sub ?? (payload as any).uid ?? '').trim();
  const email = String(
    (payload as any).email ?? (payload as any).firebase?.identities?.email?.[0] ?? '',
  )
    .trim()
    .toLowerCase();

  if (!uid) throw new UnauthorizedError('Firebase ID token missing user ID');

  const finalEmail = email || `${uid}@careleo.user`;

  return {
    uid,
    email: finalEmail,
    name: (payload as any).name ?? (payload as any).displayName ?? null,
    phone_number: (payload as any).phone_number ?? (payload as any).phoneNumber ?? null,
    firebase: (payload as any).firebase ?? { sign_in_provider: 'custom' },
  } as any;
};

/**
 * Build Firebase Admin app using environment variables.
 */
const getFirebaseApp = () => {
  if (getApps().length > 0) return getApps()[0];

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new UnauthorizedError(
      'Firebase admin is not configured (set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)',
    );
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
};

/**
 * Verify a Firebase ID token received from mobile app.
 */
export const verifyFirebaseIdToken = async (idToken: string) => {
  if (!idToken) throw new UnauthorizedError('Firebase ID token is required');

  try {
    const app = getFirebaseApp();
    const auth = getAuth(app);
    return await auth.verifyIdToken(idToken);
  } catch (error: any) {
    console.warn('[Firebase Auth Warning]: Verification failed with Admin SDK:', error?.message || error);
    if (isNonProd()) {
      try {
        return decodeFirebaseIdTokenInsecure(idToken);
      } catch (insecureErr: any) {
        console.error('[Firebase Insecure Decode Error]:', insecureErr?.message || insecureErr);
        throw insecureErr;
      }
    }
    const message = error instanceof Error ? error.message : 'Invalid Firebase ID token';
    throw new UnauthorizedError(`Firebase authentication failed: ${message}`);
  }
};

/**
 * Android notification channels. These ids must match the channels the mobile
 * app creates in `src/services/notificationChannels.ts` — an unknown id falls
 * back to the app's default channel, which silently loses the importance and
 * the sound we asked for.
 */
export const PUSH_CHANNELS = {
  critical: 'careleo-critical',
  tasks: 'careleo-tasks',
  default: 'careleo-default',
  quiet: 'careleo-quiet',
} as const;

export type PushChannel = (typeof PUSH_CHANNELS)[keyof typeof PUSH_CHANNELS];

/**
 * Send push notification via FCM to a list of device tokens.
 *
 * `channelId` decides how loudly it lands on Android; `critical` also raises
 * the APNs interruption level so a missed dose can break through Focus.
 *
 * `dataOnly` omits the `notification` block so the payload is delivered to the
 * app's background handler instead of being drawn by the OS. That is what makes
 * the Done / Snooze buttons possible on Android — the app draws the
 * notification itself, with actions attached. iOS gets the ordinary
 * notification block plus an APNs `category`, which is how actions are attached
 * there. Callers are expected to send one call per platform.
 */
export const sendPushToTokens = async (
  tokens: string[],
  payload: {
    title: string;
    body: string;
    data?: Record<string, string>;
    channelId?: PushChannel;
    critical?: boolean;
    dataOnly?: boolean;
    categoryId?: string;
  },
) => {
  if (tokens.length === 0) return { successCount: 0, failureCount: 0, responses: [] as unknown[] };

  const app = getFirebaseApp();

  const messaging = (await import('firebase-admin/messaging')).getMessaging(app);

  const channelId = payload.channelId ?? PUSH_CHANNELS.default;
  const quiet = channelId === PUSH_CHANNELS.quiet;

  // A data-only message carries its own copy of the text, since there is no
  // notification block for the client to read it from.
  const data: Record<string, string> = {
    ...(payload.data ?? {}),
    channelId,
    ...(payload.dataOnly ? { title: payload.title, body: payload.body } : {}),
    ...(payload.categoryId ? { categoryId: payload.categoryId } : {}),
  };

  const result = await messaging.sendEachForMulticast({
    tokens,
    ...(payload.dataOnly
      ? {}
      : { notification: { title: payload.title, body: payload.body } }),
    data,
    android: {
      priority: quiet ? 'normal' : 'high',
      ...(payload.dataOnly
        ? {}
        : { notification: { channelId, sound: quiet ? undefined : 'default' } }),
    },
    apns: {
      payload: {
        aps: {
          sound: quiet ? undefined : 'default',
          interruptionLevel: payload.critical ? 'time-sensitive' : quiet ? 'passive' : 'active',
          ...(payload.categoryId ? { category: payload.categoryId } : {}),
        },
      },
    },
  });

  return result;
};
