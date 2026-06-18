import { Elysia } from 'elysia';
import { requireAuth } from '@/shared/auth/guards';
import { AiService } from './service';

export const aiController = new Elysia({ name: 'ai-controller' }).group('/ai', (app) =>
  app
    // ─── Vision: Analyze pet image ─────────────────────────────────────
    .post('/vision/analyze-pet-image', async (ctx: any) => {
      const { request, headers, jwt } = ctx;
      try {
        const user = await requireAuth(headers, jwt);
        const formData = await request.formData();
        const file = formData.get('image') as File | null;

        if (!file) {
          return { success: false, error: 'image file is required', data: null };
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
          return { success: false, error: 'Invalid file type. Use JPG, PNG, or WebP', data: null };
        }
        if (file.size > 10 * 1024 * 1024) {
          return { success: false, error: 'File too large. Max 10MB', data: null };
        }

        const arrayBuffer = await file.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const result = await AiService.analyzePetImage(user.id, base64, file.type);
        return { success: true, data: result, error: null };
      } catch (err: any) {
        console.error('[vision/analyze-pet-image] error:', err?.message ?? err);
        return new Response(
          JSON.stringify({ success: false, data: null, error: err?.message ?? 'Vision analysis failed' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
      }
    })

    // ─── Onboarding: Generate dynamic questions ────────────────────────
    .post('/onboarding/generate-questions', async (ctx: any) => {
      const { body, headers, jwt } = ctx;
      const user = await requireAuth(headers, jwt);
      const { petType, breed, estimatedAge, weight } = body as {
        petType: string;
        breed?: string;
        estimatedAge?: string;
        weight?: string;
      };

      if (!petType) {
        return { success: false, error: 'petType is required', data: null };
      }

      const result = await AiService.generateOnboardingQuestions(
        user.id,
        petType,
        breed ?? '',
        estimatedAge ?? '',
        weight ?? '',
      );
      return { success: true, data: result, error: null };
    })

    // ─── Chat Sessions ─────────────────────────────────────────────────
    .post('/chat/sessions', async (ctx: any) => {
      const { body, headers, jwt } = ctx;
      const user = await requireAuth(headers, jwt);
      const { petId } = (body as { petId?: string }) ?? {};
      const result = await AiService.createSession(user.id, petId);
      return { success: true, data: result, error: null };
    })

    .get('/chat/sessions', async (ctx: any) => {
      const { headers, jwt } = ctx;
      const user = await requireAuth(headers, jwt);
      const result = await AiService.listSessions(user.id);
      return { success: true, data: result, error: null };
    })

    .delete('/chat/sessions/:sessionId', async (ctx: any) => {
      const { params, headers, jwt } = ctx;
      const user = await requireAuth(headers, jwt);
      const result = await AiService.deleteSession(user.id, params.sessionId);
      return { success: true, data: result, error: null };
    })

    .get('/chat/sessions/:sessionId/messages', async (ctx: any) => {
      const { params, headers, jwt } = ctx;
      const user = await requireAuth(headers, jwt);
      const result = await AiService.getMessages(user.id, params.sessionId);
      return { success: true, data: result, error: null };
    })

    // ─── Chat: Send message (REST fallback — WebSocket is primary) ─────
    .post('/chat/sessions/:sessionId/messages', async (ctx: any) => {
      const { params, body, headers, jwt } = ctx;
      const user = await requireAuth(headers, jwt);
      const { message, petId } = body as { message: string; petId?: string };

      if (!message?.trim()) {
        return { success: false, error: 'message is required', data: null };
      }

      const result = await AiService.sendMessage(
        user.id,
        params.sessionId,
        message.trim(),
        petId,
      );
      return { success: true, data: result, error: null };
    })

    // ─── Care Plan ─────────────────────────────────────────────────────
    .get('/care-plan/:petId', async (ctx: any) => {
      const { params, headers, jwt } = ctx;
      await requireAuth(headers, jwt);
      const result = await AiService.getCarePlan(params.petId);
      return { success: true, data: result, error: null };
    })

    .post('/care-plan/:petId/generate', async (ctx: any) => {
      const { params, headers, jwt } = ctx;
      const user = await requireAuth(headers, jwt);
      const result = await AiService.generateCarePlan(user.id, params.petId);
      return { success: true, data: result, error: null };
    })

    // ─── Legacy ────────────────────────────────────────────────────────
    .post('/detect-breed', async () => ({ success: true, data: null, error: null })),
);
