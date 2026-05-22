import { ValidationError, UnauthorizedError } from '@/shared/errors';
import { AuthModel } from './model';
import { ROLE_PERMISSIONS, type Role } from '@/shared/auth/rbac';

export const AuthService = {
  async signup(payload: Record<string, unknown>) {
    const email = String(payload.email ?? '').trim();
    const password = String(payload.password ?? '');
    const role = (payload.role as Role | undefined) ?? 'user';
    const name = payload.name ? String(payload.name) : undefined;

    if (!email || !password) throw new ValidationError('email and password are required');

    const created = await AuthModel.createUser({ email, password, role, name });
    if (!created) throw new ValidationError('Email already exists');

    return {
      id: created.id,
      email: created.email,
      role: created.role,
      permissions: ROLE_PERMISSIONS[created.role],
    };
  },

  async login(payload: Record<string, unknown>) {
    const email = String(payload.email ?? '').trim();
    const password = String(payload.password ?? '');

    if (!email || !password) throw new ValidationError('email and password are required');

    const user = await AuthModel.verifyUser(email, password);
    if (!user) throw new UnauthorizedError('Invalid email or password');

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      permissions: ROLE_PERMISSIONS[user.role],
    };
  },

  async me(userId: string) {
    const user = await AuthModel.getById(userId);
    if (!user) throw new UnauthorizedError('User not found');

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      permissions: ROLE_PERMISSIONS[user.role],
    };
  },
};
