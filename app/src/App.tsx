import { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { listen } from '@tauri-apps/api/event';
import { MailPlus, Sun, Moon, Monitor } from 'lucide-react';
import { useIssueStore } from './stores/issueStore';
import { IssueList } from './components/IssueList/IssueList';
import { IssueDetail } from './components/IssueDetail/IssueDetail';
import { NewIssueForm } from './components/NewIssueForm/NewIssueForm';
import { QuickComposer } from './components/QuickComposer/QuickComposer';
import { ErrorToast } from './components/ErrorToast/ErrorToast';
import { NoticeToast } from './components/NoticeToast/NoticeToast';
import { UndoToast } from './components/UndoToast/UndoToast';
import { UpdateBanner } from './components/UpdateBanner/UpdateBanner';
import { parseEmailFile, base64ToBytes, guessTitle, type EmailMeta, type ParsedEmail } from './lib/emailParse';
import { guessMime } from './lib/types';

interface Draft {
  title: string;
  body: string;
  meta: EmailMeta | null;
}

const EMAIL_FILE_RE = /\.(eml|msg)$/i;

type Theme = 'light' | 'dark' | 'system';

const THEME_CYCLE: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' };
const THEME_LABEL: Record<Theme, string> = { light: 'Light', dark: 'Dark', system: 'System' };

// Stored choice; "system" is the first-start default and tracks the OS
// preference live. The pre-paint script in index.html resolves the same way.
function initialTheme(): Theme {
  try {
    const t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark' || t === 'system') return t;
  } catch { /* ignore */ }
  return 'system';
}

function resolveTheme(t: Theme): 'light' | 'dark' {
  return t === 'system'
    ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : t;
}

export default function App() {
  const { loadIssues, loadLabels, issues, selectedId } = useIssueStore();
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState<Draft>({ title: '', body: '', meta: null });
  const [dragging, setDragging] = useState(false);
  const [version, setVersion] = useState('');
  const [theme, setTheme] = useState<Theme>(initialTheme);

  // Apply + persist the theme; <html data-theme> drives every CSS variable.
  // With "system" selected, follow OS preference changes live.
  useEffect(() => {
    const apply = () => document.documentElement.setAttribute('data-theme', resolveTheme(theme));
    apply();
    try { localStorage.setItem('theme', theme); } catch { /* ignore */ }
    if (theme !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(t => THEME_CYCLE[t]);
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
        const emailPath = p.paths.find(f => EMAIL_FILE_RE.test(f));
        const otherPaths = p.paths.filter(f => !EMAIL_FILE_RE.test(f));
        try {
          if (emailPath) {
            const b64 = await invoke<string>('read_file_base64', { path: emailPath });
            const name = emailPath.split(/[\\/]/).pop() ?? emailPath;
            const parsed = await parseEmailFile(name, base64ToBytes(b64));
            if (parsed) openFromEmail(parsed);
          }
          if (otherPaths.length) {
            // Non-email files attach to the currently open issue; without one
            // there is no sane target, so say so instead of dropping silently.
            const { selectedId, addAttachment } = useIssueStore.getState();
            if (selectedId) {
              const attached: string[] = [];
              for (const path of otherPaths) {
                const b64 = await invoke<string>('read_file_base64', { path });
                const name = path.split(/[\\/]/).pop() ?? path;
                const bytes = base64ToBytes(b64);
                const id = await addAttachment(selectedId, new File([bytes], name, { type: guessMime(name) }));
                if (id) attached.push(name);
              }
              if (attached.length) {
                useIssueStore.setState({
                  notice: attached.length === 1 ? `"${attached[0]}" attached.` : `${attached.length} files attached.`,
                });
              }
            } else if (!emailPath) {
              useIssueStore.setState({ error: 'Select an issue first to attach files — or drop a .eml/.msg email to create a task.' });
            }
          }
        } catch (err) {
          console.error('Failed to handle dropped file', err);
          // Surface it — a silent drop failure looks like the app ignored the user.
          useIssueStore.setState({ error: `Could not import dropped file: ${err instanceof Error ? err.message : String(err)}` });
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
          aria-label={`Theme: ${THEME_LABEL[theme]} — switch to ${THEME_LABEL[THEME_CYCLE[theme]]}`}
          title={`Theme: ${THEME_LABEL[theme]} (click for ${THEME_LABEL[THEME_CYCLE[theme]]})`}
          className="grid place-items-center w-8 h-8 shrink-0 rounded-lg text-[var(--text-dim)] hover:text-[var(--text-bright)] bg-white/[0.04] hover:bg-white/[0.08] border border-[var(--border)] transition-colors"
        >
          {theme === 'light' ? <Sun className="w-4 h-4" /> : theme === 'dark' ? <Moon className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
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
                <div className="text-lg font-semibold text-[var(--text-bright)]">
                  {selectedId ? 'Drop email or files' : 'Drop email to create a task'}
                </div>
                <div className="text-sm text-[var(--text-dim)] mt-1">
                  {selectedId
                    ? '.eml/.msg creates a task — other files attach to the open issue'
                    : '.eml or .msg — sender, subject & date are read automatically'}
                </div>
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
      <NoticeToast />
      <UndoToast />
      <UpdateBanner />
    </div>
  );
}
