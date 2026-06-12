import { memo, useEffect, useState, type ComponentPropsWithoutRef } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { openUrl } from '@tauri-apps/plugin-opener';
import { invoke } from '@tauri-apps/api/core';
import { ImageOff } from 'lucide-react';
import * as db from '../../lib/db';

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

// Pasted images are written as ![name](attachment://<id>) — resolve the id to
// the bytes on disk and render a data URL. Loaded URLs are cached for the
// session so re-renders (and re-opening the issue) don't re-read the file.
const imageCache = new Map<string, string>();

function AttachmentImage({ id, alt }: { id: string; alt?: string }) {
  const [src, setSrc] = useState<string | null>(imageCache.get(id) ?? null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (imageCache.has(id)) { setSrc(imageCache.get(id)!); return; }
    let alive = true;
    (async () => {
      try {
        const att = await db.getAttachmentData(id);
        if (!att?.rel_path) { if (alive) setMissing(true); return; }
        const b64 = await invoke<string>('read_attachment_base64', { relPath: att.rel_path });
        const url = `data:${att.mime_type || 'image/png'};base64,${b64}`;
        imageCache.set(id, url);
        if (alive) setSrc(url);
      } catch {
        if (alive) setMissing(true);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  if (missing) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-dim)] bg-white/[0.04] border border-[var(--border)] rounded-lg px-2.5 py-1.5 my-1">
        <ImageOff className="w-3.5 h-3.5" /> {alt || 'image'} (attachment removed)
      </span>
    );
  }
  if (!src) return <span className="inline-block w-32 h-20 rounded-lg bg-white/[0.04] border border-[var(--border)] animate-pulse my-1" />;
  return <img src={src} alt={alt ?? ''} className="max-w-full max-h-96 rounded-lg border border-[var(--border)] my-2" />;
}

const ATTACHMENT_URL_RE = /^attachment:\/\/(.+)$/;

function MdImage({ src, alt, ...rest }: ComponentPropsWithoutRef<'img'>) {
  const m = typeof src === 'string' ? ATTACHMENT_URL_RE.exec(src) : null;
  if (m) return <AttachmentImage id={m[1]} alt={alt} />;
  return <img {...rest} src={src} alt={alt ?? ''} className="max-w-full max-h-96 rounded-lg border border-[var(--border)] my-2" />;
}

// Element styling lives here (no Tailwind typography plugin in this project).
const components = {
  a: MdLink,
  img: MdImage,
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

// react-markdown strips unknown protocols by default — let attachment:// pass
// through to MdImage, everything else keeps the standard sanitizing.
function urlTransform(url: string): string {
  return ATTACHMENT_URL_RE.test(url) ? url : defaultUrlTransform(url);
}

export const Markdown = memo(function Markdown({ children, className }: Props) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components} urlTransform={urlTransform}>
        {children}
      </ReactMarkdown>
    </div>
  );
});
