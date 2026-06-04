import { useEffect, useRef, useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { CircleDot, CircleCheck, Clock, XCircle, MessageSquare, AlertCircle, ChevronRight, GripVertical, Search } from 'lucide-react';
import type { Issue, Status } from '../../lib/types';
import { PRIORITY_CONFIG } from '../../lib/types';
import { useIssueStore, useFilteredIssues } from '../../stores/issueStore';

const STATUS_ICONS: Record<Status, React.ReactNode> = {
  open:        <CircleDot className="w-4 h-4 text-green-400" />,
  in_progress: <Clock className="w-4 h-4 text-blue-400" />,
  done:        <CircleCheck className="w-4 h-4 text-slate-500" />,
  cancelled:   <XCircle className="w-4 h-4 text-red-400/60" />,
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

function IssueRow({ issue, onDragEnd }: { issue: Issue; onDragEnd: () => void }) {
  const { selectedId, selectIssue } = useIssueStore();
  const selected = selectedId === issue.id;
  const pc = PRIORITY_CONFIG[issue.priority];
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={issue}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.18 }}
      onClick={() => selectIssue(selected ? null : issue.id)}
      className={`w-full text-left px-5 py-4 flex gap-2 items-start border-b border-[var(--border)] transition-colors cursor-pointer group relative
        ${selected ? 'bg-[var(--accent-soft)]' : 'hover:bg-white/[0.035]'}`}
    >
      {selected && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-blue-500/80" />}

      {/* Drag handle — only this starts a reorder, so row clicks still select. */}
      <span
        onPointerDown={e => { e.stopPropagation(); controls.start(e); }}
        onClick={e => e.stopPropagation()}
        className="mt-0.5 shrink-0 -ml-1.5 text-[var(--text-dim)] opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-grab active:cursor-grabbing touch-none transition-opacity"
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </span>

      <div className="mt-0.5 shrink-0">{STATUS_ICONS[issue.status]}</div>

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
    </Reorder.Item>
  );
}

export function IssueList() {
  const { filter, setFilter, loading, reorderIssues } = useIssueStore();
  const issues = useFilteredIssues();

  // Local mirror so dragging is snappy; resynced whenever the filtered set
  // (membership or order) changes underneath us.
  const [order, setOrder] = useState<Issue[]>(issues);
  const orderRef = useRef(order);
  orderRef.current = order;

  useEffect(() => {
    setOrder(issues);
  }, [issues.map(i => i.id).join(',')]);

  const persistOrder = () => reorderIssues(orderRef.current.map(i => i.id));

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-4 pt-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-dim)] pointer-events-none" />
          <input
            type="text"
            placeholder="Search tasks…"
            value={filter.search}
            onChange={e => setFilter({ search: e.target.value })}
            className="w-full bg-white/[0.04] border border-[var(--border)] rounded-xl pl-9 pr-3 py-2.5 text-sm text-[var(--text-bright)] placeholder:text-[var(--text-dim)] outline-none focus:border-blue-500/40 focus:bg-white/[0.06] focus:ring-4 focus:ring-blue-500/10 transition-all"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 pb-3 border-b border-[var(--border)] flex gap-1.5 flex-wrap">
        {(['all', 'open', 'in_progress', 'done'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter({ status: s })}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${filter.status === s ? 'bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-500/25' : 'text-[var(--text-dim)] hover:text-[var(--text-bright)] hover:bg-white/[0.04]'}`}
          >
            {s === 'all' ? 'All' : s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-20 text-slate-500 text-sm">Loading...</div>
        )}
        {!loading && order.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-500">
            <AlertCircle className="w-8 h-8 opacity-30" />
            <span className="text-sm">No issues found</span>
          </div>
        )}
        <Reorder.Group axis="y" values={order} onReorder={setOrder} as="div">
          {order.map(issue => (
            <IssueRow key={issue.id} issue={issue} onDragEnd={persistOrder} />
          ))}
        </Reorder.Group>
      </div>
    </div>
  );
}
