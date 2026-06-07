import type { RefObject, ComponentType } from 'react';
import { Bold, Italic, Heading2, List, ListOrdered, Link2, Code, Quote } from 'lucide-react';

// Clickable formatting buttons that act on the current selection of a controlled
// textarea. Wrap-style buttons (bold/italic/code) surround the selection; line
// buttons (heading/list/quote) prefix each selected line and toggle off if
// already prefixed. No selection → markers are inserted with the cursor placed
// so the user can type right away.

interface Props {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  className?: string;
}

export function MarkdownToolbar({ textareaRef, value, onChange, className = '' }: Props) {
  // Re-apply a selection after React commits the controlled value update.
  const restore = (start: number, end: number) => {
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(start, end);
    });
  };

  const wrap = (marker: string) => () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: start, selectionEnd: end } = ta;
    const sel = value.slice(start, end);
    const m = marker.length;

    // Toggle off — selection already includes the markers (e.g. "**bold**").
    if (sel.length >= 2 * m && sel.startsWith(marker) && sel.endsWith(marker)) {
      const inner = sel.slice(m, sel.length - m);
      onChange(value.slice(0, start) + inner + value.slice(end));
      restore(start, start + inner.length);
      return;
    }
    // Toggle off — markers sit just outside the selection ("**[bold]**").
    if (value.slice(start - m, start) === marker && value.slice(end, end + m) === marker) {
      onChange(value.slice(0, start - m) + sel + value.slice(end + m));
      restore(start - m, start - m + sel.length);
      return;
    }
    // No selection — insert an empty pair and drop the cursor between them.
    if (!sel) {
      onChange(value.slice(0, start) + marker + marker + value.slice(end));
      restore(start + m, start + m);
      return;
    }
    // Wrap the selection.
    onChange(value.slice(0, start) + marker + sel + marker + value.slice(end));
    restore(start + m, start + m + sel.length);
  };

  const linePrefix = (prefix: string) => () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: start, selectionEnd: end } = ta;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const segment = value.slice(lineStart, end);
    const lines = segment.split('\n');
    const allPrefixed = lines.every(l => l.startsWith(prefix));
    const newSegment = lines.map(l => (allPrefixed ? l.slice(prefix.length) : prefix + l)).join('\n');
    onChange(value.slice(0, lineStart) + newSegment + value.slice(end));
    const delta = newSegment.length - segment.length;
    // Collapsed caret → leave it after the prefix so you can type right away;
    // a real selection stays selected so repeated toggles work.
    if (start === end) restore(end + delta, end + delta);
    else restore(lineStart, end + delta);
  };

  const link = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: start, selectionEnd: end } = ta;
    const sel = value.slice(start, end);
    // No selection → empty link, caret inside the [] so you type the text first.
    if (!sel) {
      onChange(value.slice(0, start) + '[](url)' + value.slice(end));
      restore(start + 1, start + 1);
      return;
    }
    // Selection becomes the link text; select the "url" placeholder to fill in.
    onChange(value.slice(0, start) + `[${sel}](url)` + value.slice(end));
    const urlStart = start + 1 + sel.length + 2; // after "[" + sel + "]("
    restore(urlStart, urlStart + 3);
  };

  const buttons: { icon: ComponentType<{ className?: string }>; title: string; onClick: () => void }[] = [
    { icon: Bold, title: 'Bold', onClick: wrap('**') },
    { icon: Italic, title: 'Italic', onClick: wrap('*') },
    { icon: Code, title: 'Inline code', onClick: wrap('`') },
    { icon: Heading2, title: 'Heading', onClick: linePrefix('## ') },
    { icon: List, title: 'Bullet list', onClick: linePrefix('- ') },
    { icon: ListOrdered, title: 'Numbered list', onClick: linePrefix('1. ') },
    { icon: Quote, title: 'Quote', onClick: linePrefix('> ') },
    { icon: Link2, title: 'Link', onClick: link },
  ];

  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      {buttons.map(({ icon: Icon, title, onClick }) => (
        <button
          key={title}
          type="button"
          title={title}
          // Keep the textarea's selection — mousedown would blur it first.
          onMouseDown={e => e.preventDefault()}
          onClick={onClick}
          className="p-1.5 rounded-md text-[var(--text-dim)] hover:text-[var(--text-bright)] hover:bg-white/[0.06] transition-colors"
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}
