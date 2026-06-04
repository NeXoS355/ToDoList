import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { Issue, Comment, Label, Attachment, Priority, Status } from '../lib/types';
import * as db from '../lib/db';

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
  filter: { status: Status | 'all'; priority: Priority | 'all'; search: string };

  loadIssues: () => Promise<void>;
  loadLabels: () => Promise<void>;
  selectIssue: (id: string | null) => Promise<void>;
  createIssue: (data: { title: string; body: string; priority: Priority; labelIds?: string[]; source?: string | null; sourceMeta?: Record<string, unknown> | null }) => Promise<string>;
  updateIssue: (id: string, data: Partial<Pick<Issue, 'title' | 'body' | 'priority' | 'status'>>) => Promise<void>;
  deleteIssue: (id: string) => Promise<void>;
  reorderIssues: (visibleOrderedIds: string[]) => Promise<void>;
  setIssueLabels: (issueId: string, labelIds: string[]) => Promise<void>;
  addComment: (issueId: string, body: string) => Promise<void>;
  deleteComment: (id: string) => Promise<void>;
  addAttachment: (issueId: string, file: File) => Promise<void>;
  deleteAttachment: (id: string) => Promise<void>;
  downloadAttachment: (id: string) => Promise<void>;
  setFilter: (f: Partial<IssueStore['filter']>) => void;
}

export const useIssueStore = create<IssueStore>((set, get) => ({
  issues: [],
  selectedId: null,
  comments: [],
  attachments: [],
  labels: [],
  loading: false,
  filter: { status: 'open', priority: 'all', search: '' },

  loadIssues: async () => {
    set({ loading: true });
    const issues = await db.getIssues();
    set({ issues, loading: false });
  },

  loadLabels: async () => {
    const labels = await db.getLabels();
    set({ labels });
  },

  selectIssue: async (id) => {
    set({ selectedId: id });
    if (id) {
      const [comments, attachments] = await Promise.all([db.getComments(id), db.getAttachments(id)]);
      set({ comments, attachments });
    } else {
      set({ comments: [], attachments: [] });
    }
  },

  createIssue: async (data) => {
    const issue = await db.createIssue(data);
    await get().loadIssues();
    return issue.id;
  },

  updateIssue: async (id, data) => {
    await db.updateIssue(id, data);
    await get().loadIssues();
    if (get().selectedId === id) {
      const comments = await db.getComments(id);
      set({ comments });
    }
  },

  deleteIssue: async (id) => {
    await db.deleteIssue(id);
    if (get().selectedId === id) set({ selectedId: null, comments: [] });
    await get().loadIssues();
  },

  reorderIssues: async (visibleOrderedIds) => {
    // The drag only reorders the *visible* (filtered) subset. Splice that new
    // order back into the full list — keeping hidden issues in their slots —
    // so the persisted sort_order stays coherent across filters.
    const byId = new Map(get().issues.map(i => [i.id, i]));
    const queue = [...visibleOrderedIds];
    const visible = new Set(visibleOrderedIds);
    const newIssues = get().issues.map(i => (visible.has(i.id) ? byId.get(queue.shift()!)! : i));
    set({ issues: newIssues }); // optimistic
    await db.reorderIssues(newIssues.map(i => i.id));
    await get().loadIssues();
  },

  setIssueLabels: async (issueId, labelIds) => {
    await db.setIssueLabels(issueId, labelIds);
    await get().loadIssues();
  },

  addComment: async (issueId, body) => {
    await db.addComment(issueId, body);
    const comments = await db.getComments(issueId);
    await get().loadIssues();
    set({ comments });
  },

  deleteComment: async (id) => {
    await db.deleteComment(id);
    const issueId = get().selectedId;
    if (issueId) {
      const comments = await db.getComments(issueId);
      set({ comments });
    }
  },

  addAttachment: async (issueId, file) => {
    const base64 = await fileToBase64(file);
    await db.addAttachment({ issueId, filename: file.name, mimeType: file.type || null, base64, size: file.size });
    if (get().selectedId === issueId) set({ attachments: await db.getAttachments(issueId) });
  },

  deleteAttachment: async (id) => {
    await db.deleteAttachment(id);
    const issueId = get().selectedId;
    if (issueId) set({ attachments: await db.getAttachments(issueId) });
  },

  downloadAttachment: async (id) => {
    const att = await db.getAttachmentData(id);
    if (!att?.data) return;
    const a = document.createElement('a');
    a.href = `data:${att.mime_type ?? 'application/octet-stream'};base64,${att.data}`;
    a.download = att.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  },

  setFilter: (f) => set(s => ({ filter: { ...s.filter, ...f } })),
}));

export function useFilteredIssues() {
  return useIssueStore(
    useShallow(s =>
      s.issues.filter(issue => {
        if (s.filter.status !== 'all' && issue.status !== s.filter.status) return false;
        if (s.filter.priority !== 'all' && issue.priority !== s.filter.priority) return false;
        if (s.filter.search && !issue.title.toLowerCase().includes(s.filter.search.toLowerCase())) return false;
        return true;
      })
    )
  );
}
