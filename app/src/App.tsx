import { useEffect, useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Plus, RefreshCw } from 'lucide-react';
import { useIssueStore } from './stores/issueStore';
import { IssueList } from './components/IssueList/IssueList';
import { IssueDetail } from './components/IssueDetail/IssueDetail';
import { NewIssueForm } from './components/NewIssueForm/NewIssueForm';

export default function App() {
  const { loadIssues, loadLabels, issues } = useIssueStore();
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    loadIssues();
    loadLabels();
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
      setShowNew(true);
    }
    if (e.key === 'Escape') setShowNew(false);
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const openCount = issues.filter(i => i.status === 'open' || i.status === 'in_progress').length;

  return (
    <div className="h-screen flex flex-col text-[var(--text)] overflow-hidden select-none">
      <header className="flex items-center gap-4 px-6 py-4 border-b border-[var(--border)] shrink-0 bg-white/[0.015]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-blue-500/20">T</div>
          <span className="text-sm font-semibold tracking-tight text-[var(--text-bright)]">ToDoList</span>
        </div>
        <span className="text-xs text-[var(--text-dim)] bg-white/[0.04] px-2.5 py-1 rounded-full font-medium">{openCount} open</span>
        <div className="flex-1" />
        <button onClick={loadIssues} className="text-[var(--text-dim)] hover:text-[var(--text-bright)] transition-colors p-2 rounded-lg hover:bg-white/[0.05]">
          <RefreshCw className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 text-sm pl-3.5 pr-3 py-2 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-medium shadow-lg shadow-emerald-600/25 ring-1 ring-inset ring-white/15 transition-all active:scale-[0.97]"
        >
          <Plus className="w-4 h-4" />
          New Issue
          <kbd className="text-[10px] opacity-70 bg-black/25 px-1.5 py-0.5 rounded-md font-sans">N</kbd>
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

      <AnimatePresence>
        {showNew && <NewIssueForm onClose={() => setShowNew(false)} />}
      </AnimatePresence>
    </div>
  );
}
