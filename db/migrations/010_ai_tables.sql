-- AI Tables Migration
-- Run: docker exec -i careleo-postgres psql -U careleo -d careleo < db/migrations/010_ai_tables.sql

-- 1. Add AI analysis column to pets
ALTER TABLE pets ADD COLUMN IF NOT EXISTS ai_analysis_json TEXT;

-- 2. AI Chat Sessions
CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,
  title VARCHAR(200),
  context_snapshot_json TEXT,
  is_admin_session BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_user ON ai_chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_pet  ON ai_chat_sessions(pet_id);

-- 3. AI Chat Messages
CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  content TEXT,
  tool_calls_json TEXT,
  tool_results_json TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  is_proactive BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_messages_session ON ai_chat_messages(session_id);

-- 4. AI Token Usage
CREATE TABLE IF NOT EXISTS ai_token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,
  session_id UUID REFERENCES ai_chat_sessions(id) ON DELETE SET NULL,
  model_name VARCHAR(80) NOT NULL,
  feature VARCHAR(80) NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10,6) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_token_usage_user  ON ai_token_usage(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_date  ON ai_token_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_model ON ai_token_usage(model_name, created_at);

-- 5. Pet Care Plans
CREATE TABLE IF NOT EXISTS pet_care_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  version INTEGER DEFAULT 1,
  plan_json TEXT NOT NULL,
  generated_by VARCHAR(80) DEFAULT 'gemini-1.5-pro',
  is_active BOOLEAN DEFAULT true,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  valid_until TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_care_plans_pet    ON pet_care_plans(pet_id);
CREATE INDEX IF NOT EXISTS idx_care_plans_active ON pet_care_plans(is_active, pet_id);

-- 6. AI Proactive Messages
CREATE TABLE IF NOT EXISTS ai_proactive_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,
  task_id UUID,
  message_type VARCHAR(50) NOT NULL,
  push_sent_at TIMESTAMP WITH TIME ZONE,
  chat_sent_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  action_taken_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_proactive_user ON ai_proactive_messages(user_id, created_at);

-- 7. Admin AI Instructions
CREATE TABLE IF NOT EXISTS admin_ai_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type VARCHAR(20) NOT NULL,
  target_id UUID,
  instruction TEXT NOT NULL,
  reason TEXT,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by UUID NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_instructions_target ON admin_ai_instructions(target_type, target_id, is_active);

-- 8. AI Model Configs
CREATE TABLE IF NOT EXISTS ai_model_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  model_name VARCHAR(100) NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  purpose VARCHAR(50) NOT NULL,
  is_active BOOLEAN DEFAULT false,
  max_tokens_per_day INTEGER,
  tokens_used_today INTEGER DEFAULT 0,
  cost_per_1k_input NUMERIC(8,4),
  cost_per_1k_output NUMERIC(8,4),
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Done
SELECT 'AI tables migration complete' AS status;
