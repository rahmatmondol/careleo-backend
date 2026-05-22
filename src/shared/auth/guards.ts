import { UnauthorizedError } from '../errors';
import type { Permission, Role } from './rbac';
import { hasPermission } from './rbac';

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
};

/**
 * Validate Bearer token and return authenticated user payload.
 */
export const requireAuth = async (
  headers: Record<string, string | undefined>,
  jwt: any
): Promise<AuthUser> => {
  const auth = headers.authorization;
  if (!auth?.startsWith('Bearer ')) throw new UnauthorizedError('Missing bearer token');

  const token = auth.slice(7);
  const payload = await jwt.verify(token);
  if (!payload) throw new UnauthorizedError('Invalid token');

  return payload as AuthUser;
};

/**
 * Ensure user role is within allowed roles list.
 */
export const requireRole = (user: AuthUser, roles: Role[]) => {
  if (!roles.includes(user.role)) {
    throw new UnauthorizedError('Insufficient role');
  }
};

/**
 * Ensure user has a specific permission before continuing.
 */
export const requirePermission = (user: AuthUser, permission: Permission) => {
  if (!hasPermission(user.role, permission)) {
    throw new UnauthorizedError(`Missing permission: ${permission}`);
  }
};
