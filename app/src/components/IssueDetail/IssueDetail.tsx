import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { Trash2, CircleDot, Clock, CircleCheck, XCircle, ChevronDown, Paperclip, FileText, Download, ExternalLink, Mail, Plus, Check, X, Tag } from 'lucide-react';
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
  const { issues, selectedId, updateIssue, deleteIssue, attachments, downloadAttachment, openAttachment, labels, setIssueLabels, createLabel } = useIssueStore();
  const issue = issues.find(i => i.id === selectedId) ?? null;
  // Issue-level files only; comment attachments render inside their comment.
  const issueAttachments = attachments.filter(a => a.comment_id == null);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [showLabelMenu, setShowLabelMenu] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const priorityMenuRef = useRef<HTMLDivElement>(null);
  const labelMenuRef = useRef<HTMLDivElement>(null);

  // Close any open picker when clicking outside its container.
  useEffect(() => {
    if (!showStatusMenu && !showPriorityMenu && !showLabelMenu) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (statusMenuRef.current && !statusMenuRef.current.contains(t)) setShowStatusMenu(false);
      if (priorityMenuRef.current && !priorityMenuRef.current.contains(t)) setShowPriorityMenu(false);
      if (labelMenuRef.current && !labelMenuRef.current.contains(t)) setShowLabelMenu(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showStatusMenu, showPriorityMenu, showLabelMenu]);

  // Inline title/body editing — click either to edit, commit on blur/Enter.
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingBody, setEditingBody] = useState(false);
  const [bodyDraft, setBodyDraft] = useState('');

  // Drop edit mode / open menus when switching issues so nothing leaks across.
  useEffect(() => {
    setEditingTitle(false);
    setEditingBody(false);
    setShowStatusMenu(false);
    setShowPriorityMenu(false);
    setShowLabelMenu(false);
    setNewLabel('');
  }, [selectedId]);

  const startTitleEdit = () => { if (issue) { setTitleDraft(issue.title); setEditingTitle(true); } };
  const commitTitle = async () => {
    setEditingTitle(false);
    if (!issue) return;
    const t = titleDraft.trim();
    if (t && t !== issue.title) await updateIssue(issue.id, { title: t });
  };

  const startBodyEdit = () => { if (issue) { setBodyDraft(issue.body); setEditingBody(true); } };
  const commitBody = async () => {
    setEditingBody(false);
    if (!issue) return;
    if (bodyDraft !== issue.body) await updateIssue(issue.id, { body: bodyDraft });
  };

  const handleStatusChange = async (status: Status) => {
    if (!issue) return;
    setShowStatusMenu(false);
    await updateIssue(issue.id, { status });
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

  // Add/remove a label on the current issue.
  const toggleIssueLabel = async (labelId: string) => {
    if (!issue) return;
    const current = issue.labels?.map(l => l.id) ?? [];
    const next = current.includes(labelId) ? current.filter(id => id !== labelId) : [...current, labelId];
    await setIssueLabels(issue.id, next);
  };

  // Create a label inline and attach it to the current issue.
  const handleCreateLabel = async () => {
    if (!issue) return;
    const name = newLabel.trim();
    if (!name) return;
    const label = await createLabel(name);
    if (!label) return; // duplicate/error — toast already shown
    setNewLabel('');
    await setIssueLabels(issue.id, [...(issue.labels?.map(l => l.id) ?? []), label.id]);
  };

  return (
    <AnimatePresence mode="wait">
      {!issue ? (
        <motion.div
          key="empty"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
          className="flex flex-col items-center justify-center h-full text-slate-600 gap-3"
        >
          <CircleDot className="w-12 h-12 opacity-20" />
          <span className="text-sm">Select an issue</span>
        </motion.div>
      ) : (
        <motion.div
          key={issue.id}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 12 }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
          className="flex flex-col h-full overflow-y-auto relative"
        >
          {/* Header */}
          <div className="px-8 pt-7 pb-5 border-b border-[var(--border)] flex items-start gap-3">
            <div className="flex-1">
              {editingTitle ? (
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commitTitle(); }
                    else if (e.key === 'Escape') { e.preventDefault(); setEditingTitle(false); }
                  }}
                  className="w-full bg-white/[0.04] border border-blue-500/40 rounded-lg px-2 py-1 -mx-2 -my-1 text-xl font-semibold leading-snug tracking-tight text-[var(--text-bright)] outline-none focus:bg-white/[0.06] focus:ring-4 focus:ring-blue-500/10"
                />
              ) : (
                <h2
                  onClick={startTitleEdit}
                  title="Click to edit"
                  className={`text-xl font-semibold leading-snug tracking-tight cursor-text rounded-lg px-2 py-1 -mx-2 -my-1 hover:bg-white/[0.04] transition-colors ${issue.status === 'done' || issue.status === 'cancelled' ? 'text-[var(--text-dim)] line-through' : 'text-[var(--text-bright)]'}`}
                >
                  {issue.title}
                </h2>
              )}
              <div className="flex items-center gap-2.5 mt-3 flex-wrap">
                {/* Status picker */}
                <div ref={statusMenuRef} className="relative">
                  <button
                    onClick={() => { setShowStatusMenu(v => !v); setShowPriorityMenu(false); setShowLabelMenu(false); }}
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
                <div ref={priorityMenuRef} className="relative">
                  <button
                    onClick={() => { setShowPriorityMenu(v => !v); setShowStatusMenu(false); setShowLabelMenu(false); }}
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

                <span className="text-xs text-[var(--text-dim)] ml-0.5">opened {formatDate(issue.created_at)}</span>
              </div>
            </div>
            <button onClick={handleDelete} title="Delete issue" className="text-[var(--text-dim)] hover:text-red-400 hover:bg-red-500/10 p-2 -mr-2 rounded-lg transition-colors shrink-0">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Labels */}
          <div className="px-8 py-4 border-b border-[var(--border)] flex items-center gap-2 flex-wrap">
            {issue.labels?.map(l => (
              <span key={l.id} className="text-xs pl-2.5 pr-1.5 py-1 rounded-full border inline-flex items-center gap-1" style={{ color: l.color, borderColor: `${l.color}33`, backgroundColor: `${l.color}12` }}>
                {l.name}
                <button onClick={() => toggleIssueLabel(l.id)} title="Remove label" className="opacity-50 hover:opacity-100 transition-opacity">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {/* Add label */}
            <div ref={labelMenuRef} className="relative">
              <button
                onClick={() => { setShowLabelMenu(v => !v); setShowStatusMenu(false); setShowPriorityMenu(false); }}
                className="text-xs flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-white/15 text-[var(--text-dim)] hover:text-[var(--text-bright)] hover:bg-white/[0.04] transition-colors"
              >
                <Tag className="w-3 h-3" /> Label
              </button>
              <AnimatePresence>
                {showLabelMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute top-full left-0 mt-2 z-20 bg-[var(--surface-2)] border border-[var(--border-strong)] rounded-xl shadow-2xl shadow-black/40 overflow-hidden min-w-52 p-1"
                  >
                    <div className="max-h-56 overflow-y-auto">
                      {labels.map(l => {
                        const active = issue.labels?.some(x => x.id === l.id) ?? false;
                        return (
                          <button key={l.id} onClick={() => toggleIssueLabel(l.id)} className="w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center gap-2 hover:bg-white/[0.06] transition-colors text-[var(--text)]">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                            <span className="flex-1 truncate">{l.name}</span>
                            {active && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                    {/* Inline create */}
                    <div className="flex items-center gap-1 mt-1 pt-1 border-t border-[var(--border)] px-1">
                      <input
                        type="text"
                        value={newLabel}
                        onChange={e => setNewLabel(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateLabel(); } }}
                        placeholder="New label"
                        className="flex-1 min-w-0 text-xs bg-transparent text-[var(--text)] placeholder:text-[var(--text-dim)] outline-none px-1.5 py-1"
                      />
                      <button
                        type="button"
                        onClick={handleCreateLabel}
                        disabled={!newLabel.trim()}
                        title="Create label"
                        className="shrink-0 text-[var(--text-dim)] hover:text-emerald-400 disabled:opacity-30 disabled:hover:text-[var(--text-dim)] transition-colors p-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
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
            {editingBody ? (
              <textarea
                autoFocus
                value={bodyDraft}
                onChange={e => setBodyDraft(e.target.value)}
                onBlur={commitBody}
                onKeyDown={e => {
                  if (e.key === 'Escape') { e.preventDefault(); setEditingBody(false); }
                  else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commitBody(); }
                }}
                rows={Math.max(4, bodyDraft.split('\n').length + 1)}
                placeholder="Add a description… (Esc to cancel, ⌘/Ctrl+Enter to save)"
                className="w-full bg-white/[0.04] border border-blue-500/40 rounded-xl px-4 py-3 text-[15px] leading-relaxed text-[var(--text)] placeholder:text-[var(--text-dim)] outline-none focus:bg-white/[0.06] focus:ring-4 focus:ring-blue-500/10 resize-none transition-all"
              />
            ) : issue.body ? (
              <p
                onClick={startBodyEdit}
                title="Click to edit"
                className="text-[15px] text-[var(--text)] whitespace-pre-wrap leading-relaxed cursor-text rounded-lg -mx-2 px-2 py-1 hover:bg-white/[0.03] transition-colors"
              >
                {issue.body}
              </p>
            ) : (
              <p
                onClick={startBodyEdit}
                title="Click to add a description"
                className="text-sm text-[var(--text-dim)] italic cursor-text rounded-lg -mx-2 px-2 py-1 hover:bg-white/[0.03] transition-colors"
              >
                No description.
              </p>
            )}

            {/* Attachments — added at creation only; later files go via comments. */}
            {issueAttachments.length > 0 && (
              <div className="mt-8 pt-6 border-t border-[var(--border)]">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-4 flex items-center gap-2">
                  <Paperclip className="w-4 h-4" />
                  Attachments <span className="text-[var(--text-dim)]/70">· {issueAttachments.length}</span>
                </h3>
                <div className="flex flex-col gap-1.5">
                  {issueAttachments.map(att => (
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
              </div>
            )}

            <CommentBox issueId={issue.id} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
