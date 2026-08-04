import { Elysia } from 'elysia';
import { domainAuth } from '@/shared/auth/domain-auth';

/**
 * Base Elysia instance for the media route files.
 *
 * Same reason as `modules/shop/base.ts`: the route files read `user` off the
 * context, and the type for that only flows into a plugin that declares the
 * dependency. `domainAuth` is deduplicated by plugin name, so re-declaring it
 * here is free at runtime.
 */
export const mediaBase = () => new Elysia().use(domainAuth);
