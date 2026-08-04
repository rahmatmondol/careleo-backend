export const toSlug = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const safeJsonParse = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ['*'],
  OWNER: ['products.read', 'products.manage', 'orders.read', 'orders.manage', 'users.read'],
  ADMIN: ['products.read', 'products.manage', 'orders.read'],
  MANAGER: ['products.read', 'orders.read'],
  STAFF: ['products.read'],
};

export const hasPermission = (role: string, permission: string) => {
  const perms = ROLE_PERMISSIONS[String(role || '').toUpperCase()] || [];
  return perms.includes('*') || perms.includes(permission);
};
