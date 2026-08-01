/**
 * create-super-admin.ts
 * ---------------------
 * Super admin account create করার script।
 *
 * Usage:
 *   bun run scripts/create-super-admin.ts
 *
 * অথবা CLI argument দিয়ে:
 *   bun run scripts/create-super-admin.ts \
 *     --email admin@careleo.com \
 *     --password "YourStrongPassword!" \
 *     --firstName "Super" \
 *     --lastName "Admin"
 */

// NOTE: never paste real credentials into this file — it is tracked in git.
// Run the script without --password and it will prompt for one instead, which
// also keeps it out of your shell history.

import { db } from '../src/shared/db';
import { users, roles, userRoles } from '../src/shared/db/schema';
import { AuthModel } from '../src/modules/auth/model';
import { eq } from 'drizzle-orm';

// ─── Parse CLI args ───────────────────────────────────────────────────────────
function getArg(flag: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function prompt(question: string): Promise<string> {
  process.stdout.write(question);
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (chunk) => {
      data = chunk.toString().trim();
      resolve(data);
    });
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   Careleo — Super Admin Setup        ║');
  console.log('╚══════════════════════════════════════╝\n');

  // The auth tables (users / roles / user_roles) are created lazily by the API
  // on first boot, not by a migration. Running this script against a database
  // where the API has never started would otherwise fail with a confusing
  // "relation users does not exist".
  await AuthModel.ensureReady();
  console.log(`→ Database: ${describeDbTarget()}`);

  // Collect info from args or interactive prompts
  let email     = getArg('--email');
  let password  = getArg('--password');
  let firstName = getArg('--firstName') ?? getArg('--first-name') ?? 'Super';
  let lastName  = getArg('--lastName')  ?? getArg('--last-name')  ?? 'Admin';

  if (!email) {
    email = await prompt('Email address : ');
  }
  if (!password) {
    password = await prompt('Password      : ');
  }

  // Validate
  email = email.trim().toLowerCase();
  if (!email.includes('@')) {
    console.error('❌ Invalid email address.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('❌ Password must be at least 8 characters.');
    process.exit(1);
  }

  console.log(`\n→ Creating super admin: ${email}`);

  // Check if email already exists
  const existing = await db.select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    console.log(`\n⚠️  User with email "${email}" already exists (id: ${existing[0].id}).`);
    console.log('   Updating role to super_admin…');

    // Make sure super_admin role exists
    await ensureSuperAdminRole(existing[0].id);

    console.log(`\n✅ Done! Existing user upgraded to super_admin.`);
    console.log(`   Email : ${email}`);
    console.log(`   ID    : ${existing[0].id}\n`);
    process.exit(0);
  }

  // Hash password using Bun built-in (bcrypt)
  const passwordHash = await (globalThis as any).Bun.password.hash(password, { algorithm: 'bcrypt', cost: 12 });

  // Insert user
  const [user] = await db.insert(users).values({
    firstName,
    lastName,
    email,
    passwordHash,
    provider: 'password',
  }).returning({ id: users.id, email: users.email });

  // Assign super_admin role
  await ensureSuperAdminRole(user.id);

  console.log('\n✅ Super Admin created successfully!\n');
  console.log('┌─────────────────────────────────────┐');
  console.log(`│  Email    : ${email.padEnd(24)} │`);
  console.log(`│  Password : ${'(as entered)'.padEnd(24)} │`);
  console.log(`│  Role     : ${'super_admin'.padEnd(24)} │`);
  console.log(`│  ID       : ${user.id.slice(0, 24)} │`);
  console.log('└─────────────────────────────────────┘\n');

  process.exit(0);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Show which database we're about to write to, without leaking the password. */
function describeDbTarget(): string {
  const raw = String(process.env.DATABASE_URL ?? '').trim();
  if (!raw) return '(DATABASE_URL is not set)';
  try {
    const u = new URL(raw);
    return `${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname}`;
  } catch {
    return '(DATABASE_URL is invalid)';
  }
}

async function ensureSuperAdminRole(userId: string) {
  // 1. Ensure super_admin row exists in roles table
  let roleRow = await db.select({ id: roles.id })
    .from(roles)
    .where(eq(roles.code, 'super_admin'))
    .limit(1);

  if (roleRow.length === 0) {
    const [inserted] = await db.insert(roles).values({
      code: 'super_admin',
      name: 'Super Admin',
    }).returning({ id: roles.id });
    roleRow = [inserted];
  }

  const roleId = roleRow[0].id;

  // 2. Upsert userRoles (remove old, insert new).
  // This is the ONLY source of truth for a user's role: login resolves it by
  // joining users -> user_roles -> roles.code. There is no users.role column,
  // so nothing else needs updating here.
  await db.delete(userRoles).where(eq(userRoles.userId, userId));
  await db.insert(userRoles).values({ userId, roleId });

  // 3. Read it back the same way login does, so a silent failure can't pass.
  const [check] = await db
    .select({ code: roles.code })
    .from(userRoles)
    .leftJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId))
    .limit(1);

  if (check?.code !== 'super_admin') {
    throw new Error(
      `Role assignment did not stick (resolved to "${check?.code ?? 'none'}"). ` +
      `Login would treat this account as a customer.`,
    );
  }
}

main().catch((err) => {
  console.error('\n❌ Error:', err?.message ?? err);
  process.exit(1);
});
