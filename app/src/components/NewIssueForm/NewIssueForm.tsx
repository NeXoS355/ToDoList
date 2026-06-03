import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Paperclip, FileText } from 'lucide-react';
import type { Priority, Label } from '../../lib/types';
import { PRIORITY_CONFIG, formatBytes } from '../../lib/types';
import { useIssueStore } from '../../stores/issueStore';

interface Props {
  onClose: () => void;
}

export function NewIssueForm({ onClose }: Props) {
  const { createIssue, addAttachment, labels } = useIssueStore();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(prev => [...prev, ...Array.from(e.target.files ?? [])]);
    e.target.value = '';
  };

  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text');
    if (!text) return;

    // Detect Outlook-style paste: "Von: ... Betreff: ..."
    const subjectMatch = text.match(/(?:Betreff|Subject):\s*(.+)/i);
    const bodyStart = text.match(/(?:\n\n|\r\n\r\n)([\s\S]+)/);
    if (subjectMatch && !title) {
      e.preventDefault();
      setTitle(subjectMatch[1].trim());
      setBody(bodyStart ? bodyStart[1].trim() : text);
    }
  };

  const toggleLabel = (id: string) => {
    setSelectedLabels(prev => prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const newId = await createIssue({ title: title.trim(), body, priority, labelIds: selectedLabels });
    for (const f of files) await addAttachment(newId, f);
    setSaving(false);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 12 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="w-full max-w-2xl bg-[var(--surface)] border border-[var(--border-strong)] rounded-2xl shadow-2xl shadow-black/50 ring-1 ring-white/5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border)]">
          <h2 className="text-base font-semibold tracking-tight text-[var(--text-bright)]">New Issue</h2>
          <button onClick={onClose} className="text-[var(--text-dim)] hover:text-[var(--text-bright)] hover:bg-white/[0.05] p-1.5 -mr-1.5 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
          {/* Title */}
          <input
            autoFocus
            type="text"
            placeholder="Issue title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full bg-white/[0.04] border border-[var(--border)] rounded-xl px-4 py-3 text-[15px] font-medium text-[var(--text-bright)] placeholder:text-[var(--text-dim)] placeholder:font-normal outline-none focus:border-blue-500/40 focus:bg-white/[0.06] focus:ring-4 focus:ring-blue-500/10 transition-all"
          />

          {/* Body */}
          <textarea
            ref={textareaRef}
            placeholder="Description (paste an email here to auto-fill title & body)"
            value={body}
            onChange={e => setBody(e.target.value)}
            onPaste={handlePaste}
            rows={6}
            className="w-full bg-white/[0.04] border border-[var(--border)] rounded-xl px-4 py-3 text-sm leading-relaxed text-[var(--text)] placeholder:text-[var(--text-dim)] outline-none focus:border-blue-500/40 focus:bg-white/[0.06] focus:ring-4 focus:ring-blue-500/10 transition-all resize-none font-mono"
          />

          {/* Priority */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-2 block">Priority</label>
            <div className="flex gap-2">
              {(Object.keys(PRIORITY_CONFIG) as Priority[]).map(p => {
                const pc = PRIORITY_CONFIG[p];
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`flex-1 text-xs py-2.5 rounded-xl border transition-all font-medium ${
                      priority === p
                        ? `${pc.color} ${pc.bg} border-current/30 ring-1 ring-inset ring-current/20`
                        : 'text-[var(--text-dim)] border-[var(--border)] hover:bg-white/[0.04] hover:text-[var(--text)]'
                    }`}
                  >
                    {pc.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Labels */}
          {labels.length > 0 && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-2 block">Labels</label>
              <div className="flex gap-2 flex-wrap">
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
              </div>
            </div>
          )}

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
          <div className="flex justify-between items-center pt-2 mt-1 border-t border-[var(--border)]">
            <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs text-[var(--text-dim)] hover:text-[var(--text-bright)] flex items-center gap-1.5 transition-colors mt-3">
              <Paperclip className="w-3.5 h-3.5" /> Attach file
            </button>
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={onClose} className="text-sm px-4 py-2 rounded-xl text-[var(--text-dim)] hover:text-[var(--text-bright)] hover:bg-white/[0.05] transition-colors">
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim() || saving}
                className="text-sm px-5 py-2 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium shadow-lg shadow-emerald-600/25 ring-1 ring-inset ring-white/15 transition-all active:scale-[0.97]"
              >
                {saving ? 'Saving...' : 'Submit'}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
