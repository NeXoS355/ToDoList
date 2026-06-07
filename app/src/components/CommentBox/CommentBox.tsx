import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquarePlus, Paperclip, FileText, Download, ExternalLink, X } from 'lucide-react';
import type { Comment } from '../../lib/types';
import { formatBytes } from '../../lib/types';
import { useIssueStore } from '../../stores/issueStore';
import { Markdown } from '../Markdown/Markdown';
import { MarkdownToolbar } from '../Markdown/MarkdownToolbar';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface CommentItemProps {
  comment: Comment;
}

function CommentItem({ comment }: CommentItemProps) {
  const { attachments, downloadAttachment, openAttachment } = useIssueStore();
  // Files uploaded together with this comment.
  const files = attachments.filter(a => a.comment_id === comment.id);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.15 }}
      className="group border border-[var(--border)] rounded-xl overflow-hidden bg-white/[0.02]"
    >
      <div className="flex items-center px-4 py-2.5 bg-white/[0.025] border-b border-[var(--border)]">
        <span className="text-xs text-[var(--text-dim)]">{formatDate(comment.created_at)}</span>
      </div>
      <div className="px-4 py-3.5">
        {comment.body && <Markdown className="text-sm text-[var(--text)] leading-relaxed">{comment.body}</Markdown>}

        {files.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-3 pt-3 border-t border-[var(--border)]">
            {files.map(att => (
              <div
                key={att.id}
                className="flex items-center gap-2.5 bg-white/[0.025] border border-[var(--border)] rounded-lg px-3 py-2 hover:bg-white/[0.05] transition-colors"
              >
                <FileText className="w-3.5 h-3.5 text-[var(--text-dim)] shrink-0" />
                <button
                  onClick={() => openAttachment(att.id)}
                  className="flex-1 min-w-0 text-left text-xs text-[var(--text-bright)] truncate hover:underline underline-offset-2"
                  title={`Open ${att.filename}`}
                >
                  {att.filename}
                </button>
                <span className="text-[11px] text-[var(--text-dim)] shrink-0">{formatBytes(att.size_bytes)}</span>
                <button onClick={() => openAttachment(att.id)} className="text-[var(--text-dim)] hover:text-blue-400 transition-colors shrink-0" title="Open with default app">
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => downloadAttachment(att.id)} className="text-[var(--text-dim)] hover:text-blue-400 transition-colors shrink-0" title="Save as…">
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

interface Props {
  issueId: string;
}

export function CommentBox({ issueId }: Props) {
  const { comments, addComment } = useIssueStore();
  const [text, setText] = useState('');
  const [pending, setPending] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPending(prev => [...prev, ...Array.from(e.target.files ?? [])]);
    e.target.value = '';
  };

  const removePending = (idx: number) => setPending(prev => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Allow comment with only attachments (no body), but not an empty submit.
    if (!text.trim() && pending.length === 0) return;
    setSaving(true);
    await addComment(issueId, text.trim(), pending);
    setText('');
    setPending([]);
    setSaving(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <div className="mt-8 pt-6 border-t border-[var(--border)]">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-4 flex items-center gap-2">
        <MessageSquarePlus className="w-4 h-4" />
        Comments & Updates
      </h3>

      <div className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {comments.map(c => (
            <CommentItem key={c.id} comment={c} />
          ))}
        </AnimatePresence>
      </div>

      <form onSubmit={handleSubmit} className="mt-4">
        <MarkdownToolbar textareaRef={textareaRef} value={text} onChange={setText} className="mb-1.5" />
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a comment or update... (Ctrl+Enter to submit)"
          rows={3}
          className="w-full bg-white/[0.04] border border-[var(--border)] rounded-xl px-4 py-3 text-sm leading-relaxed text-[var(--text-bright)] placeholder:text-[var(--text-dim)] outline-none focus:border-blue-500/40 focus:bg-white/[0.06] focus:ring-4 focus:ring-blue-500/10 transition-all resize-none"
        />

        {/* Files queued for this comment, removable before submit. */}
        {pending.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {pending.map((f, i) => (
              <span key={i} className="text-xs flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg border border-[var(--border)] bg-white/[0.03] text-[var(--text)]">
                <FileText className="w-3 h-3 text-[var(--text-dim)] shrink-0" />
                <span className="max-w-48 truncate">{f.name}</span>
                <span className="text-[var(--text-dim)]">{formatBytes(f.size)}</span>
                <button type="button" onClick={() => removePending(i)} title="Remove" className="opacity-50 hover:opacity-100 hover:text-red-400 transition">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex justify-between items-center mt-3">
          <input ref={fileInputRef} type="file" multiple onChange={handleFilesPicked} className="hidden" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-strong)] hover:bg-white/[0.06] bg-white/[0.03] transition-colors text-[var(--text)]"
          >
            <Paperclip className="w-3.5 h-3.5" /> Attach file
          </button>
          <button
            type="submit"
            disabled={(!text.trim() && pending.length === 0) || saving}
            className="text-sm px-4 py-2 rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium shadow-lg shadow-blue-600/20 ring-1 ring-inset ring-white/15 transition-all active:scale-[0.97]"
          >
            {saving ? 'Saving...' : 'Comment'}
          </button>
        </div>
      </form>
    </div>
  );
}
