import type { Role } from '../types';

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  super_admin: ['*'],
  admin: ['users:read', 'users:write', 'roles:read'],
  support: ['users:read'],
  customer: ['self:read'],
};

/** Role contains permission or wildcard. */
export const hasPermission = (role: Role, permission: string): boolean => {
  const perms = ROLE_PERMISSIONS[role] ?? [];
  return perms.includes('*') || perms.includes(permission);
};
