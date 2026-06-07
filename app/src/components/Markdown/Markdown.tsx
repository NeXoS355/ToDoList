import { memo, type ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { openUrl } from '@tauri-apps/plugin-opener';

// Read-mode renderer: plain text stays plain (Markdown leaves prose untouched),
// while real syntax (#, -, **, links, tables, `code`) renders. Single newlines
// become <br> via remark-breaks so pasted email bodies keep their line breaks.
//
// Editing still happens against the raw string elsewhere — this is display only.

const remarkPlugins = [remarkGfm, remarkBreaks];

// Links must not navigate the WebView itself — open them in the OS browser.
function MdLink({ href, children, ...rest }: ComponentPropsWithoutRef<'a'>) {
  return (
    <a
      {...rest}
      href={href}
      onClick={e => {
        e.preventDefault();
        e.stopPropagation(); // don't trip the parent's click-to-edit
        if (href) openUrl(href).catch(() => {});
      }}
      className="text-blue-400 hover:text-blue-300 underline underline-offset-2 decoration-blue-400/40 hover:decoration-blue-300 cursor-pointer"
    >
      {children}
    </a>
  );
}

// Element styling lives here (no Tailwind typography plugin in this project).
const components = {
  a: MdLink,
  p: (p: ComponentPropsWithoutRef<'p'>) => <p {...p} className="my-2 first:mt-0 last:mb-0" />,
  h1: (p: ComponentPropsWithoutRef<'h1'>) => <h1 {...p} className="text-lg font-semibold text-[var(--text-bright)] mt-4 mb-2 first:mt-0" />,
  h2: (p: ComponentPropsWithoutRef<'h2'>) => <h2 {...p} className="text-base font-semibold text-[var(--text-bright)] mt-4 mb-2 first:mt-0" />,
  h3: (p: ComponentPropsWithoutRef<'h3'>) => <h3 {...p} className="text-sm font-semibold text-[var(--text-bright)] mt-3 mb-1.5 first:mt-0" />,
  ul: (p: ComponentPropsWithoutRef<'ul'>) => <ul {...p} className="list-disc pl-5 my-2 space-y-1" />,
  ol: (p: ComponentPropsWithoutRef<'ol'>) => <ol {...p} className="list-decimal pl-5 my-2 space-y-1" />,
  li: (p: ComponentPropsWithoutRef<'li'>) => <li {...p} className="marker:text-[var(--text-dim)]" />,
  strong: (p: ComponentPropsWithoutRef<'strong'>) => <strong {...p} className="font-semibold text-[var(--text-bright)]" />,
  em: (p: ComponentPropsWithoutRef<'em'>) => <em {...p} className="italic" />,
  blockquote: (p: ComponentPropsWithoutRef<'blockquote'>) => (
    <blockquote {...p} className="border-l-2 border-[var(--border-strong)] pl-3 my-2 text-[var(--text-dim)] italic" />
  ),
  code: ({ className, ...rest }: ComponentPropsWithoutRef<'code'>) => {
    // Block code (```), marked by a language- class, vs. inline `code`.
    const isBlock = /language-/.test(className ?? '');
    return isBlock ? (
      <code {...rest} className="block bg-black/30 rounded-lg p-3 my-2 overflow-x-auto text-[13px] font-mono text-[var(--text-bright)]" />
    ) : (
      <code {...rest} className="bg-white/[0.08] rounded px-1.5 py-0.5 text-[0.85em] font-mono text-[var(--text-bright)]" />
    );
  },
  pre: (p: ComponentPropsWithoutRef<'pre'>) => <pre {...p} className="my-0" />,
  hr: () => <hr className="my-4 border-[var(--border)]" />,
  table: (p: ComponentPropsWithoutRef<'table'>) => (
    <div className="my-2 overflow-x-auto">
      <table {...p} className="border-collapse text-sm" />
    </div>
  ),
  th: (p: ComponentPropsWithoutRef<'th'>) => <th {...p} className="border border-[var(--border-strong)] px-2.5 py-1 text-left font-semibold bg-white/[0.03]" />,
  td: (p: ComponentPropsWithoutRef<'td'>) => <td {...p} className="border border-[var(--border)] px-2.5 py-1" />,
};

interface Props {
  children: string;
  className?: string;
}

export const Markdown = memo(function Markdown({ children, className }: Props) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
});
