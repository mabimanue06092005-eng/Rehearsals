CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  growth_notes TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);

CREATE TABLE IF NOT EXISTS rehearsals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  persona_name TEXT,
  persona_role TEXT,
  setup_data TEXT NOT NULL,
  transcript TEXT NOT NULL,
  debrief TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rehearsals_user_created ON rehearsals(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS saved_personas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  mode TEXT NOT NULL,
  who TEXT,
  participants TEXT,
  hard TEXT NOT NULL,
  goal TEXT NOT NULL,
  voice_uri TEXT,
  voice_pitch REAL,
  voice_rate REAL,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_saved_personas_user ON saved_personas(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_goals (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  weekly_target INTEGER NOT NULL DEFAULT 3,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  remind_at INTEGER NOT NULL,
  persona_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reminders_user_remindat ON reminders(user_id, remind_at);
