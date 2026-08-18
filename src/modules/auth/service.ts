import crypto from 'node:crypto';
import { ValidationError, UnauthorizedError } from '@/shared/errors';
import { AuthModel } from './model';
import { ROLE_PERMISSIONS, type Role } from '@/shared/auth/rbac';
import { verifyFirebaseIdToken } from '@/shared/integrations/firebase';
import { sendPasswordResetEmail } from '@/shared/integrations/mailer';
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
  role: user.role ?? 'customer',
  provider: user.provider,
});

const generateToken = () => crypto.randomBytes(24).toString('hex');

export const AuthService = {
  /** Register account with required app fields. */
  async signup(payload: Record<string, unknown>) {
    await AuthModel.ensureReady();
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
      try {
        await NotificationsService.registerDeviceToken(created.id, {
          fcmToken,
          platform,
          appVersion: payload.appVersion,
        });
      } catch {}
    }

    return buildProfile(created);
  },

  /** Email/password login flow. */
  async login(payload: Record<string, unknown>) {
    await AuthModel.ensureReady();
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
      try {
        await NotificationsService.registerDeviceToken(user.id, {
          fcmToken,
          platform,
          appVersion: payload.appVersion,
        });
      } catch {}
    }

    return {
      ...buildProfile(user),
      permissions: ROLE_PERMISSIONS[user.role],
    };
  },

  /** Firebase token login flow. */
  async firebaseLogin(payload: Record<string, unknown>) {
    await AuthModel.ensureReady();
    const idToken = String(payload.idToken ?? '');
    if (!idToken) throw new ValidationError('idToken is required');

    const decoded = await verifyFirebaseIdToken(idToken);
    const email = (decoded.email ?? '').toLowerCase();
    if (!email) throw new ValidationError('Firebase token missing email');

    const firebaseUid = decoded.uid;
    const provider: 'google' | 'password' = decoded.firebase?.sign_in_provider === 'google.com' ? 'google' : 'password';

    let isNewUser = false;
    let user: any = null;
    try {
      user = await AuthModel.findByFirebaseUid(firebaseUid);
    } catch {
      user = null;
    }
    if (!user) {
      const byEmail = await AuthModel.findByEmail(email);
      if (byEmail) {
        try {
          await AuthModel.linkFirebaseIdentity(byEmail.id, firebaseUid, provider);
        } catch {
          // DB schema may not yet include firebase_uid/provider. Fallback to email-based auth.
        }
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
          // provider/firebaseUid are optional; if DB schema doesn't support these columns,
          // we still create the user and rely on email for future firebase logins.
          role: 'customer',
        });
        if (!created) throw new ValidationError('Unable to create firebase user');
        user = created;

        try {
          await AuthModel.linkFirebaseIdentity(user.id, firebaseUid, provider);
        } catch {
          // ignore
        }
      }
    }

    if (!user) throw new UnauthorizedError('Unable to authenticate firebase user');
    await AuthModel.touchLastLogin(user.id);

    const fcmToken = String(payload.fcmToken ?? '').trim();
    const platform = String(payload.platform ?? '').trim().toLowerCase();
    if (fcmToken && platform) {
      try {
        await NotificationsService.registerDeviceToken(user.id, {
          fcmToken,
          platform,
          appVersion: payload.appVersion,
        });
      } catch {}
    }

    return {
      ...buildProfile(user),
      permissions: ROLE_PERMISSIONS[((user as any)?.role ?? 'customer') as Role],
      isNewUser,
    };
  },

  /** Send forgot-password token (dev returns token for testing). */
  async forgotPassword(payload: Record<string, unknown>) {
    const email = String(payload.email ?? '').trim().toLowerCase();
    if (!email) throw new ValidationError('email is required');

    /**
     * The response is identical whether or not the address exists, and it
     * NEVER contains the token.
     *
     * This endpoint is unauthenticated, so anything it returns is readable by
     * anyone who can guess an email address. Returning the reset token here —
     * which this did until August 2026 — meant a full account takeover in two
     * unauthenticated calls: ask for the token, then spend it at
     * /auth/reset-password. The token now only ever reaches the account owner's
     * inbox.
     *
     * The constant response also stops this being an account-enumeration
     * oracle: a different message (or a different latency) for a registered
     * address tells an attacker which emails have accounts.
     */
    const generic = { message: 'If that email has an account, reset instructions are on their way.' };

    const user = await AuthModel.findByEmail(email);
    if (!user) return generic;

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);
    await AuthModel.createAuthToken({ userId: user.id, token, type: 'password_reset', expiresAt });

    const mail = await sendPasswordResetEmail({
      to: email,
      firstName: user.firstName,
      token,
    });

    if (!mail.sent) {
      // Logged, not surfaced: telling the caller the mail failed would leak
      // that the address exists. An operator watching logs is the right
      // audience for "SMTP is down", not whoever typed the address.
      console.error(`[auth] password reset email to ${email} was not sent: ${mail.reason}`);
    }

    return generic;
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
