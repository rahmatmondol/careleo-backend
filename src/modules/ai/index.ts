import { Elysia } from 'elysia';
import { requireAuth } from '@/shared/auth/guards';
import { NotFoundError } from '@/shared/errors';
import { ValidationError } from '@/shared/errors';
import { AiService } from './service';
import {
  assessSymptoms,
  generateSymptomQuestions,
  getSymptomReport,
  listSymptomReports,
} from './symptom-assessment';

export const aiController = new Elysia({ name: 'ai-controller' }).group('/ai', (app) =>
  app
    // ─── Vision: Analyze pet image ─────────────────────────────────────
    .post('/vision/analyze-pet-image', async (ctx: any) => {
      const { body, request, headers, jwt } = ctx;
      const fail = (status: number, error: string) =>
        new Response(JSON.stringify({ success: false, data: null, error }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });

      try {
        const user = await requireAuth(headers, jwt);

        // Elysia parses multipart bodies itself, so the file is already on
        // `ctx.body` — reading `request.formData()` first would consume an
        // already-consumed stream. `pets/:id/upload-image` has always read the
        // parsed body; this route did not, and matched no other upload here.
        // The formData path stays as a fallback for a raw, unparsed body.
        let file = (body?.image ?? body?.file) as File | null;
        if (!file && typeof request?.formData === 'function') {
          try {
            const formData = await request.formData();
            file = formData.get('image') as File | null;
          } catch {
            // Body already consumed by the parser and no file on it — fall
            // through to the "image file is required" answer below.
          }
        }

        if (!file || typeof file.arrayBuffer !== 'function') {
          return fail(400, 'image file is required');
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
          return fail(415, `Invalid file type: ${file.type || 'unknown'}. Use JPG, PNG, or WebP`);
        }
        if (file.size > 10 * 1024 * 1024) {
          return fail(413, 'File too large. Max 10MB');
        }

        const arrayBuffer = await file.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const result = await AiService.analyzePetImage(user.id, base64, file.type);
        return { success: true, data: result, error: null };
      } catch (err: any) {
        console.error('[vision/analyze-pet-image] error:', err?.message ?? err);
        // These used to return HTTP 200 with `success: false`, which the app
        // read as "no pet in this photo" instead of as a failure.
        return fail(500, err?.message ?? 'Vision analysis failed');
      }
    })

    // ─── Vision: Describe a symptom photo ──────────────────────────────
    /**
     * Optional photo step of the symptom checker. Returns what is visibly
     * present — never a diagnosis — so the owner can confirm it and the text
     * assessment gets better input. An empty `observations` list is a normal,
     * correct answer, not a failure.
     */
    .post('/vision/analyze-symptom-image', async (ctx: any) => {
      const { body, request, headers, jwt } = ctx;
      const fail = (status: number, error: string) =>
        new Response(JSON.stringify({ success: false, data: null, error }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });

      try {
        const user = await requireAuth(headers, jwt);

        let file = (body?.image ?? body?.file) as File | null;
        if (!file && typeof request?.formData === 'function') {
          try {
            const formData = await request.formData();
            file = formData.get('image') as File | null;
          } catch {
            // Body already consumed by the parser and no file on it.
          }
        }

        if (!file || typeof file.arrayBuffer !== 'function') {
          return fail(400, 'image file is required');
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
          return fail(415, `Invalid file type: ${file.type || 'unknown'}. Use JPG, PNG, or WebP`);
        }
        if (file.size > 10 * 1024 * 1024) {
          return fail(413, 'File too large. Max 10MB');
        }

        const arrayBuffer = await file.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const result = await AiService.observeSymptomImage(user.id, base64, file.type);
        return { success: true, data: result, error: null };
      } catch (err: any) {
        console.error('[vision/analyze-symptom-image] error:', err?.message ?? err);
        return fail(500, err?.message ?? 'Vision analysis failed');
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

    /**
     * Chat: streamed reply (Server-Sent Events).
     *
     * The blocking endpoint below only answers once the whole tool loop has
     * finished, which is 10–20 seconds on a multi-step request. This emits the
     * text as the model writes it, plus a `tool` event whenever an action
     * starts so the UI can show what is happening.
     *
     * SSE rather than WebSocket: replies are one-directional and short-lived,
     * so a socket buys nothing here and costs connection state. (The app's old
     * WebSocket client pointed at a `/ws/chat` route that never existed.)
     *
     * Event frames: `{"type":"delta","text":…}`, `{"type":"tool","name":…}`,
     * `{"type":"done","message":…,"toolsUsed":[…]}`, `{"type":"error",…}`.
     */
    .post('/chat/sessions/:sessionId/stream', async (ctx: any) => {
      const { params, body, headers, jwt } = ctx;
      const user = await requireAuth(headers, jwt);
      const { message, petId, image } = body as {
        message: string;
        petId?: string;
        image?: { base64?: string; mimeType?: string };
      };
      if (!message?.trim()) throw new ValidationError('message is required');

      // A photo can ride along with the message, so "does this look infected?"
      // stays one conversation instead of a detour through the vision endpoint.
      let chatImage: { base64: string; mimeType: string } | undefined;
      if (image?.base64) {
        const mimeType = String(image.mimeType ?? 'image/jpeg');
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
          throw new ValidationError('image must be JPEG, PNG or WebP');
        }
        // ~7MB of base64 is ~5MB of image; past that providers reject it
        // anyway and the request just wastes a round trip.
        if (image.base64.length > 7_000_000) throw new ValidationError('image is too large (max ~5MB)');
        chatImage = { base64: image.base64, mimeType };
      }

      const authToken = headers.authorization?.startsWith('Bearer ')
        ? headers.authorization.slice(7)
        : undefined;

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (payload: unknown) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          try {
            for await (const event of AiService.streamMessage(
              user.id,
              params.sessionId,
              message.trim(),
              petId,
              authToken,
              chatImage,
            )) {
              send(
                event.type === 'done'
                  ? { type: 'done', message: event.message, toolsUsed: event.toolCalls.map((t) => t.tool) }
                  : event,
              );
            }
          } catch (e: any) {
            // The status line is long gone by the time this can fail, so the
            // error has to travel as a frame the client can act on.
            send({ type: 'error', message: e?.message ?? 'Chat failed' });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          // Proxies that buffer would defeat the whole point.
          'X-Accel-Buffering': 'no',
        },
      });
    })

    // ─── Chat: Send message (blocking fallback for older app builds) ───
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

    /*
     * `POST /detect-breed` was removed. It answered every request with
     * `data: null` and no screen ever called it — the app's matching
     * `detectBreed()` helper was dead too. Breed detection is
     * `POST /vision/analyze-pet-image` above, which takes the image itself
     * rather than a URL; a URL-taking variant would mean fetching arbitrary
     * user-supplied addresses from the server, which is not worth an SSRF
     * surface for a feature nothing used.
     */

    // ─── Symptom check ─────────────────────────────────────────────────
    .post('/symptom-check', async (ctx: any) => {
      const { body, headers, jwt } = ctx;
      try {
        const user = await requireAuth(headers, jwt);
        const { symptoms, petId, observations, answers, source } = body as {
          symptoms: string[];
          petId?: string;
          observations?: string[];
          answers?: { question: string; answer: string }[];
          source?: 'ai' | 'critical-sign' | 'offline';
        };
        if (!symptoms || !Array.isArray(symptoms) || symptoms.length === 0) {
          return { success: false, error: 'symptoms array is required', data: null };
        }
        const assessment = await assessSymptoms(
          user.id,
          petId,
          symptoms,
          Array.isArray(observations) ? observations.map(String).filter(Boolean).slice(0, 6) : [],
          Array.isArray(answers)
            ? answers
                .filter((a) => a?.question && a?.answer)
                .map((a) => ({ question: String(a.question), answer: String(a.answer) }))
                .slice(0, 8)
            : [],
          source === 'critical-sign' || source === 'offline' ? source : 'ai',
        );
        return { success: true, data: assessment, error: null };
      } catch (err: any) {
        return new Response(
          JSON.stringify({ success: false, data: null, error: err?.message ?? 'Assessment failed' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
      }
    })

    // ─── Symptom report history ────────────────────────────────────────
    /**
     * Past assessments for the signed-in owner, newest first. Every triage has
     * always been written to `symptom_reports` — this is the first thing that
     * reads them back, so an owner can see what they reported last week and the
     * follow-up notification has somewhere to land.
     */
    .get('/symptom-reports', async (ctx: any) => {
      const { headers, jwt, query } = ctx;
      const user = await requireAuth(headers, jwt);
      const result = await listSymptomReports(user.id, {
        petId: query?.petId ? String(query.petId) : undefined,
        limit: query?.limit ? Number(query.limit) : undefined,
      });
      return { success: true, data: result, error: null };
    })

    .get('/symptom-reports/:id', async (ctx: any) => {
      const { headers, jwt, params } = ctx;
      const user = await requireAuth(headers, jwt);
      const report = await getSymptomReport(user.id, String(params.id));
      if (!report) throw new NotFoundError('Symptom report not found');
      return { success: true, data: { report }, error: null };
    })

    /**
     * Open a chat about a report. Returns an existing session if one was
     * already started for it, so the owner keeps one thread per episode.
     */
    .post('/symptom-reports/:id/chat', async (ctx: any) => {
      const { headers, jwt, params } = ctx;
      const user = await requireAuth(headers, jwt);
      const result = await AiService.startChatFromSymptomReport(user.id, String(params.id));
      return { success: true, data: result, error: null };
    })

    // ─── Symptom follow-up questions ───────────────────────────────────
    /**
     * Questions targeted at what the owner actually reported, replacing a fixed
     * list that asked every owner the same thing. Always answers with a usable
     * set — a generic fallback rather than an error — because the flow cannot
     * dead-end on a failed generation.
     */
    .post('/symptom-questions', async (ctx: any) => {
      const { body, headers, jwt } = ctx;
      try {
        const user = await requireAuth(headers, jwt);
        const { symptoms, petId, observations } = body as {
          symptoms: string[];
          petId?: string;
          observations?: string[];
        };
        if (!symptoms || !Array.isArray(symptoms) || symptoms.length === 0) {
          return { success: false, error: 'symptoms array is required', data: null };
        }
        const result = await generateSymptomQuestions(
          user.id,
          petId,
          symptoms,
          Array.isArray(observations) ? observations.map(String).filter(Boolean).slice(0, 6) : [],
        );
        return { success: true, data: result, error: null };
      } catch (err: any) {
        return new Response(
          JSON.stringify({ success: false, data: null, error: err?.message ?? 'Question generation failed' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }),
);
