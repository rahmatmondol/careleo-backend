import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { db, pgPool } from '@/shared/db';
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

let authReadyPromise: Promise<void> | null = null;

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

const extractRows = (result: any): any[] => {
  if (Array.isArray(result)) return result;
  return result?.rows ?? [];
};

const getDbCauseMessage = (error: unknown): string => {
  if (!error) return 'Unknown database error';
  if (error instanceof Error) {
    const anyErr = error as any;
    const cause = anyErr?.cause;
    if (cause instanceof Error && cause.message) return cause.message;
    if (typeof cause === 'string' && cause) return cause;
    return error.message || 'Unknown database error';
  }
  return String(error);
};

const getSafeDbTarget = () => {
  const raw = String(process.env.DATABASE_URL ?? '').trim();
  if (!raw) return 'DATABASE_URL is empty';
  try {
    const u = new URL(raw);
    const port = u.port ? `:${u.port}` : '';
    const dbName = u.pathname?.replace(/^\//, '') || '';
    return `${u.hostname}${port}/${dbName}`;
  } catch {
    return 'DATABASE_URL is invalid';
  }
};

const tryResolveRoleCode = async (userId: string): Promise<string | null> => {
  try {
    const result = await db.execute(
      sql`select roles.code as role_code from user_roles left join roles on roles.id = user_roles.role_id where user_roles.user_id = ${userId} limit 1`,
    );
    const row = extractRows(result)[0];
    return row?.role_code ? String(row.role_code) : null;
  } catch {}

  try {
    const result = await db.execute(
      sql`select roles.code as role_code from "userRoles" left join roles on roles.id = "userRoles"."roleId" where "userRoles"."userId" = ${userId} limit 1`,
    );
    const row = extractRows(result)[0];
    return row?.role_code ? String(row.role_code) : null;
  } catch {}

  return null;
};

const mapLooseDbUser = (row: Record<string, any>): DbUser => {
  const firstName = String(row.first_name ?? row.firstName ?? '').trim();
  const lastName = String(row.last_name ?? row.lastName ?? '').trim();
  const email = String(row.email ?? '').toLowerCase();

  const name = String(row.name ?? '').trim();
  const split = name ? name.split(/\s+/) : [];
  const derivedFirst = split[0] ?? '';
  const derivedLast = split.slice(1).join(' ');

  const normalizedFirstName = firstName || derivedFirst || 'Careleo';
  const normalizedLastName = lastName || derivedLast || 'User';

  return {
    id: String(row.id),
    firstName: normalizedFirstName,
    lastName: normalizedLastName,
    email,
    phone: row.phone !== undefined ? (row.phone ? String(row.phone) : null) : null,
    avatarUrl: (row.avatar_url ?? row.avatarUrl ?? row.avatar ?? null) ? String(row.avatar_url ?? row.avatarUrl ?? row.avatar) : null,
    address: row.address !== undefined && row.address !== null ? String(row.address) : null,
    city: row.city !== undefined && row.city !== null ? String(row.city) : null,
    state: row.state !== undefined && row.state !== null ? String(row.state) : null,
    country: row.country !== undefined && row.country !== null ? String(row.country) : null,
    postalCode: (row.postal_code ?? row.postalCode ?? null) ? String(row.postal_code ?? row.postalCode) : null,
    provider: mapProvider((row.provider ?? row.sign_in_provider ?? null) as any),
    passwordHash: String(row.password_hash ?? row.passwordHash ?? ''),
    role: mapRole((row.role_code ?? row.roleCode ?? row.role ?? null) as any),
  };
};

export const AuthModel = {
  async ensureReady() {
    if (authReadyPromise) return authReadyPromise;
    authReadyPromise = (async () => {
      try {
        await pgPool.query('select 1 as ok');
      } catch (error) {
        throw new Error(`Database connection failed (${getSafeDbTarget()}): ${getDbCauseMessage(error)}`);
      }

      try {
        await db.execute(sql`create extension if not exists "pgcrypto"`);
      } catch {}

      try {
        await db.execute(sql`
          create table if not exists users (
            id uuid primary key default gen_random_uuid(),
            firebase_uid varchar(191),
            first_name varchar(120) not null,
            last_name varchar(120) not null,
            email varchar(255) not null,
            phone varchar(30),
            address text,
            city varchar(120),
            state varchar(120),
            country varchar(120),
            postal_code varchar(40),
            password_hash text not null,
            avatar_url text,
            provider varchar(20) not null default 'password',
            status varchar(20) not null default 'active',
            is_email_verified boolean not null default false,
            last_login_at timestamptz,
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now()
          )
        `);
        await db.execute(sql`create unique index if not exists users_email_unique on users(email)`);
        await db.execute(sql`create unique index if not exists users_firebase_uid_unique on users(firebase_uid)`);
        await db.execute(sql`create index if not exists idx_users_email on users(email)`);
        await db.execute(sql`create index if not exists idx_users_status on users(status)`);
      } catch {}

      try {
        await db.execute(sql`
          create table if not exists roles (
            id uuid primary key default gen_random_uuid(),
            code varchar(60) not null unique,
            name varchar(120) not null,
            description text,
            is_system boolean not null default false,
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now()
          )
        `);
      } catch {}

      try {
        await db.execute(sql`
          create table if not exists user_roles (
            user_id uuid not null references users(id) on delete cascade,
            role_id uuid not null references roles(id) on delete cascade,
            assigned_at timestamptz not null default now(),
            assigned_by uuid references users(id) on delete set null,
            primary key (user_id, role_id)
          )
        `);
        await db.execute(sql`create index if not exists idx_user_roles_user_id on user_roles(user_id)`);
        await db.execute(sql`create index if not exists idx_user_roles_role_id on user_roles(role_id)`);
      } catch {}

      try {
        await db.execute(sql`
          create table if not exists auth_tokens (
            id uuid primary key default gen_random_uuid(),
            user_id uuid not null references users(id) on delete cascade,
            token varchar(191) not null,
            type varchar(40) not null,
            expires_at timestamptz not null,
            used_at timestamptz,
            created_at timestamptz not null default now()
          )
        `);
        await db.execute(sql`create unique index if not exists auth_tokens_token_unique on auth_tokens(token)`);
        await db.execute(sql`create index if not exists idx_auth_tokens_user_id on auth_tokens(user_id)`);
        await db.execute(sql`create index if not exists idx_auth_tokens_type on auth_tokens(type)`);
        await db.execute(sql`create index if not exists idx_auth_tokens_expires_at on auth_tokens(expires_at)`);
      } catch {}

      try {
        await db.execute(sql`
          create table if not exists device_tokens (
            id uuid primary key default gen_random_uuid(),
            user_id uuid not null references users(id) on delete cascade,
            fcm_token text not null,
            platform varchar(20) not null,
            app_version varchar(40),
            is_active boolean not null default true,
            last_seen_at timestamptz not null default now(),
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now()
          )
        `);
        await db.execute(sql`create unique index if not exists device_tokens_fcm_token_unique on device_tokens(fcm_token)`);
        await db.execute(sql`create index if not exists idx_device_tokens_user_id on device_tokens(user_id)`);
        await db.execute(sql`create index if not exists idx_device_tokens_is_active on device_tokens(is_active)`);
      } catch {}

      try {
        await db.execute(sql`
          create table if not exists notification_logs (
            id uuid primary key default gen_random_uuid(),
            type varchar(40) not null,
            title varchar(200) not null,
            body text not null,
            data_json text,
            target_mode varchar(20) not null,
            target_user_ids text,
            status varchar(20) not null default 'queued',
            success_count int not null default 0,
            failure_count int not null default 0,
            created_by uuid references users(id) on delete set null,
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now()
          )
        `);
        await db.execute(sql`create index if not exists idx_notification_logs_type on notification_logs(type)`);
        await db.execute(sql`create index if not exists idx_notification_logs_status on notification_logs(status)`);
        await db.execute(sql`create index if not exists idx_notification_logs_created_at on notification_logs(created_at)`);
      } catch {}

      try {
        await db.execute(
          sql`insert into roles (code, name, description, is_system) values 
            ('customer', 'Customer', 'Default customer role', true),
            ('support', 'Support', 'Support role', true),
            ('admin', 'Admin', 'Admin role', true),
            ('super_admin', 'Super Admin', 'Super admin role', true)
            on conflict (code) do nothing`,
        );
      } catch {}
    })();

    return authReadyPromise;
  },

  /** Read user row + role by email. */
  async findByEmail(email: string): Promise<DbUser | null> {
    try {
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
    } catch {
      try {
        const result = await db.execute(sql`select * from users where email = ${email} limit 1`);
        const row = extractRows(result)[0];
        if (!row) return null;
        const roleCode = await tryResolveRoleCode(String(row.id));
        if (roleCode) row.role_code = roleCode;
        return mapLooseDbUser(row);
      } catch (error) {
        throw new Error(`Database error: ${getDbCauseMessage(error)}`);
      }
    }
  },

  /** Read user row + role by Firebase UID. */
  async findByFirebaseUid(firebaseUid: string): Promise<DbUser | null> {
    try {
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
    } catch {
      try {
        const result = await db.execute(sql`select * from users where firebase_uid = ${firebaseUid} limit 1`);
        const row = extractRows(result)[0];
        if (row) {
          const roleCode = await tryResolveRoleCode(String(row.id));
          if (roleCode) row.role_code = roleCode;
          return mapLooseDbUser(row);
        }
      } catch (error) {
        throw new Error(`Database error: ${getDbCauseMessage(error)}`);
      }

      try {
        const result = await db.execute(sql`select * from users where "firebaseUid" = ${firebaseUid} limit 1`);
        const row = extractRows(result)[0];
        if (row) {
          const roleCode = await tryResolveRoleCode(String(row.id));
          if (roleCode) row.role_code = roleCode;
          return mapLooseDbUser(row);
        }
      } catch (error) {
        throw new Error(`Database error: ${getDbCauseMessage(error)}`);
      }

      return null;
    }
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
    let roleId: string | null = null;
    try {
      const roleRow = await db.select().from(roles).where(eq(roles.code, roleCode)).limit(1);
      roleId = roleRow[0]?.id ?? null;
    } catch {}

    const inserted = await db
      .insert(users)
      .values({
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        phone: payload.phone,
        passwordHash: payload.passwordHash,
        ...(payload.firebaseUid !== undefined ? { firebaseUid: payload.firebaseUid } : {}),
        ...(payload.provider !== undefined ? { provider: payload.provider } : {}),
      })
      .returning({ id: users.id });

    if (!inserted[0]) return null;
    if (roleId) {
      try {
        await db.insert(userRoles).values({ userId: inserted[0].id, roleId });
      } catch {}
    }
    return this.getById(inserted[0].id);
  },

  /** Lookup user by ID with role information. */
  async getById(id: string): Promise<DbUser | null> {
    try {
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
    } catch {
      try {
        const result = await db.execute(sql`select * from users where id = ${id} limit 1`);
        const row = extractRows(result)[0];
        if (!row) return null;
        const roleCode = await tryResolveRoleCode(String(row.id));
        if (roleCode) row.role_code = roleCode;
        return mapLooseDbUser(row);
      } catch (error) {
        throw new Error(`Database error: ${getDbCauseMessage(error)}`);
      }
    }
  },

  /** Update password hash. */
  async updatePassword(userId: string, passwordHash: string) {
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
  },

  /** Update last login timestamp. */
  async touchLastLogin(id: string) {
    try {
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, id));
      return;
    } catch {}

    try {
      await db.execute(sql`update users set last_login_at = now() where id = ${id}`);
      return;
    } catch {}

    try {
      await db.execute(sql`update users set "lastLoginAt" = now() where id = ${id}`);
    } catch {}
  },

  /** Bind Firebase UID/provider to existing user. */
  async linkFirebaseIdentity(userId: string, firebaseUid: string, provider: 'google' | 'password') {
    try {
      await db.update(users).set({ firebaseUid, provider, lastLoginAt: new Date() }).where(eq(users.id, userId));
      return;
    } catch {}

    try {
      await db.execute(
        sql`update users set firebase_uid = ${firebaseUid}, provider = ${provider}, last_login_at = now() where id = ${userId}`,
      );
      return;
    } catch {}

    try {
      await db.execute(
        sql`update users set "firebaseUid" = ${firebaseUid}, provider = ${provider}, "lastLoginAt" = now() where id = ${userId}`,
      );
    } catch {}
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
