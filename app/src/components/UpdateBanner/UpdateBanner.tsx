import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { Download, RefreshCw, X } from 'lucide-react';

type Phase = 'idle' | 'available' | 'downloading' | 'ready' | 'error';

/**
 * Auto-update flow: check GitHub releases once on startup; when a newer
 * version exists, show a dismissible banner. Download runs on demand (not
 * automatically) so metered connections aren't surprised; after install the
 * user confirms the relaunch.
 */
export function UpdateBanner() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState(0); // 0..1, -1 when total unknown
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    // No update server in dev / unsigned local builds — check() just errors;
    // stay silent in that case instead of nagging.
    check()
      .then(u => {
        if (!cancelled && u) {
          setUpdate(u);
          setPhase('available');
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const install = async () => {
    if (!update) return;
    setPhase('downloading');
    setProgress(-1);
    try {
      let total = 0;
      let received = 0;
      await update.downloadAndInstall(e => {
        if (e.event === 'Started') {
          total = e.data.contentLength ?? 0;
        } else if (e.event === 'Progress') {
          received += e.data.chunkLength;
          if (total > 0) setProgress(received / total);
        }
      });
      setPhase('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  };

  if (phase === 'idle') return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] shadow-xl shadow-black/40 text-sm"
      >
        {phase === 'available' && update && (
          <>
            <span className="text-[var(--text)]">
              Version <span className="font-semibold text-[var(--text-bright)]">{update.version}</span> verfügbar
            </span>
            <button
              onClick={install}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-500/25 hover:bg-blue-500/25 font-medium transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Installieren
            </button>
            <button
              onClick={() => setPhase('idle')}
              aria-label="Später"
              className="text-[var(--text-dim)] hover:text-[var(--text-bright)] p-1 rounded-md hover:bg-white/[0.06] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        {phase === 'downloading' && (
          <>
            <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
            <span className="text-[var(--text)]">
              Update wird geladen{progress >= 0 ? ` — ${Math.round(progress * 100)}%` : '…'}
            </span>
          </>
        )}

        {phase === 'ready' && (
          <>
            <span className="text-[var(--text)]">Update installiert.</span>
            <button
              onClick={() => relaunch().catch(() => {})}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/25 hover:bg-emerald-500/25 font-medium transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Neu starten
            </button>
            <button
              onClick={() => setPhase('idle')}
              aria-label="Später neu starten"
              className="text-[var(--text-dim)] hover:text-[var(--text-bright)] p-1 rounded-md hover:bg-white/[0.06] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        {phase === 'error' && (
          <>
            <span className="text-red-400">Update fehlgeschlagen: {error}</span>
            <button
              onClick={() => setPhase('idle')}
              aria-label="Schließen"
              className="text-[var(--text-dim)] hover:text-[var(--text-bright)] p-1 rounded-md hover:bg-white/[0.06] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
