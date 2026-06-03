import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, MessageSquarePlus } from 'lucide-react';
import type { Comment } from '../../lib/types';
import { useIssueStore } from '../../stores/issueStore';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface CommentItemProps {
  comment: Comment;
}

function CommentItem({ comment }: CommentItemProps) {
  const { deleteComment } = useIssueStore();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.15 }}
      className="group border border-[var(--border)] rounded-xl overflow-hidden bg-white/[0.02]"
    >
      <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.025] border-b border-[var(--border)]">
        <span className="text-xs text-[var(--text-dim)]">{formatDate(comment.created_at)}</span>
        <button
          onClick={() => deleteComment(comment.id)}
          className="opacity-0 group-hover:opacity-100 text-[var(--text-dim)] hover:text-red-400 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="px-4 py-3.5">
        <p className="text-sm text-[var(--text)] whitespace-pre-wrap leading-relaxed">{comment.body}</p>
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
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    await addComment(issueId, text.trim());
    setText('');
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
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a comment or update... (Ctrl+Enter to submit)"
          rows={3}
          className="w-full bg-white/[0.04] border border-[var(--border)] rounded-xl px-4 py-3 text-sm leading-relaxed text-[var(--text-bright)] placeholder:text-[var(--text-dim)] outline-none focus:border-blue-500/40 focus:bg-white/[0.06] focus:ring-4 focus:ring-blue-500/10 transition-all resize-none"
        />
        <div className="flex justify-end mt-3">
          <button
            type="submit"
            disabled={!text.trim() || saving}
            className="text-sm px-4 py-2 rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium shadow-lg shadow-blue-600/20 ring-1 ring-inset ring-white/15 transition-all active:scale-[0.97]"
          >
            {saving ? 'Saving...' : 'Comment'}
          </button>
        </div>
      </form>
    </div>
  );
}
