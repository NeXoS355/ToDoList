import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { invoke } from '@tauri-apps/api/core';
import type { Issue, Comment, Label, Attachment, Priority, Status } from '../lib/types';
import { formatBytes } from '../lib/types';
import * as db from '../lib/db';

// Hard cap on attachment size — bytes go to disk, but an unbounded file would
// still spike memory during the base64 round-trip to the Rust writer.
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

// Keep the in-memory list in the same order as the SQL query (db.getIssues),
// so client-side patches re-sort without a reload: status → priority → newest.
const STATUS_RANK: Record<Status, number> = { in_progress: 0, open: 1, done: 2, cancelled: 3 };
const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function sortIssues(list: Issue[]): Issue[] {
  return [...list].sort((a, b) =>
    (STATUS_RANK[a.status] - STATUS_RANK[b.status]) ||
    (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) ||
    (b.created_at - a.created_at)
  );
}

// Colors handed to newly created labels, cycled by current label count.
const LABEL_PALETTE = ['#ef4444', '#f97316', '#eab308', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

/** Read a File into a bare base64 string (strips the `data:...;base64,` prefix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  });
}

interface IssueStore {
  issues: Issue[];
  selectedId: string | null;
  comments: Comment[];
  attachments: Attachment[];
  labels: Label[];
  loading: boolean;
  error: string | null;
  filter: { status: Status | 'all'; priority: Priority | 'all'; search: string };

  clearError: () => void;
  loadIssues: () => Promise<void>;
  loadLabels: () => Promise<void>;
  selectIssue: (id: string | null) => Promise<void>;
  createIssue: (data: { title: string; body: string; priority: Priority; labelIds?: string[]; source?: string | null; sourceMeta?: Record<string, unknown> | null }) => Promise<string | null>;
  updateIssue: (id: string, data: Partial<Pick<Issue, 'title' | 'body' | 'priority' | 'status'>>) => Promise<void>;
  deleteIssue: (id: string) => Promise<void>;
  setIssueLabels: (issueId: string, labelIds: string[]) => Promise<void>;
  createLabel: (name: string) => Promise<Label | null>;
  addComment: (issueId: string, body: string, files?: File[]) => Promise<void>;
  deleteComment: (id: string) => Promise<void>;
  addAttachment: (issueId: string, file: File, commentId?: string | null) => Promise<void>;
  deleteAttachment: (id: string) => Promise<void>;
  downloadAttachment: (id: string) => Promise<void>;
  openAttachment: (id: string) => Promise<void>;
  setFilter: (f: Partial<IssueStore['filter']>) => void;
}

export const useIssueStore = create<IssueStore>((set, get) => {
  // Surface any thrown DB/IO error as a toast instead of a silent unhandled
  // rejection. Returns nothing — callers that need a value get null on failure.
  const fail = (e: unknown) => set({ error: e instanceof Error ? e.message : String(e) });

  // Write one file's bytes to disk (via Rust) and record it in the DB. Shared by
  // addAttachment (issue-level) and addComment (comment-level). Returns false if
  // the file was rejected (too large) so callers can skip the row.
  const persistAttachment = async (issueId: string, file: File, commentId: string | null): Promise<boolean> => {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      set({ error: `"${file.name}" is too large (max ${formatBytes(MAX_ATTACHMENT_BYTES)}).` });
      return false;
    }
    const id = crypto.randomUUID();
    const base64 = await fileToBase64(file);
    const relPath = await invoke<string>('save_attachment', { id, data: base64 });
    await db.addAttachment({ id, issueId, commentId, filename: file.name, mimeType: file.type || null, relPath, size: file.size });
    return true;
  };

  return {
    issues: [],
    selectedId: null,
    comments: [],
    attachments: [],
    labels: [],
    loading: false,
    error: null,
    filter: { status: 'open', priority: 'all', search: '' },

    clearError: () => set({ error: null }),

    loadIssues: async () => {
      set({ loading: true });
      try {
        const issues = await db.getIssues();
        set({ issues, loading: false });
      } catch (e) {
        fail(e);
        set({ loading: false });
      }
    },

    loadLabels: async () => {
      try {
        set({ labels: await db.getLabels() });
      } catch (e) {
        fail(e);
      }
    },

    selectIssue: async (id) => {
      set({ selectedId: id });
      try {
        if (id) {
          const [comments, attachments] = await Promise.all([db.getComments(id), db.getAttachments(id)]);
          set({ comments, attachments });
        } else {
          set({ comments: [], attachments: [] });
        }
      } catch (e) {
        fail(e);
      }
    },

    createIssue: async (data) => {
      try {
        const issue = await db.createIssue(data);
        set(s => ({ issues: sortIssues([issue, ...s.issues]) }));
        return issue.id;
      } catch (e) {
        fail(e);
        return null;
      }
    },

    updateIssue: async (id, data) => {
      try {
        await db.updateIssue(id, data);
        // status/priority changes move the row, so re-sort after patching.
        const now = Date.now();
        set(s => ({ issues: sortIssues(s.issues.map(i => (i.id === id ? { ...i, ...data, updated_at: now } : i))) }));
      } catch (e) {
        fail(e);
      }
    },

    deleteIssue: async (id) => {
      try {
        await db.deleteIssue(id);
        set(s => ({
          issues: s.issues.filter(i => i.id !== id),
          ...(s.selectedId === id ? { selectedId: null, comments: [], attachments: [] } : {}),
        }));
      } catch (e) {
        fail(e);
      }
    },

    setIssueLabels: async (issueId, labelIds) => {
      try {
        await db.setIssueLabels(issueId, labelIds);
        // Resolve the ids against the loaded label set and patch the row.
        const labelById = new Map(get().labels.map(l => [l.id, l]));
        const newLabels = labelIds.map(id => labelById.get(id)).filter((l): l is Label => !!l);
        set(s => ({ issues: s.issues.map(i => (i.id === issueId ? { ...i, labels: newLabels } : i)) }));
      } catch (e) {
        fail(e);
      }
    },

    createLabel: async (name) => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const color = LABEL_PALETTE[get().labels.length % LABEL_PALETTE.length];
      try {
        const label = await db.createLabel(trimmed, color);
        set(s => ({ labels: [...s.labels, label].sort((a, b) => a.name.localeCompare(b.name)) }));
        return label;
      } catch (e) {
        fail(e);
        return null;
      }
    },

    addComment: async (issueId, body, files) => {
      try {
        const comment = await db.addComment(issueId, body);
        // Attach any picked files to the freshly created comment.
        for (const f of files ?? []) await persistAttachment(issueId, f, comment.id);
        const [comments, attachments] = await Promise.all([db.getComments(issueId), db.getAttachments(issueId)]);
        const now = Date.now();
        set(s => ({
          comments,
          attachments,
          issues: s.issues.map(i => (i.id === issueId ? { ...i, comment_count: (i.comment_count ?? 0) + 1, updated_at: now } : i)),
        }));
      } catch (e) {
        fail(e);
      }
    },

    deleteComment: async (id) => {
      try {
        // DB rows cascade on comment delete, but the bytes on disk don't — remove
        // each attached file first so nothing is orphaned.
        const orphans = get().attachments.filter(a => a.comment_id === id);
        await db.deleteComment(id);
        for (const att of orphans) {
          if (att.rel_path) await invoke('delete_attachment_file', { relPath: att.rel_path }).catch(() => {});
        }
        const issueId = get().selectedId;
        if (issueId) {
          const [comments, attachments] = await Promise.all([db.getComments(issueId), db.getAttachments(issueId)]);
          set(s => ({
            comments,
            attachments,
            issues: s.issues.map(i => (i.id === issueId ? { ...i, comment_count: Math.max(0, (i.comment_count ?? 0) - 1) } : i)),
          }));
        }
      } catch (e) {
        fail(e);
      }
    },

    addAttachment: async (issueId, file, commentId = null) => {
      try {
        const ok = await persistAttachment(issueId, file, commentId);
        if (ok && get().selectedId === issueId) set({ attachments: await db.getAttachments(issueId) });
      } catch (e) {
        fail(e);
      }
    },

    deleteAttachment: async (id) => {
      try {
        const att = await db.getAttachmentData(id);
        await db.deleteAttachment(id);
        if (att?.rel_path) await invoke('delete_attachment_file', { relPath: att.rel_path });
        const issueId = get().selectedId;
        if (issueId) set({ attachments: await db.getAttachments(issueId) });
      } catch (e) {
        fail(e);
      }
    },

    downloadAttachment: async (id) => {
      try {
        const att = await db.getAttachmentData(id);
        if (!att?.rel_path) return;
        // Rust opens the save dialog itself and copies the file — the
        // destination path never passes through the webview.
        await invoke('export_attachment', { relPath: att.rel_path, filename: att.filename });
      } catch (e) {
        fail(e);
      }
    },

    openAttachment: async (id) => {
      try {
        const att = await db.getAttachmentData(id);
        if (!att?.rel_path) return;
        // Open with the OS default program for the file's extension (Rust copies
        // it to a temp file under its real name first, since stored bytes are
        // named by a bare id).
        await invoke('open_attachment', { relPath: att.rel_path, filename: att.filename });
      } catch (e) {
        fail(e);
      }
    },

    setFilter: (f) => set(s => ({ filter: { ...s.filter, ...f } })),
  };
});

export function useFilteredIssues() {
  return useIssueStore(
    useShallow(s =>
      s.issues.filter(issue => {
        // "Open" is the merged active filter: it matches both open and
        // in_progress so work-in-flight isn't hidden. Other statuses match exactly.
        if (s.filter.status !== 'all') {
          const matches = s.filter.status === 'open'
            ? issue.status === 'open' || issue.status === 'in_progress'
            : issue.status === s.filter.status;
          if (!matches) return false;
        }
        if (s.filter.priority !== 'all' && issue.priority !== s.filter.priority) return false;
        if (s.filter.search) {
          const q = s.filter.search.toLowerCase();
          if (!issue.title.toLowerCase().includes(q) && !issue.body.toLowerCase().includes(q)) return false;
        }
        return true;
      })
    )
  );
}
