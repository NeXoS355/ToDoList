export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type Status = 'open' | 'in_progress' | 'done' | 'cancelled';

export interface Issue {
  id: string;
  title: string;
  body: string;
  priority: Priority;
  status: Status;
  created_at: number;
  updated_at: number;
  sort_order: number;
  source: string | null;       // 'email' | 'outlook' | 'teams' | null (manual)
  source_meta: string | null;  // JSON: { fromName, fromEmail, to, date, subject }
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
  data: string | null; // base64-encoded file bytes
  size_bytes: number | null;
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
