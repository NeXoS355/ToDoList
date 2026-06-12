import Database from '@tauri-apps/plugin-sql';
import { appDataDir, join } from '@tauri-apps/api/path';
import schema from './schema.sql?raw';
import type { Issue, Comment, Label, Attachment } from './types';

let db: Awaited<ReturnType<typeof Database.load>> | null = null;

async function getDb() {
  if (!db) {
    // Absolute path in app_data_dir (next to attachments/).
    const path = await join(await appDataDir(), 'todolist.db');
    const conn = await Database.load(`sqlite:${path}`);
    // Initialize the schema directly — no migrations. Idempotent, so running
    // it on every startup is safe.
    for (const stmt of schema.split(';')) {
      const s = stmt.trim();
      if (s) await conn.execute(s);
    }
    // CREATE TABLE IF NOT EXISTS won't add columns to pre-existing DBs, so new
    // columns also get an ALTER here; "duplicate column" errors are expected.
    await conn.execute('ALTER TABLE issues ADD COLUMN due_date INTEGER').catch(() => {});
    await conn.execute('ALTER TABLE attachments ADD COLUMN checksum TEXT').catch(() => {});
    db = conn;
  }
  return db;
}

function uuid(): string {
  return crypto.randomUUID();
}

export async function getIssues(): Promise<Issue[]> {
  const db = await getDb();
  // Rough pre-sort only — the store re-sorts via sortIssues() after loading
  // (it additionally ranks overdue/due dates, which needs the local timezone).
  const issues = await db.select<Issue[]>(`
    SELECT i.*,
      (SELECT COUNT(*) FROM comments c WHERE c.issue_id = i.id) as comment_count
    FROM issues i
    ORDER BY
      CASE i.status WHEN 'in_progress' THEN 0 WHEN 'open' THEN 1 WHEN 'done' THEN 2 WHEN 'cancelled' THEN 3 ELSE 4 END,
      CASE i.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
      i.created_at DESC
  `);
  if (issues.length === 0) return issues;

  // Pull every issue↔label pair in one query and group in memory, instead of
  // a per-issue query (N+1). One round-trip regardless of list size.
  const rows = await db.select<(Label & { issue_id: string })[]>(`
    SELECT il.issue_id, l.id, l.name, l.color
    FROM issue_labels il
    JOIN labels l ON l.id = il.label_id
  `);
  const byIssue = new Map<string, Label[]>();
  for (const { issue_id, ...label } of rows) {
    const arr = byIssue.get(issue_id);
    if (arr) arr.push(label);
    else byIssue.set(issue_id, [label]);
  }
  for (const issue of issues) issue.labels = byIssue.get(issue.id) ?? [];
  return issues;
}

export async function getIssue(id: string): Promise<Issue | null> {
  const db = await getDb();
  const rows = await db.select<Issue[]>('SELECT * FROM issues WHERE id = ?', [id]);
  if (!rows[0]) return null;
  const issue = rows[0];
  issue.labels = await getIssueLabels(id);
  return issue;
}

export async function createIssue(data: {
  title: string;
  body: string;
  priority: Issue['priority'];
  labelIds?: string[];
  source?: string | null;
  sourceMeta?: Record<string, unknown> | null;
  dueDate?: number | null;
}): Promise<Issue> {
  const db = await getDb();
  const id = uuid();
  const now = Date.now();
  const sourceMeta = data.sourceMeta ? JSON.stringify(data.sourceMeta) : null;
  await db.execute(
    'INSERT INTO issues (id, title, body, priority, status, created_at, updated_at, source, source_meta, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, data.title, data.body, data.priority, 'open', now, now, data.source ?? null, sourceMeta, data.dueDate ?? null]
  );
  if (data.labelIds?.length) {
    for (const lid of data.labelIds) {
      await db.execute('INSERT OR IGNORE INTO issue_labels (issue_id, label_id) VALUES (?, ?)', [id, lid]);
    }
  }
  return (await getIssue(id))!;
}

const UPDATABLE_COLUMNS = ['title', 'body', 'priority', 'status', 'due_date'] as const;

export async function updateIssue(id: string, data: Partial<Pick<Issue, 'title' | 'body' | 'priority' | 'status' | 'due_date'>>): Promise<void> {
  const db = await getDb();
  // Whitelist column names so they can never become an injection vector, even
  // if a caller passes unexpected keys (values stay parameterized regardless).
  const keys = UPDATABLE_COLUMNS.filter(k => k in data);
  if (keys.length === 0) return;
  const fields = keys.map(k => `${k} = ?`).join(', ');
  const values = [...keys.map(k => data[k]), Date.now(), id];
  await db.execute(`UPDATE issues SET ${fields}, updated_at = ? WHERE id = ?`, values);
}

