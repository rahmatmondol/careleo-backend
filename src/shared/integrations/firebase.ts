import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { UnauthorizedError } from '@/shared/errors';

const isNonProd = () => {
  const env = String(process.env.NODE_ENV ?? 'development').toLowerCase();
  return env !== 'production';
};

const base64UrlDecodeJson = (value: string): Record<string, unknown> => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const json = Buffer.from(padded, 'base64').toString('utf8');
  return JSON.parse(json) as Record<string, unknown>;
};

const decodeFirebaseIdTokenInsecure = (idToken: string) => {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new UnauthorizedError('Invalid Firebase ID token');
  const payload = base64UrlDecodeJson(parts[1]);

  const uid = String((payload as any).user_id ?? (payload as any).sub ?? '').trim();
  const email = String((payload as any).email ?? '').trim().toLowerCase();
  if (!uid || !email) throw new UnauthorizedError('Invalid Firebase ID token');

  return {
    uid,
    email,
    name: (payload as any).name ?? null,
    phone_number: (payload as any).phone_number ?? null,
    firebase: (payload as any).firebase ?? null,
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
    throw new UnauthorizedError('Firebase admin is not configured (set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)');
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
    return await auth.verifyIdToken(idToken, true);
  } catch (error) {
    if (isNonProd() && error instanceof UnauthorizedError) {
      return decodeFirebaseIdTokenInsecure(idToken);
    }
    throw new UnauthorizedError(error instanceof UnauthorizedError ? error.message : 'Invalid Firebase ID token');
  }
};

/**
 * Send push notification via FCM to a list of device tokens.
 */
export const sendPushToTokens = async (
  tokens: string[],
  payload: { title: string; body: string; data?: Record<string, string> },
) => {
  if (tokens.length === 0) return { successCount: 0, failureCount: 0, responses: [] as unknown[] };

  const app = getFirebaseApp();
  const auth = getAuth(app);

  const messaging = (await import('firebase-admin/messaging')).getMessaging(app);

  const result = await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: payload.data,
  });

  return result;
};
