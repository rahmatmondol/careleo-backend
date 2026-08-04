export const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ['*'],
  OWNER: ['media.read', 'media.manage'],
  ADMIN: ['media.read', 'media.manage'],
  MANAGER: ['media.read', 'media.manage'],
  STAFF: ['media.read'],
};

export const hasPermission = (role: string, permission: string) => {
  const perms = ROLE_PERMISSIONS[String(role || '').toUpperCase()] || [];
  return perms.includes('*') || perms.includes(permission);
};
