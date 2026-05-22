/**
 * Users table schema contract.
 * NOTE: Physical table is created from db/migrations/001_auth_user_rbac.sql
 */
export const usersSchema = {
  table: 'users',
  columns: {
    id: 'uuid',
    firstName: 'varchar(120)',
    lastName: 'varchar(120)',
    email: 'varchar(255) unique',
    phone: 'varchar(30) nullable',
    passwordHash: 'text',
    avatarUrl: 'text nullable',
    status: "enum('active','inactive','blocked')",
    isEmailVerified: 'boolean',
    lastLoginAt: 'timestamptz nullable',
    createdAt: 'timestamptz',
    updatedAt: 'timestamptz',
  },
} as const;

/**
 * Sessions table schema contract for refresh token lifecycle.
 */
export const sessionsSchema = {
  table: 'sessions',
  columns: {
    id: 'uuid',
    userId: 'uuid fk -> users.id',
    refreshTokenHash: 'text',
    userAgent: 'text nullable',
    ipAddress: 'inet nullable',
    expiresAt: 'timestamptz',
    revokedAt: 'timestamptz nullable',
    createdAt: 'timestamptz',
  },
} as const;

/**
 * Roles table schema contract.
 */
export const rolesSchema = {
  table: 'roles',
  columns: {
    id: 'uuid',
    code: 'varchar(60) unique',
    name: 'varchar(120)',
    description: 'text nullable',
    isSystem: 'boolean',
    createdAt: 'timestamptz',
    updatedAt: 'timestamptz',
  },
} as const;

/**
 * Permissions table schema contract.
 */
export const permissionsSchema = {
  table: 'permissions',
  columns: {
    id: 'uuid',
    code: 'varchar(120) unique',
    name: 'varchar(150)',
    description: 'text nullable',
    createdAt: 'timestamptz',
    updatedAt: 'timestamptz',
  },
} as const;

/**
 * User-role bridge table schema contract.
 */
export const userRolesSchema = {
  table: 'user_roles',
  columns: {
    userId: 'uuid fk -> users.id',
    roleId: 'uuid fk -> roles.id',
    assignedAt: 'timestamptz',
    assignedBy: 'uuid fk -> users.id nullable',
  },
} as const;

/**
 * Role-permission bridge table schema contract.
 */
export const rolePermissionsSchema = {
  table: 'role_permissions',
  columns: {
    roleId: 'uuid fk -> roles.id',
    permissionId: 'uuid fk -> permissions.id',
    createdAt: 'timestamptz',
  },
} as const;
