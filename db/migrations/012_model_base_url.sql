-- Migration 012: Add base_url column for custom/compatible providers
-- Supports: deepseek, openai-compatible, anthropic-compatible endpoints

ALTER TABLE ai_model_configs
  ADD COLUMN IF NOT EXISTS base_url VARCHAR(500);

-- Example rows (commented — insert via admin panel):
-- DeepSeek:        provider='deepseek',   base_url='https://api.deepseek.com/v1'
-- Custom Claude:   provider='anthropic',  base_url='https://my-proxy.example.com'
-- Ollama local:    provider='openai',     base_url='http://localhost:11434/v1'
