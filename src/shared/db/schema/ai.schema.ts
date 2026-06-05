import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { pets } from './pets.schema';

/**
 * AI chat sessions — one session per conversation thread.
 */
export const aiChatSessions = pgTable(
  'ai_chat_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    petId: uuid('pet_id').references(() => pets.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 200 }),
    contextSnapshotJson: text('context_snapshot_json'),
    isAdminSession: boolean('is_admin_session').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_sessions_user').on(table.userId),
    index('idx_ai_sessions_pet').on(table.petId),
  ],
);

/**
 * Individual messages within an AI chat session.
 */
export const aiChatMessages = pgTable(
  'ai_chat_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => aiChatSessions.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 20 }).notNull(), // 'user' | 'assistant' | 'tool'
    content: text('content'),
    toolCallsJson: text('tool_calls_json'),
    toolResultsJson: text('tool_results_json'),
    inputTokens: integer('input_tokens').default(0),
    outputTokens: integer('output_tokens').default(0),
    isProactive: boolean('is_proactive').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_ai_messages_session').on(table.sessionId)],
);

/**
 * Token usage log — every AI API call recorded here for analytics + billing.
 */
export const aiTokenUsage = pgTable(
  'ai_token_usage',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    petId: uuid('pet_id').references(() => pets.id, { onDelete: 'set null' }),
    sessionId: uuid('session_id').references(() => aiChatSessions.id, { onDelete: 'set null' }),
    modelName: varchar('model_name', { length: 80 }).notNull(),
    feature: varchar('feature', { length: 80 }).notNull(), // 'chat'|'vision'|'care_plan'|'onboarding'
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_token_usage_user').on(table.userId, table.createdAt),
    index('idx_token_usage_date').on(table.createdAt),
    index('idx_token_usage_model').on(table.modelName, table.createdAt),
  ],
);

/**
 * AI-generated care plans per pet — versioned history kept.
 */
export const petCarePlans = pgTable(
  'pet_care_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    version: integer('version').default(1),
    planJson: text('plan_json').notNull(),
    generatedBy: varchar('generated_by', { length: 80 }).default('gemini-1.5-pro'),
    isActive: boolean('is_active').default(true),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
  },
  (table) => [
    index('idx_care_plans_pet').on(table.petId),
    index('idx_care_plans_active').on(table.isActive, table.petId),
  ],
);

/**
 * Proactive AI messages — tracks push + chat nudge lifecycle.
 */
export const aiProactiveMessages = pgTable(
  'ai_proactive_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    petId: uuid('pet_id').references(() => pets.id, { onDelete: 'set null' }),
    taskId: uuid('task_id'),
    messageType: varchar('message_type', { length: 50 }).notNull(),
    // 'task_overdue' | 'reorder_reminder' | 'health_alert' | 'weekly_review'
    pushSentAt: timestamp('push_sent_at', { withTimezone: true }),
    chatSentAt: timestamp('chat_sent_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    actionTakenAt: timestamp('action_taken_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_proactive_user').on(table.userId, table.createdAt)],
);

/**
 * Admin-injected AI instructions — appended to user system prompts.
 */
export const adminAiInstructions = pgTable(
  'admin_ai_instructions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    targetType: varchar('target_type', { length: 20 }).notNull(), // 'user' | 'pet' | 'global'
    targetId: uuid('target_id'), // user_id or pet_id; null = global
    instruction: text('instruction').notNull(),
    reason: text('reason'),
    priority: integer('priority').default(0),
    isActive: boolean('is_active').default(true),
    createdBy: uuid('created_by').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_admin_instructions_target').on(
      table.targetType,
      table.targetId,
      table.isActive,
    ),
  ],
);

/**
 * AI model configurations — admin-managed keys and active model.
 * purpose values: 'general_chat' | 'vision' | 'store_assistant' | 'admin_assistant' | 'care_plan' | 'onboarding'
 */
export const aiModelConfigs = pgTable('ai_model_configs', {
  id: uuid('id').defaultRandom().primaryKey(),
  provider: varchar('provider', { length: 50 }).notNull(), // 'google' | 'openai' | 'anthropic'
  modelName: varchar('model_name', { length: 100 }).notNull(),
  displayName: varchar('display_name', { length: 100 }),
  apiKeyEncrypted: text('api_key_encrypted').notNull(),
  purpose: varchar('purpose', { length: 50 }).notNull(),
  notes: text('notes'),
  baseUrl: varchar('base_url', { length: 500 }),  // custom endpoint (deepseek, openai-compatible, etc.)
  isActive: boolean('is_active').default(false),
  maxTokensPerDay: integer('max_tokens_per_day'),
  maxTokensPerUserDay: integer('max_tokens_per_user_day'),
  tokensUsedToday: integer('tokens_used_today').default(0),
  tokenResetAt: timestamp('token_reset_at', { withTimezone: true }).defaultNow(),
  costPer1kInput: numeric('cost_per_1k_input', { precision: 8, scale: 4 }),
  costPer1kOutput: numeric('cost_per_1k_output', { precision: 8, scale: 4 }),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Per-user token limits — admin can set daily/monthly caps or hard block.
 */
export const userAiTokenLimits = pgTable('user_ai_token_limits', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  dailyLimit: integer('daily_limit'),
  monthlyLimit: integer('monthly_limit'),
  isBlocked: boolean('is_blocked').default(false),
  blockReason: text('block_reason'),
  tokensToday: integer('tokens_today').default(0),
  tokensMonth: integer('tokens_month').default(0),
  resetDayAt: timestamp('reset_day_at', { withTimezone: true }).defaultNow(),
  resetMonthAt: timestamp('reset_month_at', { withTimezone: true }).defaultNow(),
  createdBy: uuid('created_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Daily stats per model config — for admin usage charts.
 */
export const aiModelDailyStats = pgTable('ai_model_daily_stats', {
  id: uuid('id').defaultRandom().primaryKey(),
  modelConfigId: uuid('model_config_id').notNull().references(() => aiModelConfigs.id, { onDelete: 'cascade' }),
  statDate: timestamp('stat_date', { withTimezone: true }).notNull().defaultNow(),
  totalCalls: integer('total_calls').default(0),
  totalTokens: integer('total_tokens').default(0),
  totalCostUsd: numeric('total_cost_usd', { precision: 10, scale: 6 }).default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
