import type { Label, Priority } from './types';

// Todoist-style inline tokens for the Quick Composer. Whitespace-separated
// tokens are lifted out of the title:
//   !low !medium !high !critical  (also !med / !crit)   priority
//   !! = high, !!! = critical                            priority shorthand
//   #name                                                existing label (case-insensitive)
//   @today @heute @tomorrow @morgen                      due date
//   @mon … @sunday                                       next occurrence of that weekday
//   @2026-07-01  @24.12.  @24.12.2026                    explicit dates
// Unrecognized tokens (unknown labels, malformed dates) stay in the title so
// nothing is dropped silently.

export interface QuickParse {
  title: string;
  priority: Priority | null;
  labels: Label[];
  dueDate: number | null; // local midnight (ms), like Issue.due_date
}

const PRIORITY_WORDS: Record<string, Priority> = {
  low: 'low',
  med: 'medium',
  medium: 'medium',
  high: 'high',
  crit: 'critical',
  critical: 'critical',
};

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

function midnight(d: Date): number {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

function parseDueToken(raw: string): number | null {
  const t = raw.toLowerCase();
  const now = new Date();

  if (t === 'today' || t === 'heute') return midnight(now);
  if (t === 'tomorrow' || t === 'morgen') {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return midnight(d);
  }

  const weekday = WEEKDAYS[t];
  if (weekday !== undefined) {
    // Next occurrence, never today: "@fri" on a Friday means next Friday.
    const ahead = ((weekday - now.getDay()) + 7) % 7 || 7;
    const d = new Date(now);
    d.setDate(d.getDate() + ahead);
    return midnight(d);
  }

  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t); // ISO
  if (m) return midnight(new Date(+m[1], +m[2] - 1, +m[3]));

  m = /^(\d{1,2})\.(\d{1,2})\.?(\d{4})?$/.exec(t); // German DD.MM.[YYYY]
  if (m) {
    const day = +m[1];
    const month = +m[2];
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
    const d = new Date(m[3] ? +m[3] : now.getFullYear(), month - 1, day);
    // Without a year, a date already past rolls into next year.
    if (!m[3] && midnight(d) < midnight(now)) d.setFullYear(d.getFullYear() + 1);
    return midnight(d);
  }

  return null;
}

export function parseQuickInput(input: string, labels: Label[]): QuickParse {
  const byName = new Map(labels.map(l => [l.name.toLowerCase(), l]));
  let priority: Priority | null = null;
  let dueDate: number | null = null;
  const found: Label[] = [];
  const rest: string[] = [];

  for (const tok of input.trim().split(/\s+/)) {
    if (!tok) continue;

    if (tok === '!!') { priority = 'high'; continue; }
    if (tok === '!!!') { priority = 'critical'; continue; }

    if (tok.startsWith('!') && tok.length > 1) {
      const p = PRIORITY_WORDS[tok.slice(1).toLowerCase()];
      if (p) { priority = p; continue; }
    }

    if (tok.startsWith('#') && tok.length > 1) {
      const label = byName.get(tok.slice(1).toLowerCase());
      if (label) {
        if (!found.some(l => l.id === label.id)) found.push(label);
        continue;
      }
    }

    if (tok.startsWith('@') && tok.length > 1) {
      const due = parseDueToken(tok.slice(1));
      if (due !== null) { dueDate = due; continue; }
    }

    rest.push(tok);
  }

  return { title: rest.join(' '), priority, labels: found, dueDate };
}
