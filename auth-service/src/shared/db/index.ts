import { Database } from 'bun:sqlite';
import crypto from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const dbPath = resolve(process.env.AUTH_DB_PATH ?? './data/auth.db');
mkdirSync(dirname(dbPath), { recursive: true });
export const db = new Database(dbPath, { create: true });

db.run('PRAGMA journal_mode = WAL;');
db.run('PRAGMA foreign_keys = ON;');

/** Initialize auth-service isolated schema. */
export const initDb = () => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      firstName TEXT NOT NULL,
      lastName TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer',
      provider TEXT NOT NULL DEFAULT 'password',
      firebaseUid TEXT UNIQUE,
      avatarUrl TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      country TEXT,
      postalCode TEXT,
      lastLoginAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      usedAt TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
};

/** Generate stable UUID for sqlite inserts. */
export const makeId = () => crypto.randomUUID();
