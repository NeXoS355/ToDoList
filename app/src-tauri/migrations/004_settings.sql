-- Simple key-value store for app settings (e.g. the quick-add global shortcut).
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
