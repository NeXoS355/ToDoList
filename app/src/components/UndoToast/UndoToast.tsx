import { AnimatePresence, motion } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { useIssueStore } from '../../stores/issueStore';

/**
 * Shown while a deleted issue is still restorable (the store defers the actual
 * DB delete). Disappears on its own when the undo window closes — visibility
 * is driven entirely by `pendingUndo`, no local timer needed.
 */
export function UndoToast() {
  const pendingUndo = useIssueStore(s => s.pendingUndo);
  const undoDelete = useIssueStore(s => s.undoDelete);

  return (
    <AnimatePresence>
      {pendingUndo && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ duration: 0.15 }}
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[69] flex items-center gap-3 max-w-md px-4 py-3 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] shadow-2xl shadow-black/50 ring-1 ring-inset ring-white/5"
        >
          <Trash2 className="w-4 h-4 text-[var(--text-dim)] shrink-0" />
          <span className="text-sm text-[var(--text)] leading-snug truncate">
            {pendingUndo.issues.length === 1
              ? <>Deleted “{pendingUndo.issues[0].title}”</>
              : <>Deleted {pendingUndo.issues.length} issues</>}
          </span>
          <button
            onClick={undoDelete}
            className="shrink-0 text-sm font-medium text-blue-400 hover:text-blue-300 px-2 py-0.5 -mr-1 rounded-md hover:bg-white/[0.06] transition-colors"
          >
            Undo
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
