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
