import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CircleDot, CircleCheck, Clock, XCircle, MessageSquare, AlertCircle, ChevronRight, Search, CalendarDays, X, Trash2 } from 'lucide-react';
import type { Status, Issue } from '../../lib/types';
import { PRIORITY_CONFIG, isOverdue, startOfToday } from '../../lib/types';
import { useIssueStore, useFilteredIssues } from '../../stores/issueStore';

const STATUS_ICONS: Record<Status, React.ReactNode> = {
  open:        <CircleDot className="w-4 h-4 text-green-400" />,
  in_progress: <Clock className="w-4 h-4 text-blue-400" />,
  done:        <CircleCheck className="w-4 h-4 text-slate-500" />,
  cancelled:   <XCircle className="w-4 h-4 text-red-400/60" />,
};

const STATUS_CYCLE: Record<Status, Status> = {
  open:        'in_progress',
  in_progress: 'done',
  done:        'open',
  cancelled:   'open',
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

const DAY_MS = 86_400_000;

function formatDue(ts: number): string {
  const today = startOfToday();
  if (ts >= today && ts < today + DAY_MS) return 'Today';
  if (ts >= today + DAY_MS && ts < today + 2 * DAY_MS) return 'Tomorrow';
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

// Urgency tint for the due badge: overdue red, due today amber, else neutral.
function dueClass(issue: Issue): string {
  if (isOverdue(issue)) return 'text-red-400';
  const today = startOfToday();
  if (issue.due_date! >= today && issue.due_date! < today + DAY_MS
    && issue.status !== 'done' && issue.status !== 'cancelled') return 'text-amber-400';
  return 'text-[var(--text-dim)]';
}

function IssueRow({ issue }: { issue: Issue }) {
  const { selectedId, selectIssue, updateIssue } = useIssueStore();
  const selected = selectedId === issue.id;
  const pc = PRIORITY_CONFIG[issue.priority];

  // Subtle completion feedback: when the row transitions to done (from the
  // icon here or the picker in the detail view), flash a soft emerald wash
  // and let the icon pop briefly. Local and quiet — no overlays.
  const prevStatus = useRef(issue.status);
  const [justDone, setJustDone] = useState(false);
  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = issue.status;
    if (was !== 'done' && issue.status === 'done') {
      setJustDone(true);
      const t = setTimeout(() => setJustDone(false), 900);
      return () => clearTimeout(t);
    }
  }, [issue.status]);

  // Click the status icon to cycle open → in_progress → done → open without
  // opening the issue. (cancelled re-enters the cycle at open.)
  const cycleStatus = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateIssue(issue.id, { status: STATUS_CYCLE[issue.status] });
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.12 }}
      onClick={() => selectIssue(selected ? null : issue.id)}
      className={`w-full text-left px-5 py-4 flex gap-2 items-start border-b border-[var(--border)] transition-colors cursor-pointer group relative
        ${selected ? 'bg-[var(--accent-soft)]' : 'hover:bg-white/[0.035]'}`}
    >
      {selected && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-blue-500/80" />}

      {/* Completion flash — fades out over the row, never blocks clicks. */}
      <AnimatePresence>
        {justDone && (
          <motion.span
            initial={{ opacity: 0.25 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
            className="absolute inset-0 bg-emerald-400 pointer-events-none"
          />
        )}
      </AnimatePresence>

      <button
        onClick={cycleStatus}
        title={`Set to ${STATUS_CYCLE[issue.status].replace('_', ' ')}`}
        className="mt-0.5 shrink-0 -m-1 p-1 rounded-md hover:bg-white/[0.08] transition-colors"
      >
        <motion.span
          key={issue.status}
          initial={{ scale: issue.status === 'done' ? 0.5 : 1 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 18 }}
          className="block"
        >
          {STATUS_ICONS[issue.status]}
        </motion.span>
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium leading-snug truncate ${issue.status === 'done' || issue.status === 'cancelled' ? 'text-[var(--text-dim)] line-through' : 'text-[var(--text-bright)]'}`}>
            {issue.title}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${pc.color} ${pc.bg}`}>
            {pc.label}
          </span>
          {issue.due_date != null && (
            <span className={`text-[11px] flex items-center gap-1 ${dueClass(issue)}`} title={`Due ${new Date(issue.due_date).toLocaleDateString('de-DE')}`}>
              <CalendarDays className="w-3 h-3" /> {formatDue(issue.due_date)}
            </span>
          )}
          {issue.labels?.map(l => (
            <span key={l.id} className="text-[11px] px-2 py-0.5 rounded-md" style={{ color: l.color, backgroundColor: `${l.color}1a` }}>
              {l.name}
            </span>
          ))}
          <span className="text-[11px] text-[var(--text-dim)]">{formatDate(issue.updated_at)}</span>
          {(issue.comment_count ?? 0) > 0 && (
            <span className="text-[11px] text-[var(--text-dim)] flex items-center gap-1">
              <MessageSquare className="w-3 h-3" /> {issue.comment_count}
            </span>
          )}
        </div>
      </div>

      <ChevronRight className={`w-4 h-4 shrink-0 mt-0.5 transition-transform text-[var(--text-dim)] opacity-0 group-hover:opacity-100 ${selected ? 'rotate-90 text-blue-400 opacity-100' : ''}`} />
    </motion.div>
  );
}

