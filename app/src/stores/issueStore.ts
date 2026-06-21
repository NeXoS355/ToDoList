import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { invoke } from '@tauri-apps/api/core';
import type { Issue, Comment, Label, Attachment, Priority, Status } from '../lib/types';
import { formatBytes, isOverdue, parseRecurrence, nextDueDate } from '../lib/types';
import * as db from '../lib/db';

// Hard cap on attachment size — bytes go to disk, but an unbounded file would
// still spike memory during the base64 round-trip to the Rust writer.
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

// Single source of truth for list order (applied after load and after every
// client-side patch): status → overdue first → priority → due date → newest.
const STATUS_RANK: Record<Status, number> = { in_progress: 0, open: 1, done: 2, cancelled: 3 };
const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function sortIssues(list: Issue[]): Issue[] {
  return [...list].sort((a, b) =>
    (STATUS_RANK[a.status] - STATUS_RANK[b.status]) ||
    (Number(isOverdue(b)) - Number(isOverdue(a))) ||
    (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) ||
    ((a.due_date ?? Infinity) - (b.due_date ?? Infinity)) ||
    (b.created_at - a.created_at)
  );
}

// Colors handed to newly created labels, cycled by current label count.
const LABEL_PALETTE = ['#ef4444', '#f97316', '#eab308', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

/** Encode bytes as base64 (chunked — String.fromCharCode chokes on big arrays). */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

interface IssueStore {
  issues: Issue[];
  selectedId: string | null;
  comments: Comment[];
  attachments: Attachment[];
  labels: Label[];
  loading: boolean;
  error: string | null;
  // One-shot success/info message (green toast), e.g. "file attached".
  notice: string | null;
  filter: { status: Status | 'all'; priority: Priority | 'all'; labelId: string | 'all'; search: string };
  // Issues removed from the list but not yet deleted in the DB — restorable
  // until the undo window closes (single delete or a whole "clear done" batch).
  pendingUndo: { issues: Issue[] } | null;

  clearError: () => void;
  clearNotice: () => void;
  loadIssues: () => Promise<void>;
  loadLabels: () => Promise<void>;
  selectIssue: (id: string | null) => Promise<void>;
  createIssue: (data: { title: string; body: string; priority: Priority; labelIds?: string[]; source?: string | null; sourceMeta?: Record<string, unknown> | null; dueDate?: number | null; recurrence?: string | null }) => Promise<string | null>;
  updateIssue: (id: string, data: Partial<Pick<Issue, 'title' | 'body' | 'priority' | 'status' | 'due_date' | 'recurrence'>>) => Promise<void>;
  deleteIssue: (id: string) => Promise<void>;
  clearDone: () => Promise<void>;
  undoDelete: () => void;
  setIssueLabels: (issueId: string, labelIds: string[]) => Promise<void>;
  createLabel: (name: string) => Promise<Label | null>;
  addComment: (issueId: string, body: string, files?: File[]) => Promise<void>;
  deleteComment: (id: string) => Promise<void>;
  /** Resolves to the new attachment's id (for attachment:// links), or null if rejected. */
  addAttachment: (issueId: string, file: File, commentId?: string | null) => Promise<string | null>;
  deleteAttachment: (id: string) => Promise<void>;
  downloadAttachment: (id: string) => Promise<void>;
  openAttachment: (id: string) => Promise<void>;
  setFilter: (f: Partial<IssueStore['filter']>) => void;
}

// How long a deleted issue stays restorable before the DB delete runs.
const UNDO_WINDOW_MS = 5000;

export const useIssueStore = create<IssueStore>((set, get) => {
  // Surface any thrown DB/IO error as a toast instead of a silent unhandled
  // rejection. Returns nothing — callers that need a value get null on failure.
  const fail = (e: unknown) => set({ error: e instanceof Error ? e.message : String(e) });

  let undoTimer: ReturnType<typeof setTimeout> | null = null;

  // Links the most recently completed recurring task to the follow-up it spawned,
  // so re-opening that task (undo of the completion) can remove the follow-up and
  // restore the rule. Single-slot, like pendingUndo — only the latest matters.
  let recurSpawn: { sourceId: string; spawnId: string; recurrence: string } | null = null;

  // Perform the deferred DB deletes for the pending undo (if any). Each DB row
  // cascades comments/attachment rows; the attachment bytes on disk are
  // removed explicitly since nothing else cleans them up.
  const flushPendingDelete = async () => {
    const pending = get().pendingUndo;
    if (!pending) return;
    if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
    set({ pendingUndo: null });
    try {
      for (const issue of pending.issues) {
        const orphans = await db.getAttachments(issue.id);
        await db.deleteIssue(issue.id);
        for (const att of orphans) {
          if (att.rel_path) await invoke('delete_attachment_file', { relPath: att.rel_path }).catch(() => {});
        }
      }
    } catch (e) {
      fail(e);
      await get().loadIssues(); // resync — some deletes may not have happened
    }
  };

  // Shared by deleteIssue and clearDone: drop the issues from the list now,
  // run the DB delete after the undo window.
  const stageDelete = (issues: Issue[]) => {
    const ids = new Set(issues.map(i => i.id));
    set(s => ({
      issues: s.issues.filter(i => !ids.has(i.id)),
      pendingUndo: { issues },
      ...(s.selectedId && ids.has(s.selectedId) ? { selectedId: null, comments: [], attachments: [] } : {}),
    }));
    undoTimer = setTimeout(() => { void flushPendingDelete(); }, UNDO_WINDOW_MS);
  };

  // A recurring task was just completed → create its next occurrence (fixed,
  // due-anchored: next due = old due + interval) as a fresh open issue, and move
  // the rule onto it so the completed one becomes plain history that can't
  // re-spawn. Needs a due_date as the anchor; without one, nothing happens.
  const spawnNextOccurrence = async (issue: Issue) => {
    const rec = parseRecurrence(issue.recurrence);
    if (!rec || issue.due_date == null) return;
    try {
      const spawn = await db.createIssue({
        title: issue.title,
        body: issue.body,
        priority: issue.priority,
        labelIds: (issue.labels ?? []).map(l => l.id),
        source: issue.source,
        sourceMeta: issue.source_meta ? JSON.parse(issue.source_meta) : null,
        dueDate: nextDueDate(issue.due_date, rec),
        recurrence: issue.recurrence,
      });
      // Strip the rule from the completed task so re-toggling can't spawn again.
      await db.updateIssue(issue.id, { recurrence: null });
      recurSpawn = { sourceId: issue.id, spawnId: spawn.id, recurrence: issue.recurrence! };
      set(s => ({ issues: sortIssues([spawn, ...s.issues.map(i => (i.id === issue.id ? { ...i, recurrence: null } : i))]) }));
    } catch (e) {
      fail(e);
    }
  };

  // Reverse of spawnNextOccurrence when a completion is undone (done → not done):
  // delete the follow-up and put the rule back on the re-opened task.
  const revertSpawn = async () => {
    if (!recurSpawn) return;
    const { sourceId, spawnId, recurrence } = recurSpawn;
    recurSpawn = null;
    try {
      await db.updateIssue(sourceId, { recurrence });
      const orphans = await db.getAttachments(spawnId);
      await db.deleteIssue(spawnId);
      for (const att of orphans) {
        if (att.rel_path) await invoke('delete_attachment_file', { relPath: att.rel_path }).catch(() => {});
      }
      set(s => ({ issues: s.issues.filter(i => i.id !== spawnId).map(i => (i.id === sourceId ? { ...i, recurrence } : i)) }));
    } catch (e) {
      fail(e);
    }
  };

  // Write one file's bytes to disk (via Rust) and record it in the DB. Shared by
  // addAttachment (issue-level) and addComment (comment-level). Returns the new
  // attachment id, or null if the file was rejected (too large, or identical
  // bytes are already attached to this issue).
  const persistAttachment = async (issueId: string, file: File, commentId: string | null): Promise<string | null> => {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      set({ error: `"${file.name}" is too large (max ${formatBytes(MAX_ATTACHMENT_BYTES)}).` });
      return null;
    }
    const buf = await file.arrayBuffer();
    const checksum = await sha256Hex(buf);
    const dupe = await db.findAttachmentByChecksum(issueId, checksum);
    if (dupe !== null) {
      set({ error: `"${file.name}" is already attached to this issue${dupe !== file.name ? ` (as "${dupe}")` : ''}.` });
      return null;
    }
    const id = crypto.randomUUID();
    const relPath = await invoke<string>('save_attachment', { id, data: bytesToBase64(new Uint8Array(buf)) });
    await db.addAttachment({ id, issueId, commentId, filename: file.name, mimeType: file.type || null, relPath, size: file.size, checksum });
    return id;
  };

  return {
    issues: [],
    selectedId: null,
    comments: [],
    attachments: [],
    labels: [],
    loading: false,
    error: null,
    notice: null,
    filter: { status: 'open', priority: 'all', labelId: 'all', search: '' },
    pendingUndo: null,

    clearError: () => set({ error: null }),
    clearNotice: () => set({ notice: null }),

    loadIssues: async () => {
      set({ loading: true });
      try {
        const issues = await db.getIssues();
        set({ issues: sortIssues(issues), loading: false });
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
        const before = get().issues.find(i => i.id === id);
        await db.updateIssue(id, data);
        // status/priority changes move the row, so re-sort after patching.
        const now = Date.now();
        set(s => ({ issues: sortIssues(s.issues.map(i => (i.id === id ? { ...i, ...data, updated_at: now } : i))) }));

        // Recurring task lifecycle around the done transition.
        if (data.status && before && data.status !== before.status) {
          if (data.status === 'done' && before.status !== 'done') {
            await spawnNextOccurrence(before);
          } else if (before.status === 'done' && recurSpawn?.sourceId === id) {
            await revertSpawn(); // completion undone → drop the follow-up
          }
        }
      } catch (e) {
        fail(e);
      }
    },

    // Optimistic delete with undo: the issue leaves the list immediately, but
    // the DB delete is deferred for UNDO_WINDOW_MS so it can be restored
    // losslessly (comments/attachments included). Crash during the window
    // fails safe — the issue reappears on next launch.
    deleteIssue: async (id) => {
      await flushPendingDelete(); // only one pending delete at a time
      const issue = get().issues.find(i => i.id === id);
      if (issue) stageDelete([issue]);
    },

    // Manual cleanup: remove every done issue (same undo window as a single
    // delete). Cancelled issues are kept — "done" means done.
    clearDone: async () => {
      await flushPendingDelete();
      const done = get().issues.filter(i => i.status === 'done');
      if (done.length) stageDelete(done);
    },

    undoDelete: () => {
      const pending = get().pendingUndo;
      if (!pending) return;
      if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
      set(s => ({ issues: sortIssues([...s.issues, ...pending.issues]), pendingUndo: null }));
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
        const id = await persistAttachment(issueId, file, commentId);
        if (id && get().selectedId === issueId) set({ attachments: await db.getAttachments(issueId) });
        return id;
      } catch (e) {
        fail(e);
        return null;
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
        if (s.filter.labelId !== 'all' && !issue.labels?.some(l => l.id === s.filter.labelId)) return false;
        if (s.filter.search) {
          const q = s.filter.search.toLowerCase();
          if (!issue.title.toLowerCase().includes(q) && !issue.body.toLowerCase().includes(q)) return false;
        }
        return true;
      })
    )
  );
}
