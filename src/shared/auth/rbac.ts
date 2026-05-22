export type Role = 'super_admin' | 'admin' | 'support' | 'user';

export type Permission =
  | 'users.read'
  | 'users.write'
  | 'roles.manage'
  | 'pets.read'
  | 'pets.write'
  | 'orders.read'
  | 'orders.write'
  | 'sync.manage';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: [
    'users.read',
    'users.write',
    'roles.manage',
    'pets.read',
    'pets.write',
    'orders.read',
    'orders.write',
    'sync.manage',
  ],
  admin: ['users.read', 'pets.read', 'pets.write', 'orders.read', 'orders.write', 'sync.manage'],
  support: ['users.read', 'pets.read', 'orders.read'],
  user: ['pets.read', 'pets.write'],
};

/**
 * Check whether a role includes a required permission.
 */
export const hasPermission = (role: Role, permission: Permission) =>
  ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
