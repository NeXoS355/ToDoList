import { describe, it, expect } from 'vitest';
import {
  parseEmail,
  parseEml,
  parseEmailSmart,
  htmlToText,
  guessTitle,
  base64ToBytes,
  readEmailMeta,
} from './emailParse';

describe('parseEmail (pasted forward)', () => {
  it('parses a German Outlook header block', () => {
    const raw = [
      'Von: Max Mustermann <max@firma.de>',
      'Gesendet: Montag, 2. Juni 2025 14:32',
      'An: empfaenger@firma.de',
      'Betreff: Projektupdate',
      '',
      'Hallo, hier das Update.',
    ].join('\n');
    const p = parseEmail(raw);
    expect(p).not.toBeNull();
    expect(p!.fromName).toBe('Max Mustermann');
    expect(p!.fromEmail).toBe('max@firma.de');
    expect(p!.subject).toBe('Projektupdate');
    expect(p!.to).toBe('empfaenger@firma.de');
    expect(p!.body).toBe('Hallo, hier das Update.');
  });

  it('parses an English header block', () => {
    const raw = [
      'From: John Doe <john@acme.com>',
      'Sent: Monday, June 2, 2025 2:32 PM',
      'To: jane@acme.com',
      'Subject: Status',
      '',
      'Body text here.',
    ].join('\n');
    const p = parseEmail(raw);
    expect(p?.subject).toBe('Status');
    expect(p?.fromEmail).toBe('john@acme.com');
    expect(p?.body).toBe('Body text here.');
  });

  it('returns null for plain text that is not an email', () => {
    expect(parseEmail('just a normal note with no headers')).toBeNull();
  });

  it('falls back to reply-attribution parsing', () => {
    const raw = [
      'Danke!',
      '',
      'Am 02.06.2025 um 14:32 schrieb Max Mustermann <max@firma.de>:',
      '> Originaltext',
      '> zweite Zeile',
    ].join('\n');
    const p = parseEmail(raw);
    expect(p).not.toBeNull();
    expect(p!.fromName).toBe('Max Mustermann');
    expect(p!.fromEmail).toBe('max@firma.de');
    expect(p!.body).toContain('Originaltext');
    expect(p!.body).not.toContain('>'); // quote markers stripped
  });
});

describe('parseEml (.eml file)', () => {
  it('parses headers and a plain-text body', () => {
    const eml = [
      'From: Alice <alice@example.com>',
      'To: bob@example.com',
      'Subject: Hello',
      'Date: Mon, 2 Jun 2025 14:32:00 +0000',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Plain body line.',
    ].join('\n');
    const p = parseEml(eml);
    expect(p?.subject).toBe('Hello');
    expect(p?.fromName).toBe('Alice');
    expect(p?.fromEmail).toBe('alice@example.com');
    expect(p?.body).toBe('Plain body line.');
  });

  it('decodes RFC2047 subject and quoted-printable body', () => {
    const eml = [
      'From: A <a@x.com>',
      'Subject: =?utf-8?Q?Gr=C3=BC=C3=9Fe?=',
      'Content-Transfer-Encoding: quoted-printable',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Preis: 5=E2=82=AC heute',
    ].join('\n');
    const p = parseEml(eml);
    expect(p?.subject).toBe('Grüße');
    expect(p?.body).toBe('Preis: 5€ heute');
  });
});

describe('htmlToText', () => {
  it('flattens block elements to newlines', () => {
    expect(htmlToText('<p>Hello</p><p>World</p>')).toBe('Hello\nWorld');
  });
  it('converts <br> to newlines', () => {
    expect(htmlToText('a<br>b')).toBe('a\nb');
  });
});

describe('parseEmailSmart', () => {
  it('prefers the richer HTML payload when plain text lacks headers', () => {
    const plain = 'Body only, no headers';
    const html = '<div>Von: Max <max@firma.de></div><div>Betreff: Wichtig</div><div></div><div>Body only, no headers</div>';
    const p = parseEmailSmart(plain, html);
    expect(p?.subject).toBe('Wichtig');
  });
});

describe('guessTitle', () => {
  it('takes the first non-empty line', () => {
    expect(guessTitle('\n\nFirst line\nSecond')).toBe('First line');
  });
  it('truncates very long lines', () => {
    const out = guessTitle('x'.repeat(100));
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBe(88);
  });
});

describe('readEmailMeta', () => {
  it('parses valid JSON', () => {
    expect(readEmailMeta('{"fromName":"X"}')).toEqual({ fromName: 'X' });
  });
  it('returns null for invalid or empty input', () => {
    expect(readEmailMeta('not json')).toBeNull();
    expect(readEmailMeta(null)).toBeNull();
  });
});

describe('base64ToBytes', () => {
  it('decodes base64 to raw bytes', () => {
    expect(Array.from(base64ToBytes('aGk='))).toEqual([104, 105]); // "hi"
  });
});
