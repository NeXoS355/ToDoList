import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Paperclip, FileText, Check, Mail, Clock, Plus, CalendarDays, Repeat, ChevronDown } from 'lucide-react';
import type { Priority, Label, RecurrenceFreq } from '../../lib/types';
import { PRIORITY_CONFIG, formatBytes, inputValueToDueDate, dueDateToInputValue, dueDatePresets, makeRecurrence, parseRecurrence, nextDueDateAfter, RECURRENCE_OPTIONS, startOfToday, clipboardImages } from '../../lib/types';
import { useIssueStore } from '../../stores/issueStore';
import { parseEmailSmart, parseEmailFile, guessTitle, type EmailMeta, type ParsedEmail } from '../../lib/emailParse';
import { MarkdownToolbar } from '../Markdown/MarkdownToolbar';

interface Props {
  onClose: () => void;
  initialTitle?: string;
  initialBody?: string;
  initialMeta?: EmailMeta | null;
}

export function NewIssueForm({ onClose, initialTitle = '', initialBody = '', initialMeta = null }: Props) {
  const { createIssue, updateIssue, setIssueLabels, addAttachment, selectIssue, labels, createLabel } = useIssueStore();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState(''); // <input type="date"> value, '' = none
  const [repeat, setRepeat] = useState<RecurrenceFreq | 'none'>('none');
  const [showDueMenu, setShowDueMenu] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [showRepeatMenu, setShowRepeatMenu] = useState(false);
  const dueMenuRef = useRef<HTMLDivElement>(null);
  const priorityMenuRef = useRef<HTMLDivElement>(null);
  const repeatMenuRef = useRef<HTMLDivElement>(null);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [emailMeta, setEmailMeta] = useState<EmailMeta | null>(initialMeta);
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Close any open picker popover when clicking outside its container.
  useEffect(() => {
    if (!showDueMenu && !showPriorityMenu && !showRepeatMenu) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (dueMenuRef.current && !dueMenuRef.current.contains(t)) setShowDueMenu(false);
      if (priorityMenuRef.current && !priorityMenuRef.current.contains(t)) setShowPriorityMenu(false);
      if (repeatMenuRef.current && !repeatMenuRef.current.contains(t)) setShowRepeatMenu(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showDueMenu, showPriorityMenu, showRepeatMenu]);

  const onFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(prev => [...prev, ...Array.from(e.target.files ?? [])]);
    e.target.value = '';
  };

  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));

  // Fill the form from a parsed email — shared by paste and file import.
  const applyParsed = (parsed: ParsedEmail) => {
    const subject = parsed.subject ?? guessTitle(parsed.body);
    if (!title.trim() && subject) setTitle(subject);
    setBody(prev => (prev.trim() ? prev : parsed.body));
    if (parsed.fromName || parsed.fromEmail || parsed.date || parsed.subject) {
      setEmailMeta({
        fromName: parsed.fromName,
        fromEmail: parsed.fromEmail,
        to: parsed.to,
        date: parsed.date,
        subject: parsed.subject,
      });
    }
  };

  // Smart paste: pasted images become pending attachments; if the clipboard
  // looks like a forwarded/replied email, lift the subject into the title, the
  // message into the description, and the sender/date into the source card.
  // Otherwise fall through to a normal paste.
  const handlePaste = (e: React.ClipboardEvent<HTMLElement>) => {
    const images = clipboardImages(e.clipboardData);
    if (images.length) {
      e.preventDefault();
      setFiles(prev => [...prev, ...images]);
      return;
    }
    const text = e.clipboardData.getData('text/plain') || e.clipboardData.getData('text');
    const html = e.clipboardData.getData('text/html');
    const parsed = parseEmailSmart(text, html);
    if (!parsed) return;
    e.preventDefault();
    applyParsed(parsed);
  };

  const onEmailFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const parsed = await parseEmailFile(file.name, new Uint8Array(await file.arrayBuffer()));
    if (parsed) applyParsed(parsed);
  };

  const sourceArgs = emailMeta
    ? { source: 'email', sourceMeta: { ...emailMeta } as Record<string, unknown> }
    : {};

  const toggleLabel = (id: string) => {
    setSelectedLabels(prev => prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]);
  };

  // Create a label inline and auto-select it on the current draft.
  const handleCreateLabel = async () => {
    const name = newLabel.trim();
    if (!name) return;
    const label = await createLabel(name);
    if (!label) return; // duplicate/error — toast already shown
    setSelectedLabels(prev => [...prev, label.id]);
    setNewLabel('');
  };

  // Due date + recurrence as create/update args. A recurrence needs a due_date
  // anchor, so repeating without an explicit date falls back to today.
  const scheduleArgs = () => ({
    dueDate: inputValueToDueDate(dueDate) ?? (repeat !== 'none' ? startOfToday() : null),
    recurrence: makeRecurrence(repeat),
  });

  // Enter on the title: commit the task immediately and drop into the
  // description so details are optional, not blocking.
  const handleTitleEnter = async () => {
    if (createdId) { textareaRef.current?.focus(); return; }
    if (!title.trim()) return;
    setBusy(true);
    const id = await createIssue({ title: title.trim(), body, priority, labelIds: selectedLabels, ...scheduleArgs(), ...sourceArgs });
    setBusy(false);
    if (!id) return; // create failed — toast already shown, keep the form open
    setCreatedId(id);
    textareaRef.current?.focus();
  };

  // Persist everything and close. Creates the task if Enter was never pressed.
  const finalizeAndClose = async () => {
    if (busy) return;
    setBusy(true);
    let id = createdId;
    if (!id) {
      if (!title.trim()) { onClose(); return; }
      id = await createIssue({ title: title.trim(), body, priority, labelIds: selectedLabels, ...scheduleArgs(), ...sourceArgs });
      if (!id) { setBusy(false); return; } // create failed — keep form open
    } else {
      const sched = scheduleArgs();
      await updateIssue(id, { title: title.trim() || '(untitled)', body, priority, due_date: sched.dueDate, recurrence: sched.recurrence });
      await setIssueLabels(id, selectedLabels);
    }
    for (const f of files) await addAttachment(id, f);
    await selectIssue(id);
    onClose();
  };

  // X / backdrop / Escape: discard before the task exists, save after.
  const handleCloseRequest = () => {
    if (createdId) finalizeAndClose();
    else onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
      onClick={e => e.target === e.currentTarget && handleCloseRequest()}
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); handleCloseRequest(); } }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 12 }}
        transition={{ type: 'spring', stiffness: 600, damping: 34 }}
        className="w-full max-w-2xl bg-[var(--surface)] border border-[var(--border-strong)] rounded-2xl shadow-2xl shadow-black/50 ring-1 ring-white/5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border)]">
          <h2 className="text-base font-semibold tracking-tight text-[var(--text-bright)] flex items-center gap-2">
            {createdId ? 'Edit Issue' : 'New Issue'}
            {createdId && (
              <span className="text-[11px] font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Check className="w-3 h-3" /> Created
              </span>
            )}
          </h2>
          <button onClick={handleCloseRequest} className="text-[var(--text-dim)] hover:text-[var(--text-bright)] hover:bg-white/[0.05] p-1.5 -mr-1.5 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5">
          {/* Title */}
          <div>
            <input
              autoFocus
              type="text"
              placeholder="Issue title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleTitleEnter(); } }}
              onPaste={handlePaste}
              className="w-full bg-white/[0.04] border border-[var(--border)] rounded-xl px-4 py-3 text-[15px] font-medium text-[var(--text-bright)] placeholder:text-[var(--text-dim)] placeholder:font-normal outline-none focus:border-blue-500/40 focus:bg-white/[0.06] focus:ring-4 focus:ring-blue-500/10 transition-all"
            />
            <p className="text-[11px] text-[var(--text-dim)] mt-1.5 px-1">
              {createdId
                ? 'Saved — add details below, then Esc or Done when finished.'
                : 'Press Enter to create the task — details are optional.'}
            </p>
          </div>

          {/* Detected email source */}
          <AnimatePresence>
            {emailMeta && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginTop: -20 }}
                animate={{ opacity: 1, height: 'auto', marginTop: 0 }}
                exit={{ opacity: 0, height: 0, marginTop: -20 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="relative flex items-start gap-3 rounded-xl border border-blue-500/25 bg-gradient-to-br from-blue-500/[0.07] to-violet-500/[0.05] px-3.5 py-3 ring-1 ring-inset ring-white/5">
                  <div className="shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-[#fff] text-sm font-semibold shadow-lg shadow-blue-500/20">
                    {(emailMeta.fromName || emailMeta.fromEmail || '?').trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-blue-300/80">
                      <Mail className="w-3 h-3" /> From email
                    </div>
                    <div className="text-sm text-[var(--text-bright)] font-medium truncate mt-0.5">
                      {emailMeta.fromName || emailMeta.fromEmail || 'Unknown sender'}
                      {emailMeta.fromName && emailMeta.fromEmail && (
                        <span className="text-[var(--text-dim)] font-normal"> · {emailMeta.fromEmail}</span>
                      )}
                    </div>
                    {emailMeta.date && (
                      <div className="flex items-center gap-1.5 text-xs text-[var(--text-dim)] mt-1">
                        <Clock className="w-3 h-3" /> {emailMeta.date}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEmailMeta(null)}
                    title="Remove email source"
                    className="shrink-0 text-[var(--text-dim)] hover:text-red-400 hover:bg-white/[0.06] p-1 -mr-1 -mt-1 rounded-md transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Body */}
          <div>
            <MarkdownToolbar textareaRef={textareaRef} value={body} onChange={setBody} className="mb-1.5" />
            <textarea
              ref={textareaRef}
              placeholder="Description — paste a forwarded email here to auto-fill"
              value={body}
              onChange={e => setBody(e.target.value)}
              onPaste={handlePaste}
              rows={6}
              className="w-full bg-white/[0.04] border border-[var(--border)] rounded-xl px-4 py-3 text-sm leading-relaxed text-[var(--text)] placeholder:text-[var(--text-dim)] outline-none focus:border-blue-500/40 focus:bg-white/[0.06] focus:ring-4 focus:ring-blue-500/10 transition-all resize-none font-mono"
            />
            <p className="text-[11px] text-[var(--text-dim)] mt-1.5 px-1 flex items-center gap-1.5">
              <Mail className="w-3 h-3 shrink-0" />
              Tip: in Outlook hit <span className="text-[var(--text)] font-medium">Forward</span>, then copy &amp; paste — sender, date &amp; subject are detected automatically.
            </p>
          </div>

          {/* Priority · Due date · Repeat — three popover pills in one row */}
          <div className="flex gap-3 items-start">
            {/* Priority */}
            <div ref={priorityMenuRef} className="flex-1 relative">
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-2 block">Priority</label>
              <button
                type="button"
                onClick={() => { setShowPriorityMenu(v => !v); setShowDueMenu(false); setShowRepeatMenu(false); }}
                className="w-full text-xs flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-[var(--border)] hover:bg-white/[0.06] bg-white/[0.04] transition-colors"
              >
                <span className={`w-1.5 h-1.5 rounded-full bg-current ${PRIORITY_CONFIG[priority].color}`} />
                <span className={`font-medium ${PRIORITY_CONFIG[priority].color}`}>{PRIORITY_CONFIG[priority].label}</span>
                <ChevronDown className="w-3 h-3 text-slate-500 ml-auto" />
              </button>
              <AnimatePresence>
                {showPriorityMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute top-full left-0 mt-2 z-20 bg-[var(--surface-2)] border border-[var(--border-strong)] rounded-xl shadow-2xl shadow-black/40 overflow-hidden min-w-40 p-1"
                  >
                    {(Object.keys(PRIORITY_CONFIG) as Priority[]).map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => { setPriority(p); setShowPriorityMenu(false); }}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center gap-2 hover:bg-white/[0.06] transition-colors ${PRIORITY_CONFIG[p].color} ${priority === p ? 'bg-white/[0.05]' : ''}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current" /> {PRIORITY_CONFIG[p].label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Due date */}
            <div ref={dueMenuRef} className="flex-1 relative">
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-2 flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" /> Due date
              </label>
              <button
                type="button"
                onClick={() => { setShowDueMenu(v => !v); setShowPriorityMenu(false); setShowRepeatMenu(false); }}
                className={`w-full text-xs flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-[var(--border)] hover:bg-white/[0.06] bg-white/[0.04] transition-colors ${dueDate ? 'text-[var(--text)]' : 'text-[var(--text-dim)]'}`}
              >
                <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{dueDate ? new Date(inputValueToDueDate(dueDate)!).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Pick a date'}</span>
                <ChevronDown className="w-3 h-3 text-slate-500 ml-auto shrink-0" />
              </button>
              <AnimatePresence>
                {showDueMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute top-full right-0 mt-2 z-20 bg-[var(--surface-2)] border border-[var(--border-strong)] rounded-xl shadow-2xl shadow-black/40 min-w-56 p-2 flex flex-col gap-1.5"
                  >
                    <div className="grid grid-cols-2 gap-1">
                      {dueDatePresets().map(p => {
                        const val = dueDateToInputValue(p.ts);
                        return (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => { setDueDate(val); setShowDueMenu(false); }}
                            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors text-center ${dueDate === val ? 'border-blue-500/50 bg-blue-500/15 text-[var(--text)]' : 'border-[var(--border)] bg-white/[0.04] hover:bg-white/[0.08] hover:border-blue-500/40 text-[var(--text)]'}`}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2 px-0.5">
                      <span className="h-px flex-1 bg-[var(--border)]" />
                      <span className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">or pick a date</span>
                      <span className="h-px flex-1 bg-[var(--border)]" />
                    </div>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={e => { setDueDate(e.target.value); if (e.target.value) e.target.blur(); }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setShowDueMenu(false); } }}
                      className="text-xs bg-white/[0.04] border border-[var(--border)] rounded-lg px-2.5 py-2 text-[var(--text)] outline-none focus:border-blue-500/40 transition-colors"
                    />
                    <div className="flex items-center gap-1 pt-0.5">
                      {dueDate && (
                        <button
                          type="button"
                          onClick={() => { setDueDate(''); setShowDueMenu(false); }}
                          className="px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 hover:bg-white/[0.06] transition-colors text-[var(--text-dim)] hover:text-red-400"
                        >
                          <X className="w-3.5 h-3.5" /> Remove
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowDueMenu(false)}
                        className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-blue-500/15 border border-blue-500/40 text-blue-300 hover:bg-blue-500/25 transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" /> Done
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Repeat */}
            <div ref={repeatMenuRef} className="flex-1 relative">
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-2 flex items-center gap-1.5">
                <Repeat className="w-3.5 h-3.5" /> Repeat
              </label>
              <button
                type="button"
                onClick={() => { setShowRepeatMenu(v => !v); setShowPriorityMenu(false); setShowDueMenu(false); }}
                className={`w-full text-xs flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-[var(--border)] hover:bg-white/[0.06] bg-white/[0.04] transition-colors ${repeat !== 'none' ? 'text-[var(--text)]' : 'text-[var(--text-dim)]'}`}
              >
                <Repeat className={`w-3.5 h-3.5 shrink-0 ${repeat !== 'none' ? 'text-blue-400' : ''}`} />
                <span className="truncate">{RECURRENCE_OPTIONS.find(o => o.value === repeat)?.label}</span>
                <ChevronDown className="w-3 h-3 text-slate-500 ml-auto shrink-0" />
              </button>
              <AnimatePresence>
                {showRepeatMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute top-full right-0 mt-2 z-20 bg-[var(--surface-2)] border border-[var(--border-strong)] rounded-xl shadow-2xl shadow-black/40 overflow-hidden min-w-44 p-1"
                  >
                    {RECURRENCE_OPTIONS.map(o => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => { setRepeat(o.value); setShowRepeatMenu(false); }}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs hover:bg-white/[0.06] transition-colors ${repeat === o.value ? 'text-blue-300 bg-blue-500/10' : 'text-[var(--text)]'}`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Repeat anchors on the due date — show the resulting first/next run. */}
          {repeat !== 'none' && (() => {
            const rec = parseRecurrence(makeRecurrence(repeat));
            const anchor = inputValueToDueDate(dueDate) ?? startOfToday();
            const next = rec ? nextDueDateAfter(anchor, rec, startOfToday()) : anchor;
            return (
              <p className="text-[11px] text-[var(--text-dim)] -mt-1 flex items-center gap-1.5">
                <CalendarDays className="w-3 h-3" />
                {dueDate ? `Starts ${new Date(anchor).toLocaleDateString('de-DE')}` : 'Starts today'} · next on {new Date(next).toLocaleDateString('de-DE')} when done
              </p>
            );
          })()}

          {/* Labels */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-2 block">Labels</label>
            <div className="flex gap-2 flex-wrap items-center">
              {labels.map((l: Label) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => toggleLabel(l.id)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-all`}
                  style={{
                    color: selectedLabels.includes(l.id) ? l.color : '#64748b',
                    borderColor: selectedLabels.includes(l.id) ? `${l.color}60` : 'rgba(255,255,255,0.1)',
                    backgroundColor: selectedLabels.includes(l.id) ? `${l.color}20` : 'transparent',
                  }}
                >
                  {l.name}
                </button>
              ))}
              {/* Inline create — Enter or the + button adds and selects it. */}
              <div className="flex items-center gap-1 rounded-full border border-dashed border-white/15 focus-within:border-blue-500/40 pl-2.5 pr-1 py-0.5 transition-colors">
                <input
                  type="text"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateLabel(); } }}
                  placeholder="New label"
                  className="text-xs bg-transparent text-[var(--text)] placeholder:text-[var(--text-dim)] outline-none w-20"
                />
                <button
                  type="button"
                  onClick={handleCreateLabel}
                  disabled={!newLabel.trim()}
                  title="Create label"
                  className="shrink-0 text-[var(--text-dim)] hover:text-emerald-400 disabled:opacity-30 disabled:hover:text-[var(--text-dim)] transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Pending attachments */}
          {files.length > 0 && (
            <div className="flex flex-col gap-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2.5 text-sm bg-white/[0.04] border border-[var(--border)] rounded-xl px-3 py-2">
                  <FileText className="w-4 h-4 text-[var(--text-dim)] shrink-0" />
                  <span className="flex-1 truncate text-[var(--text)]">{f.name}</span>
                  <span className="text-xs text-[var(--text-dim)] shrink-0">{formatBytes(f.size)}</span>
                  <button type="button" onClick={() => removeFile(i)} className="text-[var(--text-dim)] hover:text-red-400 transition-colors shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <input ref={fileInputRef} type="file" multiple onChange={onFilesPicked} className="hidden" />
          <input ref={emailInputRef} type="file" accept=".eml,.msg" onChange={onEmailFilePicked} className="hidden" />
          <div className="flex justify-between items-center pt-2 mt-1 border-t border-[var(--border)]">
            <div className="flex items-center gap-4 mt-3">
              <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs text-[var(--text-dim)] hover:text-[var(--text-bright)] flex items-center gap-1.5 transition-colors">
                <Paperclip className="w-3.5 h-3.5" /> Attach file
              </button>
              <button type="button" onClick={() => emailInputRef.current?.click()} className="text-xs text-[var(--text-dim)] hover:text-[var(--text-bright)] flex items-center gap-1.5 transition-colors">
                <Mail className="w-3.5 h-3.5" /> Import email
              </button>
            </div>
            <div className="flex gap-2 mt-3">
              {!createdId && (
                <button type="button" onClick={onClose} className="text-sm px-4 py-2 rounded-xl text-[var(--text-dim)] hover:text-[var(--text-bright)] hover:bg-white/[0.05] transition-colors">
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={finalizeAndClose}
                disabled={busy || (!createdId && !title.trim())}
                className="text-sm px-5 py-2 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-[#fff] font-medium shadow-lg shadow-emerald-600/25 ring-1 ring-inset ring-white/15 transition-all active:scale-[0.97]"
              >
                {createdId ? 'Done' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
