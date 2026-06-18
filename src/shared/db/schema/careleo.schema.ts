import { pgTable, uuid, varchar, text, boolean, timestamp, integer, decimal, jsonb, index, uniqueIndex, vector } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * USERS TABLE
 * Firebase-backed user authentication + profile
 */
export const usersTable = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  firebaseUid: varchar('firebaseUid', { length: 255 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  isEmailVerified: boolean('isEmailVerified').default(true),
  name: varchar('name', { length: 100 }),
  avatar: varchar('avatar', { length: 500 }),
  locale: varchar('locale', { length: 10 }).default('en'),
  timezone: varchar('timezone', { length: 50 }),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow()
}, table => [
  index('idx_users_firebaseUid').on(table.firebaseUid),
  index('idx_users_email').on(table.email)
]);

/**
 * DEVICE TOKENS TABLE
 * Firebase Cloud Messaging (FCM) tokens for push notifications
 */
export const deviceTokensTable = pgTable('device_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('userId').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  fcmToken: varchar('fcmToken', { length: 500 }).notNull().unique(),
  deviceType: varchar('deviceType', { length: 20 }).notNull(), // 'ios', 'android'
  isActive: boolean('isActive').default(true),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow()
}, table => [
  index('idx_device_tokens_userId').on(table.userId),
  index('idx_device_tokens_isActive').on(table.isActive)
]);

/**
 * PETS TABLE
 * Core pet profiles with AI-extracted metadata
 */
export const petsTable = pgTable('pets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('userId').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  
  // Image Data
  imageUrl: varchar('imageUrl', { length: 500 }),
  imageHash: varchar('imageHash', { length: 100 }),
  imageAnalyzedAt: timestamp('imageAnalyzedAt', { withTimezone: true }),
  
  // AI-Extracted Metadata (breed, color, age, confidence, etc.)
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
  
  // Basic Info
  dateOfBirth: timestamp('dateOfBirth', { withTimezone: true }),
  weight: decimal('weight', { precision: 5, scale: 2 }), // kg
  gender: varchar('gender', { length: 10 }), // 'male', 'female'
  
  // Health Profile
  allergies: text('allergies').array().default(sql`'{}'::text[]`),
  medicalConditions: text('medicalConditions').array().default(sql`'{}'::text[]`),
  medications: jsonb('medications').default(sql`'{}'::jsonb`),
  vaccinations: jsonb('vaccinations').default(sql`'{}'::jsonb`),
  
  // Lifestyle
  activityLevel: varchar('activityLevel', { length: 20 }), // 'sedentary', 'moderate', 'active'
  dietaryPreferences: jsonb('dietaryPreferences').default(sql`'{}'::jsonb`),
  
  // Tracking
  careHistoryCount: integer('careHistoryCount').default(0),
  lastCarePlanUpdate: timestamp('lastCarePlanUpdate', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow()
}, table => [
  index('idx_pets_userId').on(table.userId),
  index('idx_pets_createdAt').on(table.createdAt),
  index('idx_pets_breed').on(table.metadata)
]);

/**
 * AI CARE SESSIONS TABLE
 * Tracks pet onboarding: image analysis → Q&A → care plan generation
 */
export const aiCareSessionsTable = pgTable('ai_care_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  petId: uuid('petId').notNull().references(() => petsTable.id, { onDelete: 'cascade' }),
  userId: uuid('userId').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  
  // Session Phase
  phase: varchar('phase', { length: 50 }).default('image_analysis'), // image_analysis, qa_collection, care_plan_generation, complete
  startedAt: timestamp('startedAt', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completedAt', { withTimezone: true }),
  
  // Collected Data
  imageAnalysisResult: jsonb('imageAnalysisResult'),
  qaResponses: jsonb('qaResponses').default(sql`'{}'::jsonb`),
  aiModel: varchar('aiModel', { length: 50 }),
  totalTokensUsed: integer('totalTokensUsed').default(0),
  
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow()
}, table => [
  index('idx_ai_care_sessions_petId').on(table.petId),
  index('idx_ai_care_sessions_phase').on(table.phase)
]);

/**
 * PET CARE PLANS TABLE
 * Daily care schedule: food, activity, medicine
 */
export const petCarePlansTable = pgTable('pet_care_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  petId: uuid('petId').notNull().references(() => petsTable.id, { onDelete: 'cascade' }),
  
  // Daily Schedule
  foodPlan: jsonb('foodPlan').notNull(), // {meals: [...], totalDailyCalories, macros}
  activityPlan: jsonb('activityPlan').notNull(), // {activities: [...], weeklyExerciseMinutes}
  medicinePlan: jsonb('medicinePlan').notNull(), // {medicines: [...]}
  healthCheckups: jsonb('healthCheckups'), // {vet: {...}, dental: {...}}
  
  // Metadata
  aiModel: varchar('aiModel', { length: 50 }),
  generatedAt: timestamp('generatedAt', { withTimezone: true }).defaultNow(),
  validFrom: timestamp('validFrom', { withTimezone: true }),
  validUntil: timestamp('validUntil', { withTimezone: true }),
  version: integer('version').default(1),
  
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow()
}, table => [
  index('idx_pet_care_plans_petId').on(table.petId),
  index('idx_pet_care_plans_validUntil').on(table.validUntil)
]);

