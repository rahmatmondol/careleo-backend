import { UnauthorizedError } from '../errors';
import type { Permission, Role } from './rbac';
import { hasPermission } from './rbac';

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
};

export const requireAuth = async (headers: Headers, jwt: any): Promise<AuthUser> => {
  const auth = headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) throw new UnauthorizedError('Missing bearer token');

  const token = auth.slice(7);
  const payload = await jwt.verify(token);
  if (!payload) throw new UnauthorizedError('Invalid token');

  return payload as AuthUser;
};

export const requireRole = (user: AuthUser, roles: Role[]) => {
  if (!roles.includes(user.role)) {
    throw new UnauthorizedError('Insufficient role');
  }
};

export const requirePermission = (user: AuthUser, permission: Permission) => {
  if (!hasPermission(user.role, permission)) {
    throw new UnauthorizedError(`Missing permission: ${permission}`);
  }
};
