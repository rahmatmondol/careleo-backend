/**
 * Backward-compatible exports for auth/RBAC schema.
 * Single source of truth: auth.ts
 */
export {
  users as usersSchema,
  sessions as sessionsSchema,
  roles as rolesSchema,
  permissions as permissionsSchema,
  userRoles as userRolesSchema,
  rolePermissions as rolePermissionsSchema,
} from './auth';
