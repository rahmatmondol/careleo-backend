import { ValidationError, UnauthorizedError } from '@/shared/errors';
import { AuthModel } from './model';
import { ROLE_PERMISSIONS } from '@/shared/auth/rbac';
import { verifyFirebaseIdToken } from '@/shared/integrations/firebase';

const splitName = (name?: string | null) => {
  const raw = (name ?? '').trim();
  if (!raw) return { firstName: 'Careleo', lastName: 'User' };

  const parts = raw.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: 'User' };

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
};

export const AuthService = {
  /**
   * Register a new account from app register form fields.
   * Required: firstName, lastName, email, password
   * Optional: phone
   * Forced default role: customer
   */
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

    return {
      id: created.id,
      firstName: created.firstName,
      lastName: created.lastName,
      email: created.email,
      phone: created.phone ?? null,
      role: created.role,
      provider: created.provider,
      permissions: ROLE_PERMISSIONS[created.role],
    };
  },

  /**
   * Authenticate an existing account.
   */
  async login(payload: Record<string, unknown>) {
    const email = String(payload.email ?? '').trim().toLowerCase();
    const password = String(payload.password ?? '');

    if (!email || !password) throw new ValidationError('email and password are required');

    const user = await AuthModel.findByEmail(email);
    if (!user) throw new UnauthorizedError('Invalid email or password');

    const passwordOk = await Bun.password.verify(password, user.passwordHash);
    if (!passwordOk) throw new UnauthorizedError('Invalid email or password');

    await AuthModel.touchLastLogin(user.id);

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone ?? null,
      role: user.role,
      provider: user.provider,
      permissions: ROLE_PERMISSIONS[user.role],
    };
  },

  /**
   * Authenticate or create user from Firebase token.
   */
  async firebaseLogin(payload: Record<string, unknown>) {
    const idToken = String(payload.idToken ?? '');
    if (!idToken) throw new ValidationError('idToken is required');

    const decoded = await verifyFirebaseIdToken(idToken);

    const email = (decoded.email ?? '').toLowerCase();
    if (!email) throw new ValidationError('Firebase token missing email');

    const firebaseUid = decoded.uid;
    const provider: 'google' | 'password' =
      decoded.firebase?.sign_in_provider === 'google.com' ? 'google' : 'password';

    let user = await AuthModel.findByFirebaseUid(firebaseUid);

    if (!user) {
      const byEmail = await AuthModel.findByEmail(email);

      if (byEmail) {
        await AuthModel.linkFirebaseIdentity(byEmail.id, firebaseUid, provider);
        user = await AuthModel.getById(byEmail.id);
      } else {
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

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone ?? null,
      role: user.role,
      provider: user.provider,
      permissions: ROLE_PERMISSIONS[user.role],
    };
  },

  /**
   * Return the currently authenticated user's profile + permissions.
   */
  async me(userId: string) {
    const user = await AuthModel.getById(userId);
    if (!user) throw new UnauthorizedError('User not found');

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone ?? null,
      role: user.role,
      provider: user.provider,
      permissions: ROLE_PERMISSIONS[user.role],
    };
  },
};
