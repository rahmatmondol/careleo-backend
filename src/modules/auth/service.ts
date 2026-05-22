import { ValidationError, UnauthorizedError } from '@/shared/errors';
import { AuthModel } from './model';
import { ROLE_PERMISSIONS } from '@/shared/auth/rbac';

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

    const created = await AuthModel.createUser({
      firstName,
      lastName,
      email,
      phone: phone || undefined,
      password,
      role: 'customer',
    });

    if (!created) throw new ValidationError('Email already exists');

    return {
      id: created.id,
      firstName: created.firstName,
      lastName: created.lastName,
      email: created.email,
      phone: created.phone ?? null,
      role: created.role,
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

    const user = await AuthModel.verifyUser(email, password);
    if (!user) throw new UnauthorizedError('Invalid email or password');

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone ?? null,
      role: user.role,
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
      permissions: ROLE_PERMISSIONS[user.role],
    };
  },
};
