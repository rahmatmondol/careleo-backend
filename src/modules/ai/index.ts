import { Elysia } from 'elysia';
import { AiService } from './service';

export const aiController = new Elysia({ name: 'ai-controller' }).group('/ai', (app) =>
  app
    .post('/chat/session', async () => AiService.ping())
    .get('/chat/sessions', async () => AiService.ping())
    .post('/detect-breed', async () => AiService.ping())
);
