import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, X } from 'lucide-react';
import { useIssueStore } from '../../stores/issueStore';

/**
 * Green counterpart to ErrorToast: surfaces the store's one-shot success
 * message (e.g. "file attached") bottom-center. Auto-hides after 4s.
 */
export function NoticeToast() {
  const notice = useIssueStore(s => s.notice);
  const clearNotice = useIssueStore(s => s.clearNotice);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(clearNotice, 4000);
    return () => clearTimeout(t);
  }, [notice, clearNotice]);

  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ duration: 0.15 }}
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[68] flex items-start gap-3 max-w-md px-4 py-3 rounded-xl border border-emerald-500/30 bg-emerald-950/80 backdrop-blur-md shadow-2xl shadow-black/50 ring-1 ring-inset ring-white/5"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span className="text-sm text-emerald-100/90 leading-snug flex-1 break-words">{notice}</span>
          <button
            onClick={clearNotice}
            title="Dismiss"
            className="shrink-0 text-emerald-200/60 hover:text-emerald-100 hover:bg-white/[0.08] p-0.5 -mr-1 -mt-0.5 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
