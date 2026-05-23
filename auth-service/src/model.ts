import { db, makeId } from './shared/db';
import type { AuthProvider, AuthTokenRow, AuthTokenType, Role, UserRow } from './shared/types';

const mapUser = (row: any): UserRow => ({
  id: row.id,
  firstName: row.firstName,
  lastName: row.lastName,
  email: row.email,
  phone: row.phone ?? null,
  passwordHash: row.passwordHash,
  role: row.role,
  provider: row.provider,
  firebaseUid: row.firebaseUid ?? null,
  avatarUrl: row.avatarUrl ?? null,
  address: row.address ?? null,
  city: row.city ?? null,
  state: row.state ?? null,
  country: row.country ?? null,
  postalCode: row.postalCode ?? null,
  lastLoginAt: row.lastLoginAt ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const AuthModel = {
  /** Find user by unique email. */
  async findByEmail(email: string): Promise<UserRow | null> {
    const row = db.query('SELECT * FROM users WHERE email = ? LIMIT 1').get(email) as any;
    return row ? mapUser(row) : null;
  },

  /** Find user by firebase UID. */
  async findByFirebaseUid(firebaseUid: string): Promise<UserRow | null> {
    const row = db.query('SELECT * FROM users WHERE firebaseUid = ? LIMIT 1').get(firebaseUid) as any;
    return row ? mapUser(row) : null;
  },

  /** Insert user into auth database. */
  async createUser(payload: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    passwordHash: string;
    role?: Role;
    provider?: AuthProvider;
    firebaseUid?: string;
  }): Promise<UserRow | null> {
    const now = new Date().toISOString();
    const id = makeId();

    db.query(
      `INSERT INTO users (id, firstName, lastName, email, phone, passwordHash, role, provider, firebaseUid, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      payload.firstName,
      payload.lastName,
      payload.email,
      payload.phone ?? null,
      payload.passwordHash,
      payload.role ?? 'customer',
      payload.provider ?? 'password',
      payload.firebaseUid ?? null,
      now,
      now
    );

    return this.getById(id);
  },

  /** Read user by id. */
  async getById(id: string): Promise<UserRow | null> {
    const row = db.query('SELECT * FROM users WHERE id = ? LIMIT 1').get(id) as any;
    return row ? mapUser(row) : null;
  },

  /** Update password hash and modified time. */
  async updatePassword(userId: string, passwordHash: string) {
    const now = new Date().toISOString();
    db.query('UPDATE users SET passwordHash = ?, updatedAt = ? WHERE id = ?').run(passwordHash, now, userId);
  },

  /** Set last login timestamp. */
  async touchLastLogin(id: string) {
    const now = new Date().toISOString();
    db.query('UPDATE users SET lastLoginAt = ?, updatedAt = ? WHERE id = ?').run(now, now, id);
  },

  /** Attach firebase identity with provider to existing user. */
  async linkFirebaseIdentity(userId: string, firebaseUid: string, provider: AuthProvider) {
    const now = new Date().toISOString();
    db.query('UPDATE users SET firebaseUid = ?, provider = ?, lastLoginAt = ?, updatedAt = ? WHERE id = ?').run(
      firebaseUid,
      provider,
      now,
      now,
      userId
    );
  },

  /** Create token row for auth actions. */
  async createAuthToken(payload: { userId: string; token: string; type: AuthTokenType; expiresAt: Date }) {
    db.query(
      `INSERT INTO auth_tokens (id, userId, token, type, expiresAt, usedAt, createdAt)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`
    ).run(makeId(), payload.userId, payload.token, payload.type, payload.expiresAt.toISOString(), new Date().toISOString());
  },

  /** Read valid and unconsumed auth token. */
  async findActiveAuthToken(token: string, type: AuthTokenType): Promise<AuthTokenRow | null> {
    const row = db
      .query(
        `SELECT * FROM auth_tokens
         WHERE token = ? AND type = ? AND usedAt IS NULL AND expiresAt > ?
         LIMIT 1`
      )
      .get(token, type, new Date().toISOString()) as any;

    return (row as AuthTokenRow) ?? null;
  },

  /** Mark one-time auth token consumed. */
  async consumeAuthToken(id: string) {
    db.query('UPDATE auth_tokens SET usedAt = ? WHERE id = ?').run(new Date().toISOString(), id);
  },
};
