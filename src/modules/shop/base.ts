import { Elysia } from 'elysia';
import { domainAuth } from '@/shared/auth/domain-auth';

/**
 * Base Elysia instance for the shop route files.
 *
 * shop-service registered its own `auth` plugin on the root app, so every route
 * file could read `user` off the context and TypeScript knew about it. Here the
 * route files are sibling plugins of `domainAuth`: the derive still runs at
 * runtime (it is registered `as: 'global'`), but the *type* does not flow into
 * a plugin that never mentions it, so `ctx.user` would not compile.
 *
 * Building each route file on `shopBase()` re-declares that dependency. Elysia
 * deduplicates `domainAuth` by its plugin name, so this costs nothing at
 * runtime — it only carries the type through.
 */
export const shopBase = () => new Elysia().use(domainAuth);
