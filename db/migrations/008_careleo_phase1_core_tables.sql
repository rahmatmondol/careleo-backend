-- Phase 1: Careleo AI Petcare System - Core Tables
-- Date: May 28, 2026

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 1. Users Table (with Firebase UID)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firebaseUid VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  isEmailVerified BOOLEAN DEFAULT true,
  name VARCHAR(100),
  avatar VARCHAR(500),
  locale VARCHAR(10) DEFAULT 'en',
  timezone VARCHAR(50),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_firebaseUid ON users(firebaseUid);
CREATE INDEX idx_users_email ON users(email);

-- 2. Device Tokens (for FCM push notifications)
CREATE TABLE device_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userId UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fcmToken VARCHAR(500) NOT NULL UNIQUE,
  deviceType VARCHAR(20) NOT NULL, -- 'ios', 'android'
  isActive BOOLEAN DEFAULT true,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_device_tokens_userId ON device_tokens(userId);
CREATE INDEX idx_device_tokens_isActive ON device_tokens(isActive);

-- 3. Pets Table (Core pet profile)
CREATE TABLE pets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userId UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  
  -- Image Data
  imageUrl VARCHAR(500),
  imageHash VARCHAR(100),
  imageAnalyzedAt TIMESTAMP,
  
  -- AI-Extracted Metadata (JSONB)
  metadata JSONB DEFAULT '{}', -- {breed, color, age, confidence, ...}
  
  -- Basic Info
  dateOfBirth DATE,
  weight DECIMAL(5,2), -- kg
  gender VARCHAR(10), -- 'male', 'female'
  
  -- Health Profile (Arrays)
  allergies TEXT[] DEFAULT '{}',
  medicalConditions TEXT[] DEFAULT '{}',
  medications JSONB DEFAULT '{}',
  vaccinations JSONB DEFAULT '{}',
  
  -- Lifestyle
  activityLevel VARCHAR(20), -- 'sedentary', 'moderate', 'active'
  dietaryPreferences JSONB DEFAULT '{}',
  
  -- Tracking
  careHistoryCount INT DEFAULT 0,
  lastCarePlanUpdate TIMESTAMP,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pets_userId ON pets(userId);
CREATE INDEX idx_pets_createdAt ON pets(createdAt DESC);
CREATE INDEX idx_pets_breed ON pets((metadata->>'breed'));

-- 4. AI Care Sessions (For onboarding Q&A)
CREATE TABLE ai_care_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  petId UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  userId UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Session Info
  phase VARCHAR(50) DEFAULT 'image_analysis', -- image_analysis, qa_collection, care_plan_generation, complete
  startedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completedAt TIMESTAMP,
  
  -- Collected Data
  imageAnalysisResult JSONB,
  qaResponses JSONB DEFAULT '{}',
  aiModel VARCHAR(50),
  totalTokensUsed INT DEFAULT 0,
  
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_care_sessions_petId ON ai_care_sessions(petId);
CREATE INDEX idx_ai_care_sessions_phase ON ai_care_sessions(phase);

-- 5. Pet Care Plans (Daily schedule)
CREATE TABLE pet_care_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  petId UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  
  -- Daily Schedule
  foodPlan JSONB NOT NULL, -- {meals: [...], totalDailyCalories, macros}
  activityPlan JSONB NOT NULL, -- {activities: [...], weeklyExerciseMinutes}
  medicinePlan JSONB NOT NULL, -- {medicines: [...]}
  healthCheckups JSONB, -- {vet: {...}, dental: {...}}
  
  -- Metadata
  aiModel VARCHAR(50),
  generatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  validFrom TIMESTAMP,
  validUntil TIMESTAMP,
  version INT DEFAULT 1,
  
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pet_care_plans_petId ON pet_care_plans(petId);
CREATE INDEX idx_pet_care_plans_validUntil ON pet_care_plans(validUntil);

-- 6. Pet Activity Logs (Completed tasks)
CREATE TABLE pet_activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  petId UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  carePlanId UUID REFERENCES pet_care_plans(id),
  
  -- Activity Info
  activityType VARCHAR(50) NOT NULL, -- 'feeding', 'medicine', 'walk', 'play', 'vet_visit'
  scheduledTime TIMESTAMP,
  completedTime TIMESTAMP,
  
  -- Details
  details JSONB, -- {food, amount, notes, userFeedback}
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'completed', 'skipped', 'rescheduled'
  userNotes TEXT,
  
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pet_activity_logs_petId ON pet_activity_logs(petId);
CREATE INDEX idx_pet_activity_logs_completedTime ON pet_activity_logs(completedTime DESC);
CREATE INDEX idx_pet_activity_logs_status ON pet_activity_logs(status);

-- 7. AI Chat Sessions (General pet chat)
CREATE TABLE ai_chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userId UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  petId UUID REFERENCES pets(id) ON DELETE SET NULL,
  
  -- Session Info
  topic VARCHAR(50), -- 'pet_health', 'behavior', 'nutrition', 'general'
  title VARCHAR(200),
  
  -- Usage
  totalTokensUsed INT DEFAULT 0,
  aiModel VARCHAR(50),
  
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  archivedAt TIMESTAMP
);

