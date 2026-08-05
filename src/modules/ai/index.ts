import { Elysia } from 'elysia';
import { requireAuth } from '@/shared/auth/guards';
import { AiService } from './service';
import { assessSymptoms } from './symptom-assessment';

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
      const { petType, breed, estimatedAge, weight, color, size, petId } = body as {
        petType: string;
        breed?: string;
        estimatedAge?: string;
        weight?: string;
        color?: string;
        size?: string;
        petId?: string;
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
        { color, size, petId },
      );
      return { success: true, data: result, error: null };
    })

    // ─── Onboarding: closing insights ──────────────────────────────────
    .post('/onboarding/insights', async (ctx: any) => {
      const { body, headers, jwt } = ctx;
      const user = await requireAuth(headers, jwt);
      const { petId } = (body as { petId?: string }) ?? {};
      if (!petId) {
        return { success: false, error: 'petId is required', data: null };
      }
      const result = await AiService.generateOnboardingInsights(user.id, petId);
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
        headers.authorization?.startsWith('Bearer ') ? headers.authorization.slice(7) : undefined,
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

    // Preview by default: the plan is generated and saved, but no tasks or
    // reminders exist until the user approves it via /apply below.
    .post('/care-plan/:petId/generate', async (ctx: any) => {
      const { params, body, headers, jwt } = ctx;
      const user = await requireAuth(headers, jwt);
      const { apply } = (body as { apply?: boolean }) ?? {};
      const result = await AiService.generateCarePlan(user.id, params.petId, { apply: Boolean(apply) });
      return { success: true, data: result, error: null };
    })

    // Turn the (possibly edited) plan into real tasks + reminders.
    .post('/care-plan/:petId/apply', async (ctx: any) => {
      const { params, body, headers, jwt } = ctx;
      const user = await requireAuth(headers, jwt);
      const plan = (body as { plan?: any; daily_schedule?: any[]; upcoming_vaccines?: any[] }) ?? {};
      const payload = plan.plan ?? plan;
      if (!Array.isArray(payload.daily_schedule)) {
        return { success: false, error: 'daily_schedule is required', data: null };
      }
      const result = await AiService.applyCarePlan(user.id, params.petId, payload);
      return { success: true, data: result, error: null };
    })

    // ─── Legacy ────────────────────────────────────────────────────────
    .post('/detect-breed', async () => ({ success: true, data: null, error: null }))

    // ─── Symptom check ─────────────────────────────────────────────────
    .post('/symptom-check', async (ctx: any) => {
      const { body, headers, jwt } = ctx;
      try {
        const user = await requireAuth(headers, jwt);
        const { symptoms, petId } = body as { symptoms: string[]; petId?: string };
        if (!symptoms || !Array.isArray(symptoms) || symptoms.length === 0) {
          return { success: false, error: 'symptoms array is required', data: null };
        }
        const assessment = await assessSymptoms(user.id, petId, symptoms);
        return { success: true, data: assessment, error: null };
      } catch (err: any) {
        return new Response(
          JSON.stringify({ success: false, data: null, error: err?.message ?? 'Assessment failed' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }),
);
