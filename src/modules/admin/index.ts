import { Elysia } from 'elysia';
import { AdminService } from './service';
import { AdminAiService } from './ai-service';
import { requireAuth, requirePermission } from '@/shared/auth/guards';
import { NotFoundError } from '@/shared/errors';
import { getProviderCatalog } from '@/modules/ai/provider-catalog';

export const adminController = new Elysia({ name: 'admin-controller' }).group('/admin', (app) =>
  app
    .get('/dashboard/summary', async (ctx: any) => {
      const { headers, jwt } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const data = await AdminService.getDashboardSummary();
      return { success: true, data, error: null };
    })

    .get('/orders', async (ctx: any) => {
      const { headers, jwt } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      return AdminService.ping();
    })

    // ─── Customers ─────────────────────────────────────────────────────
    .get('/users', async (ctx: any) => {
      const user = await requireAuth(ctx.headers, ctx.jwt);
      requirePermission(user, 'users.read');
      const data = await AdminService.listUsers(ctx.query ?? {});
      return { success: true, data, error: null };
    })

    .get('/users/:id', async (ctx: any) => {
      const user = await requireAuth(ctx.headers, ctx.jwt);
      requirePermission(user, 'users.read');
      const data = await AdminService.getUser(String(ctx.params.id));
      if (!data) throw new NotFoundError('User not found');
      return { success: true, data, error: null };
    })

    // ─── Subscribers (plan management lives in adminSubscriptionsController) ──
    .get('/subscriptions', async (ctx: any) => {
      const user = await requireAuth(ctx.headers, ctx.jwt);
      requirePermission(user, 'plans.manage');
      const data = await AdminService.listSubscriptions(ctx.query ?? {});
      return { success: true, data, error: null };
    })

    .get('/subscriptions/analytics', async (ctx: any) => {
      const user = await requireAuth(ctx.headers, ctx.jwt);
      requirePermission(user, 'plans.manage');
      const data = await AdminService.getSubscriptionAnalytics();
      return { success: true, data, error: null };
    })

    // ─── Admin AI: Token Usage ─────────────────────────────────────────
    .get('/ai/token-usage/summary', async (ctx: any) => {
      const { headers, jwt, query } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const data = await AdminAiService.getTokenUsageSummary(query.period ?? 'month');
      return { success: true, data, error: null };
    })

    .get('/ai/token-usage/by-user', async (ctx: any) => {
      const { headers, jwt, query } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const data = await AdminAiService.getTokenUsageByUser(
        query.period ?? 'month',
        Number(query.page ?? 1),
        Number(query.limit ?? 20),
      );
      return { success: true, data, error: null };
    })

    .get('/ai/token-usage/user/:userId', async (ctx: any) => {
      const { headers, jwt, query, params } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const data = await AdminAiService.getTokenUsageForUser(params.userId, query.period ?? 'month');
      return { success: true, data, error: null };
    })

    .get('/ai/token-usage/by-model', async (ctx: any) => {
      const { headers, jwt, query } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const data = await AdminAiService.getTokenUsageByModel(query.period ?? 'month');
      return { success: true, data, error: null };
    })

    .get('/ai/purpose-summary', async (ctx: any) => {
      const { headers, jwt } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const models = await AdminAiService.listModels();
      const purposes = ['general_chat', 'vision', 'store_assistant', 'admin_assistant', 'care_plan', 'onboarding'];
      const summary: Record<string, any> = {};
      for (const p of purposes) {
        const active = models.find((m: any) => m.purpose === p && m.isActive);
        summary[p] = active
          ? { modelName: active.modelName, provider: active.provider, displayName: active.displayName }
          : null;
      }
      return { success: true, data: summary, error: null };
    })

    .get('/ai/token-usage/logs', async (ctx: any) => {
      const { headers, jwt, query } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const data = await AdminAiService.getTokenUsageLogs({
        period:    query.period    ?? 'month',
        modelName: query.modelName ?? undefined,
        userId:    query.userId    ?? undefined,
        feature:   query.feature   ?? undefined,
        page:      Number(query.page  ?? 1),
        limit:     Number(query.limit ?? 50),
      });
      return { success: true, data, error: null };
    })

    // ─── Admin AI: Chat Logs ───────────────────────────────────────────
    .get('/ai/chat-sessions', async (ctx: any) => {
      const { headers, jwt, query } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const data = await AdminAiService.listChatSessions({
        userId: query.userId,
        petId:  query.petId,
        page:   Number(query.page ?? 1),
        limit:  Number(query.limit ?? 20),
      });
      return { success: true, data, error: null };
    })

    .get('/ai/chat-sessions/:sessionId/messages', async (ctx: any) => {
      const { headers, jwt, params } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const data = await AdminAiService.getChatSessionMessages(params.sessionId);
      return { success: true, data, error: null };
    })

    // ─── Admin AI: Model Key Management ───────────────────────────────
    // Provider catalog for the "add model" form dropdown (labels, base-URL
    // requirement, subscription-proxy caveat, example model).
    .get('/ai/providers', async (ctx: any) => {
      const { headers, jwt } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      return { success: true, data: getProviderCatalog(), error: null };
    })

    .get('/ai/models', async (ctx: any) => {
      const { headers, jwt } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const data = await AdminAiService.listModels();
      return { success: true, data, error: null };
    })

    .post('/ai/models', async (ctx: any) => {
      const { headers, jwt, body } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const b = body as any;
      if (!b.apiKey || !String(b.apiKey).trim()) {
        return { success: false, data: null, error: 'API key is required' };
      }
      const data = await AdminAiService.addModel({
        provider:        b.provider,
        modelName:       b.modelName,
        displayName:     b.displayName,
        apiKey:          b.apiKey,
        purpose:         b.purpose ?? 'general_chat',
        baseUrl:         b.baseUrl ?? null,
        notes:           b.notes ?? null,
        maxTokensPerDay: b.maxTokensPerDay ? Number(b.maxTokensPerDay) : undefined,
        maxTokensPerUserDay: b.maxTokensPerUserDay ? Number(b.maxTokensPerUserDay) : undefined,
        costPer1kInput:  b.costPer1kInput ? Number(b.costPer1kInput) : undefined,
        costPer1kOutput: b.costPer1kOutput ? Number(b.costPer1kOutput) : undefined,
        createdBy: user.id,
      });
      return { success: true, data, error: null };
    })

    .post('/ai/models/:modelId/activate', async (ctx: any) => {
      const { headers, jwt, params } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const data = await AdminAiService.activateModel(params.modelId);
      return { success: true, data, error: null };
    })

    .patch('/ai/models/:modelId/activate', async (ctx: any) => {
      const { headers, jwt, params } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const data = await AdminAiService.activateModel(params.modelId);
      return { success: true, data, error: null };
    })

    .delete('/ai/models/:modelId', async (ctx: any) => {
      const { headers, jwt, params } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      await AdminAiService.deleteModel(params.modelId);
      return { success: true, data: { message: 'Model deleted' }, error: null };
    })

    .put('/ai/models/:modelId', async (ctx: any) => {
      const { headers, jwt, params, body } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const b = body as any;
      const data = await AdminAiService.updateModel(params.modelId, {
        provider: b.provider,
        modelName: b.modelName,
        displayName: b.displayName,
        apiKey: b.apiKey,
        purpose: b.purpose,
        baseUrl: b.baseUrl,
        notes: b.notes,
        maxTokensPerDay: b.maxTokensPerDay ? Number(b.maxTokensPerDay) : undefined,
        maxTokensPerUserDay: b.maxTokensPerUserDay ? Number(b.maxTokensPerUserDay) : undefined,
        costPer1kInput: b.costPer1kInput ? Number(b.costPer1kInput) : undefined,
        costPer1kOutput: b.costPer1kOutput ? Number(b.costPer1kOutput) : undefined,
      });
      return { success: true, data, error: null };
    })

    // ─── Admin AI: Instructions ────────────────────────────────────────
    .get('/ai/instructions', async (ctx: any) => {
      const { headers, jwt, query } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const data = await AdminAiService.listInstructions(query.targetType, query.targetId);
      return { success: true, data, error: null };
    })

    .post('/ai/instructions', async (ctx: any) => {
      const { headers, jwt, body } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const data = await AdminAiService.createInstruction({ ...(body as any), createdBy: user.id });
      return { success: true, data, error: null };
    })

    .patch('/ai/instructions/:id', async (ctx: any) => {
      const { headers, jwt, params, body } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      await AdminAiService.updateInstruction(params.id, body as any);
      return { success: true, data: { message: 'Updated' }, error: null };
    })

    .delete('/ai/instructions/:id', async (ctx: any) => {
      const { headers, jwt, params } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      await AdminAiService.deleteInstruction(params.id);
      return { success: true, data: { message: 'Deleted' }, error: null };
    })

    // ─── Admin AI: User Status ─────────────────────────────────────────
    .get('/ai/users/:userId/status', async (ctx: any) => {
      const { headers, jwt, params } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const data = await AdminAiService.getUserAiStatus(params.userId);
      return { success: true, data, error: null };
    })

    // ─── Admin AI: Platform Summary ────────────────────────────────────
    .get('/ai/platform-summary', async (ctx: any) => {
      const { headers, jwt } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const data = await AdminAiService.getPlatformSummary();
      return { success: true, data, error: null };
    })

    // ─── Admin AI: Model Purpose Management ───────────────────────────
    .get('/ai/models/by-purpose', async (ctx: any) => {
      const { headers, jwt } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const data = await AdminAiService.listModelsByPurpose();
      return { success: true, data, error: null };
    })

    .get('/ai/models/purpose-summary', async (ctx: any) => {
      const { headers, jwt } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const data = await AdminAiService.getPurposeSummary();
      return { success: true, data, error: null };
    })

    .patch('/ai/models/:modelId/purpose', async (ctx: any) => {
      const { headers, jwt, params, body } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const { purpose } = body as { purpose: string };
      await AdminAiService.updateModelPurpose(params.modelId, purpose);
      return { success: true, data: { message: 'Purpose updated' }, error: null };
    })

    .patch('/ai/models/:modelId/limits', async (ctx: any) => {
      const { headers, jwt, params, body } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      await AdminAiService.updateModelLimits(params.modelId, body as any);
      return { success: true, data: { message: 'Limits updated' }, error: null };
    })

    .get('/ai/models/:modelId/stats', async (ctx: any) => {
      const { headers, jwt, params, query } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const data = await AdminAiService.getModelDailyStats(params.modelId, Number(query.days ?? 7));
      return { success: true, data, error: null };
    })

    .post('/ai/models/:modelId/test', async (ctx: any) => {
      const { headers, jwt, params, body } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const { message } = body as { message: string };
      const data = await AdminAiService.testModel(params.modelId, message ?? 'Hello! Reply with "OK" to confirm you are working.');
      return { success: true, data, error: null };
    })

    .post('/ai/admin-chat', async (ctx: any) => {
      const { headers, jwt, body } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const { message, history } = body as { message: string; history?: Array<{ role: 'user' | 'assistant'; content: string }> };
      if (!message?.trim()) return { success: false, data: null, error: 'message required' };
      const data = await AdminAiService.adminChat(message, history ?? []);
      return { success: true, data, error: null };
    })

    // ─── Admin AI: User Token Limits ──────────────────────────────────
    .get('/ai/user-limits', async (ctx: any) => {
      const { headers, jwt, query } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const data = await AdminAiService.listUserTokenLimits(Number(query.page ?? 1), Number(query.limit ?? 20));
      return { success: true, data, error: null };
    })

    .get('/ai/user-limits/:userId', async (ctx: any) => {
      const { headers, jwt, params } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const data = await AdminAiService.getUserTokenLimit(params.userId);
      return { success: true, data, error: null };
    })

    .post('/ai/user-limits', async (ctx: any) => {
      const { headers, jwt, body } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const data = await AdminAiService.setUserTokenLimit(user.id, body as any);
      return { success: true, data, error: null };
    })

    .delete('/ai/user-limits/:userId', async (ctx: any) => {
      const { headers, jwt, params } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const data = await AdminAiService.removeUserTokenLimit(params.userId);
      return { success: true, data, error: null };
    })

    .post('/ai/users/:userId/block', async (ctx: any) => {
      const { headers, jwt, params, body } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const { reason } = body as { reason: string };
      const data = await AdminAiService.blockUser(user.id, params.userId, reason);
      return { success: true, data, error: null };
    })

    .post('/ai/users/:userId/unblock', async (ctx: any) => {
      const { headers, jwt, params } = ctx;
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      const data = await AdminAiService.unblockUser(user.id, params.userId);
      return { success: true, data, error: null };
    }),
);
