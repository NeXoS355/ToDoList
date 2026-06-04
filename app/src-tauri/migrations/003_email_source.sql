-- Provenance for tasks created from a pasted email (or future integrations).
-- source: 'email' | 'outlook' | 'teams' | NULL (manual)
-- source_meta: JSON { fromName, fromEmail, to, date, subject }
ALTER TABLE issues ADD COLUMN source TEXT;
ALTER TABLE issues ADD COLUMN source_meta TEXT;
