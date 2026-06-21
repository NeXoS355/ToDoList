export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type Status = 'open' | 'in_progress' | 'done' | 'cancelled';
export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';
export interface Recurrence { freq: RecurrenceFreq; interval: number; }

export interface Issue {
  id: string;
  title: string;
  body: string;
  priority: Priority;
  status: Status;
  created_at: number;
  updated_at: number;
  source: string | null;       // 'email' | 'outlook' | 'teams' | null (manual)
  source_meta: string | null;  // JSON: { fromName, fromEmail, to, date, subject }
  due_date: number | null;     // local midnight of the due day (ms)
  recurrence: string | null;   // JSON Recurrence (e.g. {"freq":"weekly","interval":1}) or null
  labels?: Label[];
  comment_count?: number;
}

export interface Comment {
  id: string;
  issue_id: string;
  body: string;
  created_at: number;
}

export interface Attachment {
  id: string;
  issue_id: string | null;
  comment_id: string | null;
  filename: string;
  mime_type: string | null;
  rel_path: string | null; // path under appDataDir/attachments
  size_bytes: number | null;
  checksum: string | null; // sha-256 hex of the bytes (null on pre-existing rows)
  created_at: number;
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string }> = {
  low:      { label: 'Low',      color: 'text-slate-400',  bg: 'bg-slate-400/10' },
  medium:   { label: 'Medium',   color: 'text-blue-400',   bg: 'bg-blue-400/10' },
  high:     { label: 'High',     color: 'text-orange-400', bg: 'bg-orange-400/10' },
  critical: { label: 'Critical', color: 'text-red-400',    bg: 'bg-red-400/10' },
};

/** Local midnight today (ms) — the boundary below which a due date is overdue. */
export function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Overdue = due day fully in the past and the issue still active. */
export function isOverdue(issue: Pick<Issue, 'due_date' | 'status'>): boolean {
  return issue.due_date != null
    && issue.due_date < startOfToday()
    && issue.status !== 'done'
    && issue.status !== 'cancelled';
}

/** Issue.due_date (local midnight ms) ↔ <input type="date"> value. */
export function dueDateToInputValue(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function inputValueToDueDate(value: string): number | null {
  return value ? new Date(`${value}T00:00:00`).getTime() : null;
}

/** Local-midnight timestamp n days from the given day. */
export function addDays(ts: number, n: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/** One-click due-date presets relative to today (all at local midnight). */
export function dueDatePresets(): { label: string; ts: number }[] {
  const today = startOfToday();
  const dow = new Date(today).getDay();        // 0=Sun .. 6=Sat
  const toSaturday = (6 - dow + 7) % 7 || 7;   // upcoming Saturday, never today
  return [
    { label: 'Today', ts: today },
    { label: 'Tomorrow', ts: addDays(today, 1) },
    { label: 'Weekend', ts: addDays(today, toSaturday) },
    { label: 'Next week', ts: addDays(today, 7) },
  ];
}

const RECURRENCE_FREQS: RecurrenceFreq[] = ['daily', 'weekly', 'monthly', 'yearly'];
const RECURRENCE_LABELS: Record<RecurrenceFreq, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly',
};

/** Parse the stored recurrence JSON, tolerating malformed/legacy values. */
export function parseRecurrence(raw: string | null | undefined): Recurrence | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw);
    if (r && RECURRENCE_FREQS.includes(r.freq)) {
      return { freq: r.freq, interval: Math.max(1, Math.floor(Number(r.interval)) || 1) };
    }
  } catch { /* fall through */ }
  return null;
}

/** Build the stored JSON for a frequency ('none' clears recurrence). */
export function makeRecurrence(freq: RecurrenceFreq | 'none', interval = 1): string | null {
  return freq === 'none' ? null : JSON.stringify({ freq, interval: Math.max(1, interval) });
}

/** Current frequency of a stored value, or 'none'. */
export function recurrenceFreq(raw: string | null | undefined): RecurrenceFreq | 'none' {
  return parseRecurrence(raw)?.freq ?? 'none';
}

/** Short human label for a stored recurrence, or null if none. */
export function recurrenceLabel(raw: string | null | undefined): string | null {
  const r = parseRecurrence(raw);
  if (!r) return null;
  return r.interval > 1 ? `${RECURRENCE_LABELS[r.freq]} ×${r.interval}` : RECURRENCE_LABELS[r.freq];
}

/** Shift a date by whole months, clamping day overflow (Jan 31 +1mo → Feb 28). */
function addMonthsClamped(ts: number, months: number): number {
  const d = new Date(ts);
  const day = d.getDate();
  d.setDate(1);                                 // avoid rollover while moving month
  d.setMonth(d.getMonth() + months);
  const lastOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastOfMonth));
  return d.getTime();
}

/** Next due date for a fixed (due-anchored) recurrence. */
export function nextDueDate(from: number, rec: Recurrence): number {
  const n = rec.interval;
  switch (rec.freq) {
    case 'daily':   return addDays(from, n);
    case 'weekly':  return addDays(from, 7 * n);
    case 'monthly': return addMonthsClamped(from, n);
    case 'yearly':  return addMonthsClamped(from, 12 * n);
  }
}

export const RECURRENCE_OPTIONS: { value: RecurrenceFreq | 'none'; label: string }[] = [
  { value: 'none', label: 'No repeat' },
  ...RECURRENCE_FREQS.map(f => ({ value: f, label: RECURRENCE_LABELS[f] })),
];

/** Clipboard images arrive as generic "image.png" — give them a unique name. */
function namePastedImage(file: File, index: number): File {
  const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
  return new File([file], `pasted-${stamp}${index > 0 ? `-${index + 1}` : ''}.${ext}`, { type: file.type });
}

/** All images in a clipboard/drop payload, renamed uniquely (empty if none). */
export function clipboardImages(data: DataTransfer): File[] {
  return Array.from(data.files).filter(f => f.type.startsWith('image/')).map(namePastedImage);
}

// Dropped file paths come without a browser-supplied MIME type; map common
// extensions so image previews and "open with" behave. Unknown → empty.
const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv',
  zip: 'application/zip',
};

export function guessMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? '';
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export const STATUS_CONFIG: Record<Status, { label: string; color: string }> = {
  open:        { label: 'Open',        color: 'text-green-400' },
  in_progress: { label: 'In Progress', color: 'text-blue-400' },
  done:        { label: 'Done',        color: 'text-slate-400' },
  cancelled:   { label: 'Cancelled',   color: 'text-red-400' },
};
