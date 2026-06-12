import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseQuickInput } from './quickParse';
import type { Label } from './types';

const LABELS: Label[] = [
  { id: 'l1', name: 'bug', color: '#ef4444' },
  { id: 'l2', name: 'Feature', color: '#8b5cf6' },
];

// Fixed clock: Friday, 2026-06-12.
const NOW = new Date(2026, 5, 12, 15, 30);
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('parseQuickInput — priority', () => {
  it('parses !word priorities', () => {
    expect(parseQuickInput('fix tests !high', LABELS).priority).toBe('high');
    expect(parseQuickInput('!low cleanup', LABELS).priority).toBe('low');
    expect(parseQuickInput('!crit prod down', LABELS).priority).toBe('critical');
    expect(parseQuickInput('!med stuff', LABELS).priority).toBe('medium');
  });

  it('parses !! and !!! shorthands', () => {
    expect(parseQuickInput('deploy !!', LABELS).priority).toBe('high');
    expect(parseQuickInput('deploy !!!', LABELS).priority).toBe('critical');
  });

  it('keeps unknown ! tokens in the title', () => {
    const p = parseQuickInput('call back!  !asap', LABELS);
    expect(p.priority).toBeNull();
    expect(p.title).toBe('call back! !asap');
  });
});

describe('parseQuickInput — labels', () => {
  it('matches existing labels case-insensitively and dedupes', () => {
    const p = parseQuickInput('crash #bug #feature #BUG', LABELS);
    expect(p.labels.map(l => l.id)).toEqual(['l1', 'l2']);
    expect(p.title).toBe('crash');
  });

  it('leaves unknown #tags in the title', () => {
    const p = parseQuickInput('look at #unknown thing', LABELS);
    expect(p.labels).toEqual([]);
    expect(p.title).toBe('look at #unknown thing');
  });
});

describe('parseQuickInput — due dates', () => {
  it('parses @today/@heute and @tomorrow/@morgen', () => {
    expect(parseQuickInput('x @today', LABELS).dueDate).toBe(day(2026, 6, 12));
    expect(parseQuickInput('x @heute', LABELS).dueDate).toBe(day(2026, 6, 12));
    expect(parseQuickInput('x @tomorrow', LABELS).dueDate).toBe(day(2026, 6, 13));
    expect(parseQuickInput('x @morgen', LABELS).dueDate).toBe(day(2026, 6, 13));
  });

  it('parses weekdays as the next occurrence (never today)', () => {
    expect(parseQuickInput('x @mon', LABELS).dueDate).toBe(day(2026, 6, 15));
    expect(parseQuickInput('x @sunday', LABELS).dueDate).toBe(day(2026, 6, 14));
    // Today is Friday — @fri jumps a full week.
    expect(parseQuickInput('x @fri', LABELS).dueDate).toBe(day(2026, 6, 19));
  });

  it('parses ISO and German dates', () => {
    expect(parseQuickInput('x @2026-07-01', LABELS).dueDate).toBe(day(2026, 7, 1));
    expect(parseQuickInput('x @24.12.', LABELS).dueDate).toBe(day(2026, 12, 24));
    expect(parseQuickInput('x @24.12.2027', LABELS).dueDate).toBe(day(2027, 12, 24));
  });

  it('rolls year-less past dates into next year', () => {
    expect(parseQuickInput('x @1.1.', LABELS).dueDate).toBe(day(2027, 1, 1));
  });

  it('leaves invalid @tokens in the title', () => {
    const p = parseQuickInput('mail @boss @32.13.', LABELS);
    expect(p.dueDate).toBeNull();
    expect(p.title).toBe('mail @boss @32.13.');
  });
});

describe('parseQuickInput — combined', () => {
  it('extracts everything and keeps the rest as title', () => {
    const p = parseQuickInput('fix login crash !high #bug @tomorrow', LABELS);
    expect(p.title).toBe('fix login crash');
    expect(p.priority).toBe('high');
    expect(p.labels.map(l => l.name)).toEqual(['bug']);
    expect(p.dueDate).toBe(day(2026, 6, 13));
  });

  it('returns empty title when input is tokens only', () => {
    expect(parseQuickInput('!high #bug', LABELS).title).toBe('');
  });
});
