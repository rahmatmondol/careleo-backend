import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/shared/db';
import { authTokens, roles, userRoles, users } from '@/shared/db/schema';
import type { Role } from '@/shared/auth/rbac';

type DbUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  role: Role;
  provider: 'google' | 'password';
  passwordHash: string;
};

const mapRole = (code?: string | null): Role => {
  if (code === 'super_admin' || code === 'admin' || code === 'support' || code === 'customer') return code;
  return 'customer';
};

const mapProvider = (provider?: string | null): 'google' | 'password' => {
  return provider === 'google' ? 'google' : 'password';
};

const mapDbUser = (row: any): DbUser => ({
  id: row.id,
  firstName: row.firstName,
  lastName: row.lastName,
  email: row.email,
  phone: row.phone,
  avatarUrl: row.avatarUrl ?? null,
  address: row.address ?? null,
  city: row.city ?? null,
  state: row.state ?? null,
  country: row.country ?? null,
  postalCode: row.postalCode ?? null,
  provider: mapProvider(row.provider),
  passwordHash: row.passwordHash,
  role: mapRole(row.roleCode),
});

export const AuthModel = {
  /** Read user row + role by email. */
  async findByEmail(email: string): Promise<DbUser | null> {
    const rows = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
        avatarUrl: users.avatarUrl,
        address: users.address,
        city: users.city,
        state: users.state,
        country: users.country,
        postalCode: users.postalCode,
        provider: users.provider,
        passwordHash: users.passwordHash,
        roleCode: roles.code,
      })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .leftJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(users.email, email))
      .limit(1);

    if (!rows[0]) return null;
    return mapDbUser(rows[0]);
  },

  /** Read user row + role by Firebase UID. */
  async findByFirebaseUid(firebaseUid: string): Promise<DbUser | null> {
    const rows = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
        avatarUrl: users.avatarUrl,
        address: users.address,
        city: users.city,
        state: users.state,
        country: users.country,
        postalCode: users.postalCode,
        provider: users.provider,
        passwordHash: users.passwordHash,
        roleCode: roles.code,
      })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .leftJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(users.firebaseUid, firebaseUid))
      .limit(1);

    if (!rows[0]) return null;
    return mapDbUser(rows[0]);
  },

  /** Create a new user row and attach default/customer role. */
  async createUser(payload: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    passwordHash: string;
    role?: Role;
    provider?: 'google' | 'password';
    firebaseUid?: string;
  }): Promise<DbUser | null> {
    const roleCode = payload.role ?? 'customer';
    const roleRow = await db.select().from(roles).where(eq(roles.code, roleCode)).limit(1);
    if (!roleRow[0]) return null;

    const inserted = await db
      .insert(users)
      .values({
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        phone: payload.phone,
        passwordHash: payload.passwordHash,
        provider: payload.provider ?? 'password',
        firebaseUid: payload.firebaseUid,
      })
      .returning({ id: users.id });

    if (!inserted[0]) return null;
    await db.insert(userRoles).values({ userId: inserted[0].id, roleId: roleRow[0].id });
    return this.getById(inserted[0].id);
  },

  /** Lookup user by ID with role information. */
  async getById(id: string): Promise<DbUser | null> {
    const rows = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
        avatarUrl: users.avatarUrl,
        address: users.address,
        city: users.city,
        state: users.state,
        country: users.country,
        postalCode: users.postalCode,
        provider: users.provider,
        passwordHash: users.passwordHash,
        roleCode: roles.code,
      })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .leftJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(users.id, id))
      .limit(1);

    if (!rows[0]) return null;
    return mapDbUser(rows[0]);
  },

  /** Update password hash. */
  async updatePassword(userId: string, passwordHash: string) {
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
  },

  /** Update last login timestamp. */
  async touchLastLogin(id: string) {
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, id));
  },

  /** Bind Firebase UID/provider to existing user. */
  async linkFirebaseIdentity(userId: string, firebaseUid: string, provider: 'google' | 'password') {
    await db.update(users).set({ firebaseUid, provider, lastLoginAt: new Date() }).where(eq(users.id, userId));
  },

  /** Create a one-time token for auth actions. */
  async createAuthToken(payload: { userId: string; token: string; type: 'email_verify' | 'password_reset' | 'create_password'; expiresAt: Date }) {
    await db.insert(authTokens).values(payload);
  },

  /** Resolve active token for the requested auth action. */
  async findActiveAuthToken(token: string, type: 'email_verify' | 'password_reset' | 'create_password') {
    const rows = await db
      .select()
      .from(authTokens)
      .where(and(eq(authTokens.token, token), eq(authTokens.type, type), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())))
      .limit(1);

    return rows[0] ?? null;
  },

  /** Mark token as consumed. */
  async consumeAuthToken(id: string) {
    await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, id));
  },
};
