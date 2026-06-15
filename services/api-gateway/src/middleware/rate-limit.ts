import { rateLimit } from 'elysia-rate-limit';
import { Elysia } from 'elysia';

export const rateLimiter = (app: Elysia) =>
  app.use(rateLimit({
    duration: 60000,
    max: 100,
  }));
