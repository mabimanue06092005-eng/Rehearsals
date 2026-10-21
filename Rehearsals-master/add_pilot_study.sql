CREATE TABLE IF NOT EXISTS pilot_responses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phase TEXT NOT NULL, -- 'pre' | 'post'
  answers TEXT NOT NULL, -- JSON: {q1..q6: 1-5, openText: string}
  consent_given INTEGER NOT NULL DEFAULT 0,
  submitted_at INTEGER NOT NULL,
  UNIQUE(user_id, phase)
);
CREATE INDEX IF NOT EXISTS idx_pilot_responses_user ON pilot_responses(user_id, phase);
