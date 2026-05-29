import crypto from 'node:crypto';
import { ValidationError, UnauthorizedError } from '@/shared/errors';
import { AuthModel } from './model';
import { ROLE_PERMISSIONS } from '@/shared/auth/rbac';
import { verifyFirebaseIdToken } from '@/shared/integrations/firebase';
import { NotificationsService } from '@/modules/notifications/service';

const splitName = (name?: string | null) => {
  const raw = (name ?? '').trim();
  if (!raw) return { firstName: 'Careleo', lastName: 'User' };
  const parts = raw.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: 'User' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
};

const buildProfile = (user: any) => ({
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  phone: user.phone ?? null,
  avatarUrl: user.avatarUrl ?? null,
  address: user.address ?? null,
  city: user.city ?? null,
  state: user.state ?? null,
  country: user.country ?? null,
  postalCode: user.postalCode ?? null,
  role: user.role,
  provider: user.provider,
});

const generateToken = () => crypto.randomBytes(24).toString('hex');

export const AuthService = {
  /** Register account with required app fields. */
  async signup(payload: Record<string, unknown>) {
    const firstName = String(payload.firstName ?? '').trim();
    const lastName = String(payload.lastName ?? '').trim();
    const email = String(payload.email ?? '').trim().toLowerCase();
    const phone = String(payload.phone ?? '').trim();
    const password = String(payload.password ?? '');

    if (!firstName || !lastName || !email || !password) {
      throw new ValidationError('firstName, lastName, email and password are required');
    }

    const existing = await AuthModel.findByEmail(email);
    if (existing) throw new ValidationError('Email already exists');

    const passwordHash = await Bun.password.hash(password);
    const created = await AuthModel.createUser({
      firstName,
      lastName,
      email,
      phone: phone || undefined,
      passwordHash,
      role: 'customer',
      provider: 'password',
    });

    if (!created) throw new ValidationError('Unable to create user');

    const fcmToken = String(payload.fcmToken ?? '').trim();
    const platform = String(payload.platform ?? '').trim().toLowerCase();
    if (fcmToken && platform) {
      await NotificationsService.registerDeviceToken(created.id, {
        fcmToken,
        platform,
        appVersion: payload.appVersion,
      });
    }

    return buildProfile(created);
  },

  /** Email/password login flow. */
  async login(payload: Record<string, unknown>) {
    const email = String(payload.email ?? '').trim().toLowerCase();
    const password = String(payload.password ?? '');
    if (!email || !password) throw new ValidationError('email and password are required');

    const user = await AuthModel.findByEmail(email);
    if (!user) throw new UnauthorizedError('Invalid email or password');

    const passwordOk = await Bun.password.verify(password, user.passwordHash);
    if (!passwordOk) throw new UnauthorizedError('Invalid email or password');

    await AuthModel.touchLastLogin(user.id);

    const fcmToken = String(payload.fcmToken ?? '').trim();
    const platform = String(payload.platform ?? '').trim().toLowerCase();
    if (fcmToken && platform) {
      await NotificationsService.registerDeviceToken(user.id, {
        fcmToken,
        platform,
        appVersion: payload.appVersion,
      });
    }

    return {
      ...buildProfile(user),
      permissions: ROLE_PERMISSIONS[user.role],
    };
  },

  /** Firebase token login flow. */
  async firebaseLogin(payload: Record<string, unknown>) {
    const idToken = String(payload.idToken ?? '');
    if (!idToken) throw new ValidationError('idToken is required');

    const decoded = await verifyFirebaseIdToken(idToken);
    const email = (decoded.email ?? '').toLowerCase();
    if (!email) throw new ValidationError('Firebase token missing email');

    const firebaseUid = decoded.uid;
    const provider: 'google' | 'password' = decoded.firebase?.sign_in_provider === 'google.com' ? 'google' : 'password';

    let isNewUser = false;
    let user = await AuthModel.findByFirebaseUid(firebaseUid);
    if (!user) {
      const byEmail = await AuthModel.findByEmail(email);
      if (byEmail) {
        await AuthModel.linkFirebaseIdentity(byEmail.id, firebaseUid, provider);
        user = await AuthModel.getById(byEmail.id);
      } else {
        isNewUser = true;
        const fullName = splitName(decoded.name);
        const created = await AuthModel.createUser({
          firstName: fullName.firstName,
          lastName: fullName.lastName,
          email,
          phone: decoded.phone_number ?? undefined,
          passwordHash: await Bun.password.hash(`firebase:${firebaseUid}`),
          provider,
          firebaseUid,
          role: 'customer',
        });
        if (!created) throw new ValidationError('Unable to create firebase user');
        user = created;
      }
    }

    if (!user) throw new UnauthorizedError('Unable to authenticate firebase user');
    await AuthModel.touchLastLogin(user.id);

    const fcmToken = String(payload.fcmToken ?? '').trim();
    const platform = String(payload.platform ?? '').trim().toLowerCase();
    if (fcmToken && platform) {
      await NotificationsService.registerDeviceToken(user.id, {
        fcmToken,
        platform,
        appVersion: payload.appVersion,
      });
    }

    return {
      ...buildProfile(user),
      permissions: ROLE_PERMISSIONS[user.role],
      isNewUser,
    };
  },

  /** Send forgot-password token (dev returns token for testing). */
  async forgotPassword(payload: Record<string, unknown>) {
    const email = String(payload.email ?? '').trim().toLowerCase();
    if (!email) throw new ValidationError('email is required');

    const user = await AuthModel.findByEmail(email);
    if (!user) return { message: 'If the email exists, reset instructions were sent.' };

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);
    await AuthModel.createAuthToken({ userId: user.id, token, type: 'password_reset', expiresAt });

    return {
      message: 'Reset token generated.',
      token,
      expiresAt: expiresAt.toISOString(),
    };
  },

  /** Verify email with one-time token. */
  async verifyEmail(payload: Record<string, unknown>) {
    const token = String(payload.token ?? '').trim();
    if (!token) throw new ValidationError('token is required');

    const authToken = await AuthModel.findActiveAuthToken(token, 'email_verify');
    if (!authToken) throw new ValidationError('Invalid or expired token');

    await AuthModel.consumeAuthToken(authToken.id);
    return { message: 'Email verified successfully.' };
  },

  /** Create password with one-time token (for invited/social accounts). */
  async createPassword(payload: Record<string, unknown>) {
    const token = String(payload.token ?? '').trim();
    const password = String(payload.password ?? '');
    if (!token || !password) throw new ValidationError('token and password are required');
    if (password.length < 8) throw new ValidationError('Password must be at least 8 characters');

    const authToken = await AuthModel.findActiveAuthToken(token, 'create_password');
    if (!authToken) throw new ValidationError('Invalid or expired token');

    const hash = await Bun.password.hash(password);
    await AuthModel.updatePassword(authToken.userId, hash);
    await AuthModel.consumeAuthToken(authToken.id);

    return { message: 'Password created successfully.' };
  },

  /** Reset password with forgot-password token. */
  async resetPassword(payload: Record<string, unknown>) {
    const token = String(payload.token ?? '').trim();
    const password = String(payload.password ?? '');
    if (!token || !password) throw new ValidationError('token and password are required');
    if (password.length < 8) throw new ValidationError('Password must be at least 8 characters');

    const authToken = await AuthModel.findActiveAuthToken(token, 'password_reset');
    if (!authToken) throw new ValidationError('Invalid or expired token');

    const hash = await Bun.password.hash(password);
    await AuthModel.updatePassword(authToken.userId, hash);
    await AuthModel.consumeAuthToken(authToken.id);

    return { message: 'Password reset successful.' };
  },

  /** Current authenticated user profile. */
  async me(userId: string) {
    const user = await AuthModel.getById(userId);
    if (!user) throw new UnauthorizedError('User not found');

    return {
      ...buildProfile(user),
      permissions: ROLE_PERMISSIONS[user.role],
    };
  },
};