CREATE INDEX idx_ai_chat_sessions_userId ON ai_chat_sessions(userId);
CREATE INDEX idx_ai_chat_sessions_petId ON ai_chat_sessions(petId);
CREATE INDEX idx_ai_chat_sessions_createdAt ON ai_chat_sessions(createdAt DESC);

-- 8. AI Chat Messages (With embeddings)
CREATE TABLE ai_chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sessionId UUID NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  
  -- Content
  role VARCHAR(20) NOT NULL, -- 'user', 'assistant'
  content TEXT NOT NULL,
  
  -- Embeddings (pgvector)
  contentEmbedding VECTOR(1536),
  
  -- Metadata
  tokensUsed INT,
  modelUsed VARCHAR(50),
  metadata JSONB,
  
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_chat_messages_sessionId ON ai_chat_messages(sessionId);
CREATE INDEX idx_ai_chat_messages_createdAt ON ai_chat_messages(createdAt);

-- 9. Food Recommendations
CREATE TABLE food_recommendations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  petId UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  foodId UUID NOT NULL, -- woo_products.id
  
  -- Recommendation Info
  reason VARCHAR(200),
  matchScore DECIMAL(3,2), -- 0.00 to 1.00
  
  -- Engagement
  viewedAt TIMESTAMP,
  addedToCartAt TIMESTAMP,
  purchasedAt TIMESTAMP,
  rating INT, -- 1-5 stars
  
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_food_recommendations_petId ON food_recommendations(petId);
CREATE INDEX idx_food_recommendations_matchScore ON food_recommendations(matchScore DESC);

-- 10. Token Usage Tracking (For admin analytics)
CREATE TABLE token_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userId UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sessionId UUID, -- ai_care_sessions or ai_chat_sessions
  
  -- Model Info
  aiModel VARCHAR(50) NOT NULL,
  modelProvider VARCHAR(50), -- 'openai', 'anthropic', 'google'
  
  -- Usage
  inputTokens INT,
  outputTokens INT,
  totalTokens INT GENERATED ALWAYS AS (inputTokens + outputTokens) STORED,
  costUSD DECIMAL(8,4),
  
  -- Request Info
  requestType VARCHAR(50), -- 'image_analysis', 'qa', 'care_plan', 'chat'
  
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_token_usage_userId ON token_usage(userId);
CREATE INDEX idx_token_usage_createdAt ON token_usage(createdAt DESC);
CREATE INDEX idx_token_usage_aiModel ON token_usage(aiModel);

-- 11. AI Models Config (Admin configurable)
CREATE TABLE ai_models_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Model Identity
  modelName VARCHAR(50) NOT NULL UNIQUE,
  provider VARCHAR(50) NOT NULL, -- 'openai', 'anthropic', 'google'
  
  -- Configuration
  apiKey VARCHAR(500) NOT NULL, -- Should be encrypted in production
  isActive BOOLEAN DEFAULT true,
  priority INT DEFAULT 100, -- Lower = higher priority
  
  -- Capabilities
  supportsImageAnalysis BOOLEAN DEFAULT false,
  supportsChat BOOLEAN DEFAULT true,
  supportsStreaming BOOLEAN DEFAULT true,
  
  -- Limits
  maxTokensPerRequest INT DEFAULT 2000,
  temperature DECIMAL(3,2) DEFAULT 0.7,
  costPer1kInputTokens DECIMAL(6,4),
  costPer1kOutputTokens DECIMAL(6,4),
  
  -- Usage Limits
  dailyTokenQuota INT,
  currentDayTokenUsage INT DEFAULT 0,
  
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_models_config_provider ON ai_models_config(provider);
CREATE INDEX idx_ai_models_config_isActive ON ai_models_config(isActive);

-- 12. Reminders (For scheduled tasks)
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userId UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  petId UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  carePlanId UUID REFERENCES pet_care_plans(id),
  
  -- Reminder Info
  activityType VARCHAR(50) NOT NULL, -- 'feeding', 'medicine', 'walk'
  title VARCHAR(200),
  description TEXT,
  
  -- Schedule
  scheduledTime TIMESTAMP NOT NULL,
  frequency VARCHAR(20), -- 'once', 'daily', 'weekly', 'monthly'
  nextOccurrence TIMESTAMP,
  
  -- Status
  sent BOOLEAN DEFAULT false,
  sentAt TIMESTAMP,
  completed BOOLEAN DEFAULT false,
  completedAt TIMESTAMP,
  
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_reminders_userId ON reminders(userId);
CREATE INDEX idx_reminders_petId ON reminders(petId);
CREATE INDEX idx_reminders_scheduledTime ON reminders(scheduledTime);
CREATE INDEX idx_reminders_nextOccurrence ON reminders(nextOccurrence);

-- 13. Audit Logs (For tracking changes)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userId UUID REFERENCES users(id) ON DELETE SET NULL,
  entityType VARCHAR(50) NOT NULL, -- 'pet', 'care_plan', 'activity'
  entityId UUID NOT NULL,
  action VARCHAR(50) NOT NULL, -- 'create', 'update', 'delete'
  changes JSONB, -- what changed
  ipAddress VARCHAR(45),
  userAgent TEXT,
  
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_userId ON audit_logs(userId);
CREATE INDEX idx_audit_logs_entityType ON audit_logs(entityType);
CREATE INDEX idx_audit_logs_createdAt ON audit_logs(createdAt DESC);
