import * as admin from 'firebase-admin';
import { env } from '../../config/env';

/**
 * Initialize Firebase Admin SDK
 * Uses service account credentials from environment
 */
let firebaseApp: admin.app.App;

export const initializeFirebase = () => {
  if (!firebaseApp) {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
      }),
    });
  }
  return firebaseApp;
};

export const getFirebaseAuth = () => {
  if (!firebaseApp) initializeFirebase();
  return admin.auth(firebaseApp);
};

/**
 * Firebase Auth Service
 * Handles token verification and user management
 */
export const firebaseAuthService = {
  /**
   * Verify Firebase ID Token
   * Called by backend to verify tokens from mobile app
   */
  async verifyIdToken(idToken: string) {
    try {
      const auth = getFirebaseAuth();
      const decodedToken = await auth.verifyIdToken(idToken);
      return { success: true, decodedToken };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token verification failed'
      };
    }
  },

  /**
   * Get Firebase User by UID
   */
  async getUserByUID(uid: string) {
    try {
      const auth = getFirebaseAuth();
      const user = await auth.getUser(uid);
      return { success: true, user };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'User not found'
      };
    }
  },

  /**
   * Get Firebase User by Email
   */
  async getUserByEmail(email: string) {
    try {
      const auth = getFirebaseAuth();
      const user = await auth.getUserByEmail(email);
      return { success: true, user };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'User not found'
      };
    }
  },

  /**
   * Disable Firebase User Account
   */
  async disableUser(uid: string) {
    try {
      const auth = getFirebaseAuth();
      await auth.updateUser(uid, { disabled: true });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to disable user'
      };
    }
  },

  /**
   * Enable Firebase User Account
   */
  async enableUser(uid: string) {
    try {
      const auth = getFirebaseAuth();
      await auth.updateUser(uid, { disabled: false });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to enable user'
      };
    }
  },

  /**
   * Delete Firebase User Account
   */
  async deleteUser(uid: string) {
    try {
      const auth = getFirebaseAuth();
      await auth.deleteUser(uid);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete user'
      };
    }
  }
};
