import { AuthModel } from './model';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Auth business logic. The controller passes a `signToken` fn (from the JWT
 * plugin) so signing stays in the Elysia layer while logic stays here.
 */
export const AuthService = {
  async register(
    body: { email?: string; password?: string; displayName?: string; phone?: string },
    signToken: (payload: any) => Promise<string>,
  ) {
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? '';
    const displayName = body.displayName?.trim();
    if (!email || !EMAIL_RE.test(email)) return { status: 400, error: 'Valid email required' };
    if (password.length < 8) return { status: 400, error: 'Password must be at least 8 characters' };
    if (!displayName) return { status: 400, error: 'Display name required' };

    if (await AuthModel.findByEmail(email)) return { status: 409, error: 'Email already registered' };

    const passwordHash = await Bun.password.hash(password);
    const account = await AuthModel.createAccount({ email, passwordHash, displayName, phone: body.phone });
    if (!account) return { status: 500, error: 'Failed to create account' };
    await AuthModel.createProfile(account.id);

    const token = await signToken({ sub: account.id, role: 'freelancer', email: account.email });
    return { data: { token, account: AuthService.publicAccount(account) } };
  },

  async login(body: { email?: string; password?: string }, signToken: (payload: any) => Promise<string>) {
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? '';
    if (!email || !password) return { status: 400, error: 'Email and password required' };

    const account = await AuthModel.findByEmail(email);
    if (!account) return { status: 401, error: 'Invalid credentials' };
    const ok = await Bun.password.verify(password, account.passwordHash);
    if (!ok) return { status: 401, error: 'Invalid credentials' };
    if (account.status === 'suspended') return { status: 403, error: 'Account suspended' };

    const token = await signToken({ sub: account.id, role: 'freelancer', email: account.email });
    return { data: { token, account: AuthService.publicAccount(account) } };
  },

  async me(accountId: string) {
    const account = await AuthModel.findById(accountId);
    if (!account) return { status: 404, error: 'Account not found' };
    const profile = await AuthModel.getProfileByAccount(accountId);
    return { data: { account: AuthService.publicAccount(account), profile } };
  },

  publicAccount(acc: any) {
    const { passwordHash, ...rest } = acc;
    return rest;
  },
};
