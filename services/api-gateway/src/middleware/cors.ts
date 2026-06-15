import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';

export const corsPlugin = (app: Elysia) =>
  app.use(cors());
