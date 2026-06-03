import Database from '@tauri-apps/plugin-sql';
import type { Issue, Comment, Label, Attachment } from './types';

let db: Awaited<ReturnType<typeof Database.load>> | null = null;

async function getDb() {
  if (!db) db = await Database.load('sqlite:todolist.db');
  return db;
}

function uuid(): string {
  return crypto.randomUUID();
}

export async function getIssues(): Promise<Issue[]> {
  const db = await getDb();
  const issues = await db.select<Issue[]>(`
    SELECT i.*,
      (SELECT COUNT(*) FROM comments c WHERE c.issue_id = i.id) as comment_count
    FROM issues i
    ORDER BY
      CASE i.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      i.updated_at DESC
  `);
  for (const issue of issues) {
    issue.labels = await getIssueLabels(issue.id);
  }
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
}): Promise<Issue> {
  const db = await getDb();
  const id = uuid();
  const now = Date.now();
  await db.execute(
    'INSERT INTO issues (id, title, body, priority, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, data.title, data.body, data.priority, 'open', now, now]
  );
  if (data.labelIds?.length) {
    for (const lid of data.labelIds) {
      await db.execute('INSERT OR IGNORE INTO issue_labels (issue_id, label_id) VALUES (?, ?)', [id, lid]);
    }
  }
  return (await getIssue(id))!;
}

export async function updateIssue(id: string, data: Partial<Pick<Issue, 'title' | 'body' | 'priority' | 'status'>>): Promise<void> {
  const db = await getDb();
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(data), Date.now(), id];
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
// File bytes are stored base64-encoded as TEXT in the (BLOB-declared) `data`
// column — SQLite is dynamically typed, so this avoids binary-binding issues.

export async function addAttachment(opts: {
  issueId?: string | null;
  commentId?: string | null;
  filename: string;
  mimeType: string | null;
  base64: string;
  size: number;
}): Promise<void> {
  const db = await getDb();
  await db.execute(
    'INSERT INTO attachments (id, issue_id, comment_id, filename, mime_type, data, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [uuid(), opts.issueId ?? null, opts.commentId ?? null, opts.filename, opts.mimeType, opts.base64, opts.size, Date.now()]
  );
}

/** Metadata only (no `data` blob) — cheap to load for listing. */
export async function getAttachments(issueId: string): Promise<Attachment[]> {
  const db = await getDb();
  return db.select<Attachment[]>(
    'SELECT id, issue_id, comment_id, filename, mime_type, size_bytes, created_at FROM attachments WHERE issue_id = ? ORDER BY created_at ASC',
    [issueId]
  );
}

export async function getAttachmentData(id: string): Promise<Pick<Attachment, 'data' | 'mime_type' | 'filename'> | null> {
  const db = await getDb();
  const rows = await db.select<Pick<Attachment, 'data' | 'mime_type' | 'filename'>[]>(
    'SELECT data, mime_type, filename FROM attachments WHERE id = ?',
    [id]
  );
  return rows[0] ?? null;
}

export async function deleteAttachment(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM attachments WHERE id = ?', [id]);
}

export async function getLabels(): Promise<Label[]> {
  const db = await getDb();
  return db.select<Label[]>('SELECT * FROM labels ORDER BY name');
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
