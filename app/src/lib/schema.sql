-- Full database schema, run once on first connection (all statements are
-- idempotent: CREATE TABLE IF NOT EXISTS / INSERT OR IGNORE). No migrations —
-- edit this file directly and re-init.

CREATE TABLE IF NOT EXISTS issues (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT DEFAULT '',
  priority    TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
  status      TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','done','cancelled')),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  source      TEXT,
  source_meta TEXT,
  due_date    INTEGER
);

CREATE TABLE IF NOT EXISTS comments (
  id          TEXT PRIMARY KEY,
  issue_id    TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
  id          TEXT PRIMARY KEY,
  issue_id    TEXT REFERENCES issues(id) ON DELETE CASCADE,
  comment_id  TEXT REFERENCES comments(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  mime_type   TEXT,
  rel_path    TEXT,
  size_bytes  INTEGER,
  checksum    TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS labels (
  id    TEXT PRIMARY KEY,
  name  TEXT UNIQUE NOT NULL,
  color TEXT NOT NULL DEFAULT '#6b7280'
);

CREATE TABLE IF NOT EXISTS issue_labels (
  issue_id  TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  label_id  TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (issue_id, label_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO labels (id, name, color) VALUES
  ('bug', 'bug', '#ef4444'),
  ('feature', 'feature', '#8b5cf6'),
  ('question', 'question', '#3b82f6'),
  ('docs', 'docs', '#10b981');
