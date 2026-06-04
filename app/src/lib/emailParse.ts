// Smart-paste parsing for forwarded / replied emails.
//
// Outlook & co. only carry the Von/An/Betreff (From/To/Subject) header block
// into the clipboard when the message is *forwarded* (or quoted in a reply) —
// a plain body copy has none. So we parse exactly that forwarded header block,
// in both German (Outlook 2024) and English wording, and pull the body clean.

export interface EmailMeta {
  fromName?: string;
  fromEmail?: string;
  to?: string;
  date?: string;
  subject?: string;
}

export interface ParsedEmail extends EmailMeta {
  body: string;
}

const FIELD_RE = /^\s*(Von|From|Gesendet|Sent|Datum|Date|An|To|Cc|Betreff|Subject)\s*:\s*(.*)$/i;

const CANON: Record<string, 'from' | 'date' | 'to' | 'subject' | 'cc'> = {
  von: 'from', from: 'from',
  gesendet: 'date', sent: 'date', datum: 'date', date: 'date',
  an: 'to', to: 'to',
  cc: 'cc',
  betreff: 'subject', subject: 'subject',
};

/** Split `Max Mustermann <max@firma.de>` into name + email. */
function splitAddress(raw?: string): { name?: string; email?: string } {
  if (!raw) return {};
  const angled = raw.match(/(.*?)<([^>]+)>/);
  if (angled) {
    const name = angled[1].trim().replace(/^["']|["']$/g, '');
    return { name: name || undefined, email: angled[2].trim() };
  }
  if (raw.includes('@') && !raw.includes(' ')) return { email: raw.trim() };
  return { name: raw.trim() || undefined };
}

/** Strip leading reply-quote markers (`> > text`) from a line. */
const dequote = (line: string) => line.replace(/^(?:\s*>)+\s?/, '');

/**
 * Parse a pasted forwarded/replied email. Returns `null` when the text does
 * not look like an email (so the caller can fall back to a plain paste).
 */
export function parseEmail(raw: string): ParsedEmail | null {
  if (!raw || !raw.trim()) return null;

  const lines = raw.replace(/\r\n?/g, '\n').split('\n').map(dequote);

  const start = lines.findIndex(l => FIELD_RE.test(l));
  if (start === -1) return parseReply(raw);

  const fields: Record<string, string> = {};
  let lastKey = '';
  let i = start;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') { i++; break; } // blank line ends the header block
    const m = line.match(FIELD_RE);
    if (m) {
      const key = CANON[m[1].toLowerCase()];
      lastKey = key;
      if (!(key in fields)) fields[key] = m[2].trim();
    } else if (lastKey && /^\s+\S/.test(line)) {
      fields[lastKey] = `${fields[lastKey]} ${line.trim()}`.trim(); // wrapped header
    } else {
      break; // unindented non-header line → body started without a blank line
    }
  }

  // Require enough signal to be confident it's really an email.
  const matched = !!(fields.subject || (fields.from && fields.date));
  if (!matched) return parseReply(raw);

  const { name, email } = splitAddress(fields.from);
  const body = lines.slice(i).join('\n').replace(/^\n+/, '').trim();

  return {
    fromName: name,
    fromEmail: email,
    to: fields.to || undefined,
    date: fields.date || undefined,
    subject: fields.subject || undefined,
    body,
  };
}

// Reply-style attribution lines, e.g.
//   "On Mon, 2 Jun 2025 at 14:32, Max <max@x> wrote:"
//   "Am 02.06.2025 um 14:32 schrieb Max Mustermann <max@firma.de>:"
const REPLY_RE = /^\s*(?:On|Am)\b.*?(?:wrote|schrieb)\b[^:\n]*:\s*$/im;

function parseReply(raw: string): ParsedEmail | null {
  const norm = raw.replace(/\r\n?/g, '\n');
  const m = norm.match(REPLY_RE);
  if (!m) return null;

  const attribution = m[0].trim();
  const sender = attribution.match(/(?:wrote|schrieb)\s+(.+?)\s*:?$/i)?.[1]
    ?? attribution.match(/,\s*([^,]+?)\s+(?:wrote|schrieb)/i)?.[1];
  const { name, email } = splitAddress(sender);

  // Body is what follows the attribution line, with quote markers stripped.
  const after = norm.slice((m.index ?? 0) + m[0].length);
  const body = after.split('\n').map(dequote).join('\n').replace(/^\n+/, '').trim();

  return { fromName: name, fromEmail: email, body };
}

/**
 * Flatten an HTML clipboard payload to text, preserving line structure so the
 * header block survives. Outlook puts a header table (`<b>Von:</b> …<br>`) into
 * the `text/html` flavor even on a plain body copy — that's where Von/An/Betreff
 * live without forwarding.
 */
export function htmlToText(html: string): string {
  if (!html || typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  doc.querySelectorAll('p, div, tr, li, h1, h2, h3, h4, blockquote').forEach(el => el.append('\n'));
  const text = doc.body?.textContent ?? '';
  return text
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const score = (p: ParsedEmail | null): number =>
  p ? (p.subject ? 2 : 0) + (p.fromName || p.fromEmail ? 1 : 0) + (p.date ? 1 : 0) : -1;

/**
 * Parse from a clipboard that carries both plain text and (optionally) HTML,
 * picking whichever yields the richer result — the HTML flavor often holds the
 * header block the plain-text copy dropped.
 */
export function parseEmailSmart(plain: string, html?: string): ParsedEmail | null {
  const fromPlain = parseEmail(plain);
  if (fromPlain?.subject) return fromPlain; // already confident
  const htmlText = html ? htmlToText(html) : '';
  const fromHtml = htmlText ? parseEmail(htmlText) : null;
  return score(fromHtml) > score(fromPlain) ? fromHtml : fromPlain;
}

/** Best-effort title when an email had no subject line. */
export function guessTitle(body: string): string {
  const first = body.split('\n').map(l => l.trim()).find(Boolean) ?? '';
  return first.length > 90 ? `${first.slice(0, 87)}…` : first;
}

// --- Email file import (.eml / .msg) ---------------------------------------

/** Decode an RFC 2047 encoded-word header value, e.g. `=?utf-8?B?…?=`. */
function decodeWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, charset, enc, data) => {
    try {
      let bytes: Uint8Array;
      if (enc.toUpperCase() === 'B') {
        const bin = atob(data.replace(/\s+/g, ''));
        bytes = Uint8Array.from(bin, (c: string) => c.charCodeAt(0));
      } else {
        const q = data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_x: string, h: string) => String.fromCharCode(parseInt(h, 16)));
        bytes = Uint8Array.from(q, (c: string) => c.charCodeAt(0));
      }
      return new TextDecoder(charset.toLowerCase() === 'utf-8' ? 'utf-8' : charset).decode(bytes);
    } catch {
      return data;
    }
  }).replace(/\?=\s+=\?/g, ''); // join adjacent encoded words
}

