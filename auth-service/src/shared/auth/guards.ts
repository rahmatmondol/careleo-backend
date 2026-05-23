import type { JwtClaims, Role } from '../types';
import { ForbiddenError, UnauthorizedError } from '../errors';
import { hasPermission } from './rbac';

/** Extract and verify JWT from Authorization header. */
export const requireAuth = async (headers: Record<string, string | undefined>, jwt: any): Promise<JwtClaims> => {
  const authHeader = headers.authorization ?? headers.Authorization;
  if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedError('Missing bearer token');

  const token = authHeader.slice(7);
  const payload = await jwt.verify(token);
  if (!payload?.id || !payload?.email || !payload?.role) throw new UnauthorizedError('Invalid token');

  return {
    id: String(payload.id),
    email: String(payload.email),
    role: payload.role as Role,
  };
};

/** Enforce one of allowed roles. */
export const requireRole = (user: JwtClaims, allowed: Role[]) => {
  if (!allowed.includes(user.role)) throw new ForbiddenError('Insufficient role');
};

/** Enforce specific permission. */
export const requirePermission = (user: JwtClaims, permission: string) => {
  if (!hasPermission(user.role, permission)) throw new ForbiddenError(`Missing permission: ${permission}`);
};
