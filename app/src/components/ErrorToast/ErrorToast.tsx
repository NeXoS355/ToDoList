import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { useIssueStore } from '../../stores/issueStore';

/**
 * Surfaces the store's last error as a dismissable toast (bottom-center) so
 * failed DB/IO operations are visible instead of silent. Auto-hides after 6s.
 */
export function ErrorToast() {
  const error = useIssueStore(s => s.error);
  const clearError = useIssueStore(s => s.clearError);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(clearError, 6000);
    return () => clearTimeout(t);
  }, [error, clearError]);

  return (
    <AnimatePresence>
      {error && (
        <motion.div
          role="alert"
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ duration: 0.15 }}
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] flex items-start gap-3 max-w-md px-4 py-3 rounded-xl border border-red-500/30 bg-red-950/80 backdrop-blur-md shadow-2xl shadow-black/50 ring-1 ring-inset ring-white/5"
        >
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span className="text-sm text-red-100/90 leading-snug flex-1 break-words">{error}</span>
          <button
            onClick={clearError}
            title="Dismiss"
            className="shrink-0 text-red-200/60 hover:text-red-100 hover:bg-white/[0.08] p-0.5 -mr-1 -mt-0.5 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