/** Decode a quoted-printable body. */
function decodeQuotedPrintable(s: string): string {
  const joined = s.replace(/=\r?\n/g, ''); // soft line breaks
  const bin = joined.replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
  try {
    return new TextDecoder('utf-8').decode(Uint8Array.from(bin, (c: string) => c.charCodeAt(0)));
  } catch {
    return joined;
  }
}

function decodeBase64Utf8(s: string): string {
  try {
    const bin = atob(s.replace(/\s+/g, ''));
    return new TextDecoder('utf-8').decode(Uint8Array.from(bin, (c: string) => c.charCodeAt(0)));
  } catch {
    return s;
  }
}

function decodeBodyByCTE(body: string, cte: string): string {
  const enc = cte.toLowerCase();
  if (enc.includes('quoted-printable')) return decodeQuotedPrintable(body);
  if (enc.includes('base64')) return decodeBase64Utf8(body);
  return body;
}

/** Parse a `.eml` (RFC 822 / MIME) file's text. */
export function parseEml(raw: string): ParsedEmail | null {
  const norm = raw.replace(/\r\n?/g, '\n');
  const sep = norm.indexOf('\n\n');
  const headerBlock = (sep === -1 ? norm : norm.slice(0, sep)).replace(/\n[ \t]+/g, ' '); // unfold
  let body = sep === -1 ? '' : norm.slice(sep + 2);

  const headers: Record<string, string> = {};
  for (const line of headerBlock.split('\n')) {
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (m) headers[m[1].toLowerCase()] = m[2].trim();
  }
  if (!headers.subject && !headers.from) return null;

  const ctype = headers['content-type'] ?? '';
  const boundary = ctype.match(/boundary="?([^";\s]+)"?/i)?.[1];
  if (boundary) {
    // multipart: prefer a text/plain part, else flatten the text/html part.
    const parts = body.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?\\n?`));
    let plain = '';
    let html = '';
    for (const part of parts) {
      const ps = part.indexOf('\n\n');
      if (ps === -1) continue;
      const ph: Record<string, string> = {};
      for (const l of part.slice(0, ps).replace(/\n[ \t]+/g, ' ').split('\n')) {
        const mm = l.match(/^([\w-]+):\s*(.*)$/);
        if (mm) ph[mm[1].toLowerCase()] = mm[2].trim();
      }
      const pType = ph['content-type'] ?? '';
      const decoded = decodeBodyByCTE(part.slice(ps + 2), ph['content-transfer-encoding'] ?? '');
      if (/text\/plain/i.test(pType) && !plain) plain = decoded;
      else if (/text\/html/i.test(pType) && !html) html = decoded;
    }
    body = plain || (html ? htmlToText(html) : '');
  } else {
    body = decodeBodyByCTE(body, headers['content-transfer-encoding'] ?? '');
    if (/text\/html/i.test(ctype)) body = htmlToText(body);
  }

  const { name, email } = splitAddress(decodeWords(headers.from ?? ''));
  return {
    fromName: name,
    fromEmail: email,
    to: headers.to ? decodeWords(headers.to) : undefined,
    date: headers.date || undefined,
    subject: headers.subject ? decodeWords(headers.subject) : undefined,
    body: body.trim(),
  };
}

/** Parse an Outlook `.msg` (compound binary) file. */
export async function parseMsg(buffer: ArrayBuffer): Promise<ParsedEmail | null> {
  try {
    const { default: MsgReader } = await import('@kenjiuno/msgreader');
    const data = new MsgReader(buffer).getFileData();
    const body = (data.body && data.body.trim())
      ? data.body
      : (data.bodyHtml ? htmlToText(data.bodyHtml) : '');
    const to = (data.recipients ?? [])
      .map(r => r.name || r.email || r.smtpAddress)
      .filter(Boolean)
      .join(', ');
    const senderEmail = data.senderEmail && data.senderEmail.includes('@') ? data.senderEmail : undefined;
    if (!data.subject && !data.senderName && !senderEmail) return null;
    return {
      fromName: data.senderName || undefined,
      fromEmail: senderEmail,
      to: to || undefined,
      date: data.messageDeliveryTime || undefined,
      subject: data.subject || undefined,
      body: (body || '').trim(),
    };
  } catch {
    return null;
  }
}

/** Parse an email file by extension. `bytes` are the raw file contents. */
export async function parseEmailFile(filename: string, bytes: Uint8Array): Promise<ParsedEmail | null> {
  if (/\.msg$/i.test(filename)) {
    return parseMsg(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  }
  if (/\.eml$/i.test(filename)) {
    return parseEml(new TextDecoder('utf-8').decode(bytes));
  }
  return null;
}

/** Decode a base64 string (from the Rust file reader) into bytes. */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Safely read a stored source_meta JSON string. */
export function readEmailMeta(json: string | null | undefined): EmailMeta | null {
  if (!json) return null;
  try {
    const m = JSON.parse(json) as EmailMeta;
    return m && typeof m === 'object' ? m : null;
  } catch {
    return null;
  }
}
