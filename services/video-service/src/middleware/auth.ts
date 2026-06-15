import { jwt } from '@elysiajs/jwt';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod'
);

export interface AuthUser {
  id: string;
  role: string;
}

async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload && typeof payload.sub === 'string') {
      return { id: payload.sub, role: (payload.role as string) || 'USER' };
    }
  } catch {
    // invalid token
  }
  return null;
}

export const authPlugin = (app: any) =>
  app
    .use(
      jwt({
        name: 'jwt',
        secret: process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod',
      })
    )
    .derive(async ({ headers: { authorization } }: any) => {
      let user: AuthUser | null = null;
      let token = '';
      if (authorization?.startsWith('Bearer ')) {
        token = authorization.slice(7);
        user = await verifyToken(token);
      }
      return { user, token };
    })
    .guard({
      beforeHandle({ user, set }: any) {
        if (!user) {
          set.status = 401;
          return { error: 'Unauthorized' };
        }
      },
    });

export { verifyToken, JWT_SECRET };
