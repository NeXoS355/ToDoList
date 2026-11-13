import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Folder as FolderIcon, FolderPlus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useIssueStore } from '../../stores/issueStore';
import { useTaskDrag } from '../../lib/taskDrag';
import type { Folder } from '../../lib/types';

const isActive = (s: string) => s === 'open' || s === 'in_progress';

/** Inline text field used for both "new folder" and "rename". */
function FolderNameInput({ initial = '', onSubmit, onCancel }: {
  initial?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false); // Enter and the following blur must not both fire
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save && value.trim() && value.trim() !== initial) onSubmit(value.trim());
    else onCancel();
  };
  return (
    <input
      autoFocus
      value={value}
      onChange={e => setValue(e.target.value)}
      onFocus={e => e.target.select()}
      onBlur={() => finish(true)}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      }}
      placeholder="Folder name"
      className="w-32 text-xs px-2.5 py-1.5 rounded-lg bg-white/[0.06] border border-blue-500/40 text-[var(--text-bright)] placeholder:text-[var(--text-dim)] outline-none focus:ring-4 focus:ring-blue-500/10"
    />
  );
}

/**
 * Optional folders. With none, this is a single quiet "New folder" button; once
 * folders exist it becomes a tab strip that narrows the list. The folder in
 * view also receives newly created tasks (handled in the store).
 */
export function FolderBar({ creating, setCreating }: { creating: boolean; setCreating: (v: boolean) => void }) {
  const { folders, issues, filter, setFilter, createFolder, renameFolder, deleteFolder } = useIssueStore();
  // While a task is dragged, tabs become drop targets ('' = "no folder").
  const dragging = useTaskDrag(s => s.issueId !== null);
  const dragOver = useTaskDrag(s => s.over);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuId) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuId(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuId]);

  const openCount = (folderId: string | null) =>
    issues.filter(i => isActive(i.status) && (folderId === null || i.folder_id === folderId)).length;

  const handleCreate = async (name: string) => {
    setCreating(false);
    const folder = await createFolder(name);
    if (folder) setFilter({ folderId: folder.id }); // jump into the new folder
  };

  const tabClass = (active: boolean, dropId: string) =>
    `group/tab relative text-xs pl-2.5 pr-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors ${
      dragging && dragOver === dropId
        ? 'bg-blue-500/25 text-blue-200 ring-2 ring-inset ring-blue-400/60'
        : dragging
          ? 'text-[var(--text)] ring-1 ring-inset ring-white/15'
          : active
            ? 'bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-500/25'
            : 'text-[var(--text-dim)] hover:text-[var(--text-bright)] hover:bg-white/[0.04]'
    }`;

  // No folders yet: stay out of the way.
  if (folders.length === 0) {
    return creating ? (
      <div className="px-4 pt-3">
        <FolderNameInput onSubmit={handleCreate} onCancel={() => setCreating(false)} />
      </div>
    ) : null;
  }

  const renderTab = (f: Folder) => {
    const active = filter.folderId === f.id;
    if (renamingId === f.id) {
      return (
        <FolderNameInput
          key={f.id}
          initial={f.name}
          onSubmit={name => { setRenamingId(null); renameFolder(f.id, name); }}
          onCancel={() => setRenamingId(null)}
        />
      );
    }
    const count = openCount(f.id);
    return (
      <div key={f.id} className="relative" ref={menuId === f.id ? menuRef : undefined}>
        <button
          onClick={() => setFilter({ folderId: active ? 'all' : f.id })}
          onContextMenu={e => { e.preventDefault(); setMenuId(f.id); }}
          data-folder-drop={f.id}
          title={active ? 'Show all tasks' : `Show "${f.name}" — right-click to rename or delete`}
          className={`${tabClass(active, f.id)} ${active ? 'pr-1' : ''}`}
        >
          <FolderIcon className="w-3.5 h-3.5 shrink-0" />
          <span className="max-w-28 truncate">{f.name}</span>
          {count > 0 && <span className="tabular-nums opacity-60">{count}</span>}
          {active && (
            <span
              role="button"
              tabIndex={0}
              aria-label={`Folder options for ${f.name}`}
              onClick={e => { e.stopPropagation(); setMenuId(menuId === f.id ? null : f.id); }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setMenuId(f.id); } }}
              className="p-0.5 rounded-md hover:bg-blue-500/20"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </span>
          )}
        </button>
        <AnimatePresence>
          {menuId === f.id && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute top-full left-0 mt-2 z-30 bg-[var(--surface-2)] border border-[var(--border-strong)] rounded-xl shadow-2xl shadow-black/40 overflow-hidden min-w-40 p-1"
            >
              <button
                onClick={() => { setMenuId(null); setRenamingId(f.id); }}
                className="w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center gap-2 hover:bg-white/[0.06] transition-colors text-[var(--text)]"
              >
                <Pencil className="w-3.5 h-3.5" /> Rename
              </button>
              <button
                onClick={() => { setMenuId(null); deleteFolder(f.id); }}
                title="Tasks in this folder are kept"
                className="w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center gap-2 hover:bg-red-500/10 transition-colors text-red-400"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete folder
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="px-4 pt-3 flex gap-1.5 flex-wrap items-center">
      <button
        onClick={() => setFilter({ folderId: 'all' })}
        data-folder-drop=""
        title={dragging ? 'Drop to remove from its folder' : undefined}
        className={tabClass(filter.folderId === 'all', '')}
      >
        {dragging ? 'No folder' : 'All tasks'}
        {openCount(null) > 0 && <span className="tabular-nums opacity-60">{openCount(null)}</span>}
      </button>
      {folders.map(renderTab)}
      {creating ? (
        <FolderNameInput onSubmit={handleCreate} onCancel={() => setCreating(false)} />
      ) : (
        <button
          onClick={() => setCreating(true)}
          title="New folder"
          aria-label="New folder"
          className="p-1.5 rounded-lg text-[var(--text-dim)] hover:text-[var(--text-bright)] hover:bg-white/[0.04] transition-colors"
        >
          <FolderPlus className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

/** Entry point while no folder exists — sits in the filter row. */
export function NewFolderButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Group tasks into folders"
      className="text-xs px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 text-[var(--text-dim)] hover:text-[var(--text-bright)] hover:bg-white/[0.04] transition-colors"
    >
      <FolderPlus className="w-3.5 h-3.5" /> Folder
    </button>
  );
}
