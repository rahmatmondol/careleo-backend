-- Tasks and reminders tables for app task management flows

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  task_type VARCHAR(60) NOT NULL DEFAULT 'OTHER',
  due_date TIMESTAMPTZ NOT NULL,
  notes TEXT,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_pet_id ON tasks(pet_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(is_completed);

CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  reminder_type VARCHAR(60) NOT NULL DEFAULT 'activity',
  frequency VARCHAR(40) NOT NULL DEFAULT 'Everyday',
  reminder_date VARCHAR(30),
  reminder_time VARCHAR(20),
  notes TEXT,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_pet_id ON reminders(pet_id);
CREATE INDEX IF NOT EXISTS idx_reminders_active ON reminders(is_active);
