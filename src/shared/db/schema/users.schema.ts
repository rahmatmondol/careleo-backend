/**
 * Backward-compatible exports for auth/RBAC schema.
 * Single source of truth: drizzle-auth.ts
 */
export {
  users as usersSchema,
  sessions as sessionsSchema,
  roles as rolesSchema,
  permissions as permissionsSchema,
  userRoles as userRolesSchema,
  rolePermissions as rolePermissionsSchema,
} from './drizzle-auth';
