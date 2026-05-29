-- Notification logs table for admin + automated push history

CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(40) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  data_json TEXT,
  target_mode VARCHAR(20) NOT NULL,
  target_user_ids TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_type ON notification_logs(type);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(status);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON notification_logs(created_at);

DROP TRIGGER IF EXISTS trg_notification_logs_set_updated_at ON notification_logs;
CREATE TRIGGER trg_notification_logs_set_updated_at
BEFORE UPDATE ON notification_logs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
