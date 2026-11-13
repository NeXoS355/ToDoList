import { create } from 'zustand';

// Dragging a task row onto a folder tab. Built on pointer events rather than
// HTML5 drag-and-drop: the native file drop (Tauri on Linux, the window-level
// file handler on Windows) would otherwise interfere, and pointer events behave
// the same on every platform.
//
// Drop targets mark themselves with `data-folder-drop="<folder id>"`, or
// `data-folder-drop=""` for "no folder".

/** Distance (px) the pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD = 5;

interface TaskDragState {
  issueId: string | null;
  title: string;
  x: number;
  y: number;
  /** Folder under the pointer: id, '' for "no folder", null for none. */
  over: string | null;
}

export const useTaskDrag = create<TaskDragState>(() => ({
  issueId: null, title: '', x: 0, y: 0, over: null,
}));

function targetAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-folder-drop]');
  return el ? el.dataset.folderDrop ?? '' : null;
}

/**
 * Start tracking a possible drag from a pointerdown on a task row. Calls
 * `onDrop(folderId)` when released over a folder target ('' = no folder) and
 * returns a function telling whether the press turned into a drag (so the
 * row can ignore the click that follows).
 */
export function beginTaskDrag(
  e: React.PointerEvent,
  issue: { id: string; title: string },
  onDrop: (folderId: string | null) => void,
): () => boolean {
  let dragged = false;
  if (e.button !== 0) return () => false;
  const startX = e.clientX;
  const startY = e.clientY;

  const end = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey);
    document.body.style.cursor = '';
    useTaskDrag.setState({ issueId: null, over: null });
  };
  const onMove = (ev: PointerEvent) => {
    if (!dragged) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
      dragged = true;
      document.body.style.cursor = 'grabbing';
    }
    useTaskDrag.setState({ issueId: issue.id, title: issue.title, x: ev.clientX, y: ev.clientY, over: targetAt(ev.clientX, ev.clientY) });
  };
  const onUp = (ev: PointerEvent) => {
    const target = dragged ? targetAt(ev.clientX, ev.clientY) : null;
    end();
    if (target !== null) onDrop(target === '' ? null : target);
  };
  const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') end(); };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);
  return () => dragged;
}