/**
 * PET ACTIVITY LOGS TABLE
 * Tracks completed daily activities (meals, meds, walks, etc.)
 */
export const petActivityLogsTable = pgTable('pet_activity_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  petId: uuid('petId').notNull().references(() => petsTable.id, { onDelete: 'cascade' }),
  carePlanId: uuid('carePlanId').references(() => petCarePlansTable.id),
  
  // Activity Info
  activityType: varchar('activityType', { length: 50 }).notNull(), // 'feeding', 'medicine', 'walk', 'play'
  scheduledTime: timestamp('scheduledTime', { withTimezone: true }),
  completedTime: timestamp('completedTime', { withTimezone: true }),
  
  // Details
  details: jsonb('details'),
  status: varchar('status', { length: 20 }).default('pending'), // 'pending', 'completed', 'skipped'
  userNotes: text('userNotes'),
  
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow()
}, table => [
  index('idx_pet_activity_logs_petId').on(table.petId),
  index('idx_pet_activity_logs_status').on(table.status),
  index('idx_pet_activity_logs_completedTime').on(table.completedTime)
]);

/**
 * AI CHAT SESSIONS TABLE
 * General pet care chat conversations
 */
export const aiChatSessionsTable = pgTable('ai_chat_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('userId').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  petId: uuid('petId').references(() => petsTable.id, { onDelete: 'set null' }),
  
  // Session Info
  topic: varchar('topic', { length: 50 }), // 'pet_health', 'behavior', 'nutrition', 'general'
  title: varchar('title', { length: 200 }),
  
  // Usage
  totalTokensUsed: integer('totalTokensUsed').default(0),
  aiModel: varchar('aiModel', { length: 50 }),
  
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow(),
  archivedAt: timestamp('archivedAt', { withTimezone: true })
}, table => [
  index('idx_ai_chat_sessions_userId').on(table.userId),
  index('idx_ai_chat_sessions_petId').on(table.petId),
  index('idx_ai_chat_sessions_createdAt').on(table.createdAt)
]);

/**
 * AI CHAT MESSAGES TABLE
 * Individual chat messages with embeddings for semantic search
 */
export const aiChatMessagesTable = pgTable('ai_chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('sessionId').notNull().references(() => aiChatSessionsTable.id, { onDelete: 'cascade' }),
  
  // Content
  role: varchar('role', { length: 20 }).notNull(), // 'user', 'assistant'
  content: text('content').notNull(),
  
  // Embeddings for semantic search
  contentEmbedding: vector('contentEmbedding', { dimensions: 1536 }),
  
  // Metadata
  tokensUsed: integer('tokensUsed'),
  modelUsed: varchar('modelUsed', { length: 50 }),
  metadata: jsonb('metadata'),
  
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow()
}, table => [
  index('idx_ai_chat_messages_sessionId').on(table.sessionId),
  index('idx_ai_chat_messages_createdAt').on(table.createdAt)
]);

/**
 * FOOD RECOMMENDATIONS TABLE
 * AI-recommended products from the shop-service store
 */
export const foodRecommendationsTable = pgTable('food_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  petId: uuid('petId').notNull().references(() => petsTable.id, { onDelete: 'cascade' }),
  foodId: uuid('foodId').notNull(), // references a shop-service product id
  
  // Recommendation
  reason: varchar('reason', { length: 200 }),
  matchScore: decimal('matchScore', { precision: 3, scale: 2 }), // 0.00 to 1.00
  
  // Engagement
  viewedAt: timestamp('viewedAt', { withTimezone: true }),
  addedToCartAt: timestamp('addedToCartAt', { withTimezone: true }),
  purchasedAt: timestamp('purchasedAt', { withTimezone: true }),
  rating: integer('rating'), // 1-5 stars
  
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow()
}, table => [
  index('idx_food_recommendations_petId').on(table.petId),
  index('idx_food_recommendations_matchScore').on(table.matchScore)
]);

/**
 * TOKEN USAGE TABLE
 * Track AI API token usage for billing + analytics
 */
