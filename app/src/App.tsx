import { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { listen } from '@tauri-apps/api/event';
import { MailPlus, Sun, Moon } from 'lucide-react';
import { useIssueStore } from './stores/issueStore';
import { IssueList } from './components/IssueList/IssueList';
import { IssueDetail } from './components/IssueDetail/IssueDetail';
import { NewIssueForm } from './components/NewIssueForm/NewIssueForm';
import { QuickComposer } from './components/QuickComposer/QuickComposer';
import { ErrorToast } from './components/ErrorToast/ErrorToast';
import { parseEmailFile, base64ToBytes, guessTitle, type EmailMeta, type ParsedEmail } from './lib/emailParse';

interface Draft {
  title: string;
  body: string;
  meta: EmailMeta | null;
}

const EMAIL_FILE_RE = /\.(eml|msg)$/i;

type Theme = 'light' | 'dark';

// Initial value matches the pre-paint script in index.html (stored choice → OS pref).
function initialTheme(): Theme {
  return (document.documentElement.getAttribute('data-theme') as Theme) || 'dark';
}

export default function App() {
  const { loadIssues, loadLabels, issues } = useIssueStore();
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState<Draft>({ title: '', body: '', meta: null });
  const [dragging, setDragging] = useState(false);
  const [version, setVersion] = useState('');
  const [theme, setTheme] = useState<Theme>(initialTheme);

  // Apply + persist the theme; <html data-theme> drives every CSS variable.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch { /* ignore */ }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  // Single entry point for the full dialog — optionally pre-seeded with a title
  // (inline composer escalation) or a whole email draft (dropped .eml/.msg).
  const openNewIssue = useCallback((title = '') => {
    setDraft({ title, body: '', meta: null });
    setShowNew(true);
  }, []);

  const openFromEmail = useCallback((p: ParsedEmail) => {
    setDraft({
      title: p.subject || guessTitle(p.body),
      body: p.body,
      meta: { fromName: p.fromName, fromEmail: p.fromEmail, to: p.to, date: p.date, subject: p.subject },
    });
    setShowNew(true);
  }, []);

  useEffect(() => {
    loadIssues();
    loadLabels();
  }, []);

  // Quick-add launch paths open the New Issue dialog for unmistakable feedback:
  // a fresh start with --quick-add (pulled once at startup), and a second launch
  // while running (single-instance emits the event).
  useEffect(() => {
    invoke<boolean>('launched_quick_add').then(yes => { if (yes) openNewIssue(); }).catch(() => {});
    const unlisten = listen('quick-add', () => { openNewIssue(); });
    return () => { unlisten.then(f => f()); };
  }, [openNewIssue]);

  // Drag an email file onto the window → read it (Rust) → parse → prefilled draft.
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent(async event => {
      const p = event.payload;
      if (p.type === 'over' || p.type === 'enter') {
        setDragging(true);
      } else if (p.type === 'leave') {
        setDragging(false);
      } else if (p.type === 'drop') {
        setDragging(false);
        const path = p.paths.find(f => EMAIL_FILE_RE.test(f));
        if (!path) return;
        try {
          const b64 = await invoke<string>('read_file_base64', { path });
          const name = path.split(/[\\/]/).pop() ?? path;
          const parsed = await parseEmailFile(name, base64ToBytes(b64));
          if (parsed) openFromEmail(parsed);
        } catch (err) {
          console.error('Failed to import dropped email', err);
        }
      }
    });
    return () => { unlisten.then(f => f()); };
  }, [openFromEmail]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
      openNewIssue();
    }
    // Escape inside the New Issue dialog is handled by the dialog itself so it
    // can persist edits before closing.
  }, [openNewIssue]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const openCount = issues.filter(i => i.status === 'open' || i.status === 'in_progress').length;

  // Mirror the open count onto the tray icon (badge/tooltip).
  useEffect(() => {
    invoke('set_open_count', { count: openCount }).catch(() => {});
  }, [openCount]);

  return (
    <div className="h-screen flex flex-col text-[var(--text)] overflow-hidden select-none">
      <header className="flex items-center gap-4 px-6 py-4 border-b border-[var(--border)] shrink-0 bg-white/[0.015]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-[#fff] text-sm font-bold shadow-lg shadow-blue-500/20 shrink-0">T</div>
          <span className="text-sm font-semibold tracking-tight text-[var(--text-bright)] truncate">ToDoList</span>
          <span className="text-xs text-[var(--text-dim)] bg-white/[0.04] px-2.5 py-1 rounded-full font-medium shrink-0">{openCount} open</span>
        </div>

        <div className="flex-1" />

        {/* Primary action: quick add — right-aligned (Esc/⌘↵ → full dialog) */}
        <QuickComposer onAddDetails={openNewIssue} />

        {/* Edge controls stay pinned to the far right */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          className="grid place-items-center w-8 h-8 shrink-0 rounded-lg text-[var(--text-dim)] hover:text-[var(--text-bright)] bg-white/[0.04] hover:bg-white/[0.08] border border-[var(--border)] transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[360px] shrink-0 border-r border-[var(--border)] overflow-hidden flex flex-col bg-white/[0.012]">
          <IssueList />
        </div>
        <div className="flex-1 overflow-hidden">
          <IssueDetail />
        </div>
      </div>

      {/* Drop-an-email overlay */}
      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--bg,#0b0f14)]/70 backdrop-blur-sm pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.92, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 8 }}
              className="flex flex-col items-center gap-4 px-12 py-10 rounded-3xl border-2 border-dashed border-blue-400/50 bg-blue-500/[0.06]"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-xl shadow-blue-500/30">
                <MailPlus className="w-8 h-8 text-[#fff]" />
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-[var(--text-bright)]">Drop email to create a task</div>
                <div className="text-sm text-[var(--text-dim)] mt-1">.eml or .msg — sender, subject &amp; date are read automatically</div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtle version tag, bottom-right */}
      {version && (
        <span className="fixed bottom-2 right-3 z-50 text-[10px] text-[var(--text-dim)] opacity-40 hover:opacity-70 transition-opacity pointer-events-none select-none tabular-nums">
          v{version}
        </span>
      )}

      <AnimatePresence>
        {showNew && (
          <NewIssueForm
            initialTitle={draft.title}
            initialBody={draft.body}
            initialMeta={draft.meta}
            onClose={() => setShowNew(false)}
          />
        )}
      </AnimatePresence>

      <ErrorToast />
    </div>
  );
}
