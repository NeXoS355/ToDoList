import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, PenLine, CornerDownLeft } from 'lucide-react';
import { useIssueStore } from '../../stores/issueStore';

/**
 * Primary fast path (lives in the header): type a title, Enter creates the task
 * instantly and keeps focus for the next one — no dialog, no description needed.
 * ⌘/Ctrl+Enter (or the pen button) escalates the typed title into the full
 * New Issue dialog when details are wanted.
 */
export function QuickComposer({ onAddDetails }: { onAddDetails: (title: string) => void }) {
  const createIssue = useIssueStore(s => s.createIssue);
  const [value, setValue] = useState('');
  const [flash, setFlash] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const quickCreate = async () => {
    const title = value.trim();
    if (!title) return;
    setValue('');
    setFlash(f => f + 1); // retrigger the confirmation pulse
    await createIssue({ title, body: '', priority: 'medium' });
    inputRef.current?.focus();
  };

  const escalate = () => {
    onAddDetails(value.trim());
    setValue('');
  };

  return (
    <motion.form
      key={flash}
      onSubmit={e => { e.preventDefault(); quickCreate(); }}
      initial={flash ? { boxShadow: '0 0 0 3px rgba(16,185,129,0.45)' } : false}
      animate={{ boxShadow: '0 0 0 0px rgba(16,185,129,0)' }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="group flex items-center gap-2.5 w-72 bg-white/[0.04] border border-[var(--border-strong)] rounded-xl pl-3 pr-2 py-2 focus-within:border-emerald-500/50 focus-within:bg-white/[0.06] focus-within:ring-4 focus-within:ring-emerald-500/10 transition-colors"
    >
      <button
        type="submit"
        tabIndex={-1}
        className="shrink-0 text-[var(--text-dim)] group-focus-within:text-emerald-400 transition-colors"
        aria-label="Add task"
      >
        <Plus className="w-4 h-4" />
      </button>
      <input
        ref={inputRef}
        type="text"
        autoFocus
        placeholder="Add a task…"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); escalate(); }
        }}
        className="flex-1 min-w-0 bg-transparent text-sm text-[var(--text-bright)] placeholder:text-[var(--text-dim)] outline-none"
      />
      <AnimatePresence>
        {value.trim() && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="shrink-0 flex items-center gap-1 text-[10px] text-[var(--text-dim)] bg-white/[0.05] px-1.5 py-0.5 rounded-md"
          >
            <CornerDownLeft className="w-3 h-3" />
          </motion.span>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={escalate}
        title="Add description & details (⌘↵)"
        className="shrink-0 text-[var(--text-dim)] hover:text-[var(--text-bright)] hover:bg-white/[0.06] p-1 rounded-md opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all"
        aria-label="Add details"
      >
        <PenLine className="w-3.5 h-3.5" />
      </button>
    </motion.form>
  );
}