export function IssueList() {
  const { filter, setFilter, loading, labels, issues: allIssues, clearDone } = useIssueStore();
  // Already sorted by the store (see sortIssues); render as-is.
  const issues = useFilteredIssues();
  const searchRef = useRef<HTMLInputElement>(null);
  const doneCount = allIssues.filter(i => i.status === 'done').length;

  // Relative timestamps ("5m ago") go stale without re-renders — tick once a
  // minute so the list stays honest while the app idles.
  const [, setNow] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow(n => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // Ctrl/⌘+F or "/" focuses the search box from anywhere in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (((e.ctrlKey || e.metaKey) && e.key === 'f') || (e.key === '/' && !inField && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-4 pt-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-dim)] pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search tasks…  (/ or Ctrl+F)"
            value={filter.search}
            onChange={e => setFilter({ search: e.target.value })}
            onKeyDown={e => {
              // Esc: first press clears, second leaves the field.
              if (e.key === 'Escape') {
                e.preventDefault();
                if (filter.search) setFilter({ search: '' });
                else searchRef.current?.blur();
              }
            }}
            className="w-full bg-white/[0.04] border border-[var(--border)] rounded-xl pl-9 pr-8 py-2.5 text-sm text-[var(--text-bright)] placeholder:text-[var(--text-dim)] outline-none focus:border-blue-500/40 focus:bg-white/[0.06] focus:ring-4 focus:ring-blue-500/10 transition-all"
          />
          {filter.search && (
            <button
              onClick={() => { setFilter({ search: '' }); searchRef.current?.focus(); }}
              title="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-[var(--text-dim)] hover:text-[var(--text-bright)] hover:bg-white/[0.06] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 pb-3 border-b border-[var(--border)]">
        <div className="flex gap-1.5 flex-wrap items-center">
          {(['all', 'open', 'done'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilter({ status: s })}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${filter.status === s ? 'bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-500/25' : 'text-[var(--text-dim)] hover:text-[var(--text-bright)] hover:bg-white/[0.04]'}`}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}

          {/* Manual cleanup — deletes all done issues (undoable via toast). */}
          {doneCount > 0 && (
            <button
              onClick={() => clearDone()}
              title={`Delete ${doneCount} done issue${doneCount === 1 ? '' : 's'} (undoable)`}
              className="ml-auto text-xs px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 text-[var(--text-dim)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Clear done
            </button>
          )}
        </div>

        {/* Label filter — one label at a time; click the active chip to clear. */}
        {labels.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mt-2">
            {labels.map(l => {
              const active = filter.labelId === l.id;
              return (
                <button
                  key={l.id}
                  onClick={() => setFilter({ labelId: active ? 'all' : l.id })}
                  title={active ? 'Clear label filter' : `Show only "${l.name}"`}
                  className="text-[11px] px-2 py-0.5 rounded-full border transition-colors"
                  style={{
                    color: active ? l.color : 'var(--text-dim)',
                    borderColor: active ? `${l.color}60` : 'var(--border)',
                    backgroundColor: active ? `${l.color}1a` : 'transparent',
                  }}
                >
                  {l.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-20 text-slate-500 text-sm">Loading...</div>
        )}
        {!loading && issues.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-500">
            <AlertCircle className="w-8 h-8 opacity-30" />
            <span className="text-sm">No issues found</span>
          </div>
        )}
        <AnimatePresence initial={false}>
          {issues.map(issue => (
            <IssueRow key={issue.id} issue={issue} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