export async function deleteIssue(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM issues WHERE id = ?', [id]);
}

export async function getComments(issueId: string): Promise<Comment[]> {
  const db = await getDb();
  return db.select<Comment[]>('SELECT * FROM comments WHERE issue_id = ? ORDER BY created_at ASC', [issueId]);
}

export async function addComment(issueId: string, body: string): Promise<Comment> {
  const db = await getDb();
  const id = uuid();
  const now = Date.now();
  await db.execute('INSERT INTO comments (id, issue_id, body, created_at) VALUES (?, ?, ?, ?)', [id, issueId, body, now]);
  await db.execute('UPDATE issues SET updated_at = ? WHERE id = ?', [now, issueId]);
  const rows = await db.select<Comment[]>('SELECT * FROM comments WHERE id = ?', [id]);
  return rows[0];
}

export async function deleteComment(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM comments WHERE id = ?', [id]);
}

// --- Attachments -----------------------------------------------------------
// Bytes live on disk under appDataDir/attachments/<rel_path>; the DB holds only
// the path + metadata.

export async function addAttachment(opts: {
  id: string;
  issueId?: string | null;
  commentId?: string | null;
  filename: string;
  mimeType: string | null;
  relPath: string;
  size: number;
  checksum?: string | null;
}): Promise<void> {
  const db = await getDb();
  await db.execute(
    'INSERT INTO attachments (id, issue_id, comment_id, filename, mime_type, rel_path, size_bytes, checksum, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [opts.id, opts.issueId ?? null, opts.commentId ?? null, opts.filename, opts.mimeType, opts.relPath, opts.size, opts.checksum ?? null, Date.now()]
  );
}

/** Filename of an attachment on this issue with identical bytes, or null.
 *  Covers issue-level and comment attachments alike (same issue_id). */
export async function findAttachmentByChecksum(issueId: string, checksum: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ filename: string }[]>(
    'SELECT filename FROM attachments WHERE issue_id = ? AND checksum = ? LIMIT 1',
    [issueId, checksum]
  );
  return rows[0]?.filename ?? null;
}

/** Metadata only (no bytes) — cheap to load for listing. */
export async function getAttachments(issueId: string): Promise<Attachment[]> {
  const db = await getDb();
  return db.select<Attachment[]>(
    'SELECT id, issue_id, comment_id, filename, mime_type, rel_path, size_bytes, created_at FROM attachments WHERE issue_id = ? ORDER BY created_at ASC',
    [issueId]
  );
}

/** Path + metadata for one attachment. */
export async function getAttachmentData(id: string): Promise<Pick<Attachment, 'rel_path' | 'mime_type' | 'filename'> | null> {
  const db = await getDb();
  const rows = await db.select<Pick<Attachment, 'rel_path' | 'mime_type' | 'filename'>[]>(
    'SELECT rel_path, mime_type, filename FROM attachments WHERE id = ?',
    [id]
  );
  return rows[0] ?? null;
}

export async function deleteAttachment(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM attachments WHERE id = ?', [id]);
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>('SELECT value FROM settings WHERE key = ?', [key]);
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
}

export async function getLabels(): Promise<Label[]> {
  const db = await getDb();
  return db.select<Label[]>('SELECT * FROM labels ORDER BY name');
}

export async function createLabel(name: string, color: string): Promise<Label> {
  const db = await getDb();
  const id = uuid();
  // `name` is UNIQUE in the schema — a duplicate throws, surfaced as a toast.
  await db.execute('INSERT INTO labels (id, name, color) VALUES (?, ?, ?)', [id, name, color]);
  return { id, name, color };
}

async function getIssueLabels(issueId: string): Promise<Label[]> {
  const db = await getDb();
  return db.select<Label[]>(`
    SELECT l.* FROM labels l
    JOIN issue_labels il ON il.label_id = l.id
    WHERE il.issue_id = ?
  `, [issueId]);
}

export async function setIssueLabels(issueId: string, labelIds: string[]): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM issue_labels WHERE issue_id = ?', [issueId]);
  for (const lid of labelIds) {
    await db.execute('INSERT INTO issue_labels (issue_id, label_id) VALUES (?, ?)', [issueId, lid]);
  }
}
