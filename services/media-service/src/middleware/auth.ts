import { Elysia } from 'elysia';

function decodeJwt(token: string): any {
  try {
    const payload = token.split('.')[1] || '';
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString());
  } catch {
    return null;
  }
}

export const authPlugin = new Elysia().derive(({ request }) => {
  const auth = request.headers.get('Authorization');
  let user: { id: string; role?: string } | null = null;

  if (auth?.startsWith('Bearer ')) {
    const payload = decodeJwt(auth.slice(7));
    if (payload && typeof payload.sub === 'string') {
      user = { id: payload.sub, role: payload.role as string | undefined };
    }
  }

  return { user };
});
