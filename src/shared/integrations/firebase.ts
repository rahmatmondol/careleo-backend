import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { UnauthorizedError } from '@/shared/errors';

/**
 * Build Firebase Admin app using environment variables.
 */
const getFirebaseApp = () => {
  if (getApps().length > 0) return getApps()[0];

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new UnauthorizedError('Firebase admin is not configured');
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

  const app = getFirebaseApp();
  const auth = getAuth(app);

  try {
    return await auth.verifyIdToken(idToken, true);
  } catch {
    throw new UnauthorizedError('Invalid Firebase ID token');
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