export const tokenUsageTable = pgTable('token_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('userId').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  sessionId: uuid('sessionId'),
  
  // Model Info
  aiModel: varchar('aiModel', { length: 50 }).notNull(),
  modelProvider: varchar('modelProvider', { length: 50 }), // 'openai', 'anthropic', 'google'
  
  // Usage
  inputTokens: integer('inputTokens'),
  outputTokens: integer('outputTokens'),
  totalTokens: integer('totalTokens').generatedAlwaysAs(
    sql`${integer('inputTokens')} + ${integer('outputTokens')}`
  ),
  costUSD: decimal('costUSD', { precision: 8, scale: 4 }),
  
  // Request Info
  requestType: varchar('requestType', { length: 50 }), // 'image_analysis', 'qa', 'care_plan', 'chat'
  
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow()
}, table => [
  index('idx_token_usage_userId').on(table.userId),
  index('idx_token_usage_createdAt').on(table.createdAt),
  index('idx_token_usage_aiModel').on(table.aiModel)
]);

/**
 * AI MODELS CONFIG TABLE
 * Admin-managed AI model configurations
 */
export const aiModelsConfigTable = pgTable('ai_models_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Model Identity
  modelName: varchar('modelName', { length: 50 }).notNull().unique(),
  provider: varchar('provider', { length: 50 }).notNull(), // 'openai', 'anthropic', 'google'
  
  // Configuration
  apiKey: varchar('apiKey', { length: 500 }).notNull(),
  isActive: boolean('isActive').default(true),
  priority: integer('priority').default(100), // Lower = higher priority
  
  // Capabilities
  supportsImageAnalysis: boolean('supportsImageAnalysis').default(false),
  supportsChat: boolean('supportsChat').default(true),
  supportsStreaming: boolean('supportsStreaming').default(true),
  
  // Limits
  maxTokensPerRequest: integer('maxTokensPerRequest').default(2000),
  temperature: decimal('temperature', { precision: 3, scale: 2 }).default(sql`0.7`),
  costPer1kInputTokens: decimal('costPer1kInputTokens', { precision: 6, scale: 4 }),
  costPer1kOutputTokens: decimal('costPer1kOutputTokens', { precision: 6, scale: 4 }),
  
  // Usage Limits
  dailyTokenQuota: integer('dailyTokenQuota'),
  currentDayTokenUsage: integer('currentDayTokenUsage').default(0),
  
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow()
}, table => [
  index('idx_ai_models_config_provider').on(table.provider),
  index('idx_ai_models_config_isActive').on(table.isActive)
]);

/**
 * REMINDERS TABLE
 * Scheduled reminders for daily pet care tasks
 */
export const remindersTable = pgTable('reminders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('userId').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  petId: uuid('petId').notNull().references(() => petsTable.id, { onDelete: 'cascade' }),
  carePlanId: uuid('carePlanId').references(() => petCarePlansTable.id),
  
  // Reminder Info
  activityType: varchar('activityType', { length: 50 }).notNull(),
  title: varchar('title', { length: 200 }),
  description: text('description'),
  
  // Schedule
  scheduledTime: timestamp('scheduledTime', { withTimezone: true }).notNull(),
  frequency: varchar('frequency', { length: 20 }), // 'once', 'daily', 'weekly', 'monthly'
  nextOccurrence: timestamp('nextOccurrence', { withTimezone: true }),
  
  // Status
  sent: boolean('sent').default(false),
  sentAt: timestamp('sentAt', { withTimezone: true }),
  completed: boolean('completed').default(false),
  completedAt: timestamp('completedAt', { withTimezone: true }),
  
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow()
}, table => [
  index('idx_reminders_userId').on(table.userId),
  index('idx_reminders_petId').on(table.petId),
  index('idx_reminders_scheduledTime').on(table.scheduledTime),
  index('idx_reminders_nextOccurrence').on(table.nextOccurrence)
]);

/**
 * AUDIT LOGS TABLE
 * Track all changes for compliance + debugging
 */
export const auditLogsTable = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('userId').references(() => usersTable.id, { onDelete: 'set null' }),
  entityType: varchar('entityType', { length: 50 }).notNull(), // 'pet', 'care_plan', 'activity'
  entityId: uuid('entityId').notNull(),
  action: varchar('action', { length: 50 }).notNull(), // 'create', 'update', 'delete'
  changes: jsonb('changes'),
  ipAddress: varchar('ipAddress', { length: 45 }),
  userAgent: text('userAgent'),
  
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow()
}, table => [
  index('idx_audit_logs_userId').on(table.userId),
  index('idx_audit_logs_entityType').on(table.entityType),
  index('idx_audit_logs_createdAt').on(table.createdAt)
]);

// Export all tables for use in drizzle queries
export const allTables = {
  usersTable,
  deviceTokensTable,
  petsTable,
  aiCareSessionsTable,
  petCarePlansTable,
  petActivityLogsTable,
  aiChatSessionsTable,
  aiChatMessagesTable,
  foodRecommendationsTable,
  tokenUsageTable,
  aiModelsConfigTable,
  remindersTable,
  auditLogsTable
};
