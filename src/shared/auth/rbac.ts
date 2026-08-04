export type Role = 'super_admin' | 'admin' | 'support' | 'customer';

export type Permission =
  | 'users.read'
  | 'users.write'
  | 'roles.manage'
  | 'pets.read'
  | 'pets.write'
  | 'orders.read'
  | 'orders.write'
  | 'sync.manage'
  | 'plans.manage'
  | 'vets.read'
  | 'vets.write';

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
    'plans.manage',
    'vets.read',
    'vets.write',
  ],
  admin: [
    'users.read',
    'pets.read',
    'pets.write',
    'orders.read',
    'orders.write',
    'sync.manage',
    'plans.manage',
    'vets.read',
    'vets.write',
  ],
  // Support can look up a vet to answer a booking question, not edit the roster.
  support: ['users.read', 'pets.read', 'orders.read', 'vets.read'],
  customer: ['pets.read', 'pets.write'],
};

/**
 * Check whether a role includes a required permission.
 */
export const hasPermission = (role: Role, permission: Permission) =>
  ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
