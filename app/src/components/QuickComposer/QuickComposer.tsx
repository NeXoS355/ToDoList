import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, PenLine, CornerDownLeft, CalendarDays } from 'lucide-react';
import { useIssueStore } from '../../stores/issueStore';
import { parseQuickInput } from '../../lib/quickParse';
import { PRIORITY_CONFIG } from '../../lib/types';

function formatDueChip(ts: number): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = ts - today.getTime();
  if (diff === 0) return 'Today';
  if (diff === 86_400_000) return 'Tomorrow';
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Primary fast path (lives in the header): type a title, Enter creates the task
 * instantly and keeps focus for the next one — no dialog, no description needed.
 * Inline tokens set metadata on the way (see quickParse): !high / !! priority,
 * #label, @tomorrow / @fri / @24.12. due date — detected tokens preview as
 * chips below the field. ⌘/Ctrl+Enter (or the pen button) escalates the typed
 * text into the full New Issue dialog when details are wanted.
 */
export function QuickComposer({ onAddDetails }: { onAddDetails: (title: string) => void }) {
  const createIssue = useIssueStore(s => s.createIssue);
  const labels = useIssueStore(s => s.labels);
  const [value, setValue] = useState('');
  const [flash, setFlash] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseQuickInput(value, labels), [value, labels]);
  const hasTokens = parsed.priority !== null || parsed.labels.length > 0 || parsed.dueDate !== null;

  const quickCreate = async () => {
    if (!parsed.title) return; // tokens alone are not a task
    setValue('');
    setFlash(f => f + 1); // retrigger the confirmation pulse
    await createIssue({
      title: parsed.title,
      body: '',
      priority: parsed.priority ?? 'medium',
      labelIds: parsed.labels.map(l => l.id),
      dueDate: parsed.dueDate,
    });
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
      className="group relative flex items-center gap-2.5 w-72 bg-white/[0.04] border border-[var(--border-strong)] rounded-xl pl-3 pr-2 py-2 focus-within:border-emerald-500/50 focus-within:bg-white/[0.06] focus-within:ring-4 focus-within:ring-emerald-500/10 transition-colors"
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
        title={'Inline tokens: !high or !! = priority · #label · @tomorrow, @fri, @24.12. = due date'}
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

      {/* Live preview of recognized tokens — what Enter will actually set. */}
      <AnimatePresence>
        {hasTokens && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full right-0 mt-2 z-30 flex items-center gap-1.5 flex-wrap max-w-80 px-2.5 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border-strong)] shadow-2xl shadow-black/40 pointer-events-none"
          >
            {parsed.priority && (
              <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${PRIORITY_CONFIG[parsed.priority].color} ${PRIORITY_CONFIG[parsed.priority].bg}`}>
                {PRIORITY_CONFIG[parsed.priority].label}
              </span>
            )}
            {parsed.labels.map(l => (
              <span key={l.id} className="text-[11px] px-2 py-0.5 rounded-md" style={{ color: l.color, backgroundColor: `${l.color}1a` }}>
                {l.name}
              </span>
            ))}
            {parsed.dueDate !== null && (
              <span className="text-[11px] flex items-center gap-1 text-[var(--text)]">
                <CalendarDays className="w-3 h-3" /> {formatDueChip(parsed.dueDate)}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.form>
  );
}
