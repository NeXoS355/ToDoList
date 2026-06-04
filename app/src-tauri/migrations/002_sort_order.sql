-- Manual ordering for drag-reorder. Higher sort_order = higher in the list.
-- Seed existing rows from created_at so the initial order is stable & sensible.
ALTER TABLE issues ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE issues SET sort_order = created_at;
