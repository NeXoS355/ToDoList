import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef } from 'react';
import { X, Trash2, CircleDot, Clock, CircleCheck, XCircle, ChevronDown, Paperclip, FileText, Download, Mail } from 'lucide-react';
import type { Status, Priority } from '../../lib/types';
import { PRIORITY_CONFIG, STATUS_CONFIG, formatBytes } from '../../lib/types';
import { readEmailMeta } from '../../lib/emailParse';
import { useIssueStore } from '../../stores/issueStore';
import { CommentBox } from '../CommentBox/CommentBox';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUS_ICONS: Record<Status, React.ReactNode> = {
  open:        <CircleDot className="w-4 h-4 text-green-400" />,
  in_progress: <Clock className="w-4 h-4 text-blue-400" />,
  done:        <CircleCheck className="w-4 h-4 text-slate-500" />,
  cancelled:   <XCircle className="w-4 h-4 text-red-400/60" />,
};

export function IssueDetail() {
  const { issues, selectedId, selectIssue, updateIssue, deleteIssue, attachments, addAttachment, deleteAttachment, downloadAttachment } = useIssueStore();
  const issue = issues.find(i => i.id === selectedId) ?? null;
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleStatusChange = async (status: Status) => {
    if (!issue) return;
    setShowStatusMenu(false);
    await updateIssue(issue.id, { status });
  };

  const handleFilesPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!issue) return;
    for (const f of Array.from(e.target.files ?? [])) await addAttachment(issue.id, f);
    e.target.value = '';
  };

  const handlePriorityChange = async (priority: Priority) => {
    if (!issue) return;
    setShowPriorityMenu(false);
    await updateIssue(issue.id, { priority });
  };

  const handleDelete = async () => {
    if (!issue) return;
    if (confirm(`Delete "${issue.title}"?`)) {
      await deleteIssue(issue.id);
    }
  };

  return (
    <AnimatePresence mode="wait">
      {!issue ? (
        <motion.div
          key="empty"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex flex-col items-center justify-center h-full text-slate-600 gap-3"
        >
          <CircleDot className="w-12 h-12 opacity-20" />
          <span className="text-sm">Select an issue</span>
        </motion.div>
      ) : (
        <motion.div
          key={issue.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
          className="flex flex-col h-full overflow-y-auto relative"
        >
          {/* Header */}
          <div className="px-8 pt-7 pb-5 border-b border-[var(--border)] flex items-start gap-3">
            <div className="flex-1">
              <h2 className={`text-xl font-semibold leading-snug tracking-tight ${issue.status === 'done' || issue.status === 'cancelled' ? 'text-[var(--text-dim)] line-through' : 'text-[var(--text-bright)]'}`}>
                {issue.title}
              </h2>
              <div className="flex items-center gap-2 mt-2.5 text-xs text-[var(--text-dim)]">
                {STATUS_ICONS[issue.status]}
                <span>{STATUS_CONFIG[issue.status].label}</span>
                <span className="opacity-50">·</span>
                <span>opened {formatDate(issue.created_at)}</span>
              </div>
            </div>
            <button onClick={() => selectIssue(null)} className="text-[var(--text-dim)] hover:text-[var(--text-bright)] hover:bg-white/[0.05] p-2 -mr-2 rounded-lg transition-colors shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Meta bar */}
          <div className="px-8 py-4 border-b border-[var(--border)] flex items-center gap-2.5 flex-wrap">
            {/* Status picker */}
            <div className="relative">
              <button
                onClick={() => { setShowStatusMenu(v => !v); setShowPriorityMenu(false); }}
                className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-strong)] hover:bg-white/[0.06] bg-white/[0.03] transition-colors text-[var(--text)]"
              >
                {STATUS_ICONS[issue.status]}
                <span>{STATUS_CONFIG[issue.status].label}</span>
                <ChevronDown className="w-3 h-3 text-slate-500" />
              </button>
              <AnimatePresence>
                {showStatusMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute top-full left-0 mt-2 z-20 bg-[var(--surface-2)] border border-[var(--border-strong)] rounded-xl shadow-2xl shadow-black/40 overflow-hidden min-w-40 p-1"
                  >
                    {(Object.keys(STATUS_CONFIG) as Status[]).map(s => (
                      <button key={s} onClick={() => handleStatusChange(s)} className="w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center gap-2 hover:bg-white/[0.06] transition-colors text-[var(--text)]">
                        {STATUS_ICONS[s]} {STATUS_CONFIG[s].label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Priority picker */}
            <div className="relative">
              <button
                onClick={() => { setShowPriorityMenu(v => !v); setShowStatusMenu(false); }}
                className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-strong)] hover:bg-white/[0.06] transition-colors ${PRIORITY_CONFIG[issue.priority].color} bg-white/[0.03]`}
              >
                <span>{PRIORITY_CONFIG[issue.priority].label}</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>
              <AnimatePresence>
                {showPriorityMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute top-full left-0 mt-2 z-20 bg-[var(--surface-2)] border border-[var(--border-strong)] rounded-xl shadow-2xl shadow-black/40 overflow-hidden min-w-36 p-1"
                  >
                    {(Object.keys(PRIORITY_CONFIG) as Priority[]).map(p => (
                      <button key={p} onClick={() => handlePriorityChange(p)} className={`w-full text-left px-2.5 py-2 rounded-lg text-xs hover:bg-white/[0.06] transition-colors ${PRIORITY_CONFIG[p].color}`}>
                        {PRIORITY_CONFIG[p].label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Labels */}
            {issue.labels?.map(l => (
              <span key={l.id} className="text-xs px-2.5 py-1 rounded-full border" style={{ color: l.color, borderColor: `${l.color}33`, backgroundColor: `${l.color}12` }}>
                {l.name}
              </span>
            ))}

            <div className="flex-1" />

            <button onClick={handleDelete} className="text-[var(--text-dim)] hover:text-red-400 hover:bg-red-500/10 p-2 rounded-lg transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Email source */}
          {(() => {
            const meta = readEmailMeta(issue.source_meta);
            if (!meta) return null;
            return (
              <div className="px-8 pt-5">
                <div className="flex items-start gap-3 rounded-xl border border-blue-500/25 bg-gradient-to-br from-blue-500/[0.07] to-violet-500/[0.05] px-3.5 py-3 ring-1 ring-inset ring-white/5">
                  <div className="shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-sm font-semibold shadow-lg shadow-blue-500/20">
                    {(meta.fromName || meta.fromEmail || '?').trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-blue-300/80">
                      <Mail className="w-3 h-3" /> From email
                    </div>
                    <div className="text-sm text-[var(--text-bright)] font-medium truncate mt-0.5">
                      {meta.fromName || meta.fromEmail || 'Unknown sender'}
                      {meta.fromName && meta.fromEmail && (
                        <span className="text-[var(--text-dim)] font-normal"> · {meta.fromEmail}</span>
                      )}
                    </div>
                    {meta.date && (
                      <div className="flex items-center gap-1.5 text-xs text-[var(--text-dim)] mt-1">
                        <Clock className="w-3 h-3" /> {meta.date}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Body */}
          <div className="px-8 py-6 flex-1">
            {issue.body ? (
              <p className="text-[15px] text-[var(--text)] whitespace-pre-wrap leading-relaxed">{issue.body}</p>
            ) : (
              <p className="text-sm text-[var(--text-dim)] italic">No description.</p>
            )}

            {/* Attachments */}
            <div className="mt-8 pt-6 border-t border-[var(--border)]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)] flex items-center gap-2">
                  <Paperclip className="w-4 h-4" />
                  Attachments {attachments.length > 0 && <span className="text-[var(--text-dim)]/70">· {attachments.length}</span>}
                </h3>
                <input ref={fileInputRef} type="file" multiple onChange={handleFilesPicked} className="hidden" />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-strong)] hover:bg-white/[0.06] bg-white/[0.03] transition-colors text-[var(--text)]"
                >
                  <Paperclip className="w-3.5 h-3.5" /> Attach file
                </button>
              </div>

              {attachments.length === 0 ? (
                <p className="text-sm text-[var(--text-dim)] italic">No files attached.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <AnimatePresence initial={false}>
                    {attachments.map(att => (
                      <motion.div
                        key={att.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.15 }}
                        className="group flex items-center gap-3 bg-white/[0.025] border border-[var(--border)] rounded-xl px-3.5 py-2.5 hover:bg-white/[0.05] transition-colors"
                      >
                        <FileText className="w-4 h-4 text-[var(--text-dim)] shrink-0" />
                        <button
                          onClick={() => downloadAttachment(att.id)}
                          className="flex-1 min-w-0 text-left text-sm text-[var(--text-bright)] truncate hover:underline underline-offset-2"
                          title={`Download ${att.filename}`}
                        >
                          {att.filename}
                        </button>
                        <span className="text-xs text-[var(--text-dim)] shrink-0">{formatBytes(att.size_bytes)}</span>
                        <button onClick={() => downloadAttachment(att.id)} className="text-[var(--text-dim)] hover:text-blue-400 transition-colors shrink-0" title="Download">
                          <Download className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteAttachment(att.id)} className="text-[var(--text-dim)] hover:text-red-400 transition-colors shrink-0 opacity-0 group-hover:opacity-100" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            <CommentBox issueId={issue.id} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
