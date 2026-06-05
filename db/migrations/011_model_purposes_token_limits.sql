-- Migration 011: Multi-purpose model config + user token limits
-- Purpose values:
--   general_chat     → normal user AI chat
--   vision           → pet image/symptom/report analysis
--   store_assistant  → e-commerce store AI assistant
--   admin_assistant  → admin panel AI assistant
--   care_plan        → care plan generation
--   onboarding       → pet onboarding questions

-- 1. Add new columns to ai_model_configs
ALTER TABLE ai_model_configs
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS max_tokens_per_user_day INTEGER,
  ADD COLUMN IF NOT EXISTS token_reset_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Update existing purpose column to support new values (already TEXT/VARCHAR)
-- Just ensure index exists for fast lookup
CREATE INDEX IF NOT EXISTS idx_model_configs_purpose_active
  ON ai_model_configs (purpose, is_active);

-- 3. User token limits table — admin sets per-user daily/monthly limits
CREATE TABLE IF NOT EXISTS user_ai_token_limits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  daily_limit   INTEGER,          -- max tokens per day (NULL = no limit)
  monthly_limit INTEGER,          -- max tokens per month (NULL = no limit)
  is_blocked    BOOLEAN DEFAULT FALSE,  -- hard block
  block_reason  TEXT,
  tokens_today  INTEGER DEFAULT 0,
  tokens_month  INTEGER DEFAULT 0,
  reset_day_at  TIMESTAMPTZ DEFAULT NOW(),
  reset_month_at TIMESTAMPTZ DEFAULT NOW(),
  created_by    UUID,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_token_limits_user
  ON user_ai_token_limits (user_id);

-- 4. Model usage stats per day (for admin dashboard chart)
CREATE TABLE IF NOT EXISTS ai_model_daily_stats (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_config_id UUID NOT NULL REFERENCES ai_model_configs(id) ON DELETE CASCADE,
  stat_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  total_calls   INTEGER DEFAULT 0,
  total_tokens  INTEGER DEFAULT 0,
  total_cost_usd NUMERIC(10, 6) DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (model_config_id, stat_date)
);

CREATE INDEX IF NOT EXISTS idx_model_daily_stats_date
  ON ai_model_daily_stats (stat_date, model_config_id);
