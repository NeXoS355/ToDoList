import { describe, it, expect } from 'vitest';
import { formatBytes, parseRecurrence, makeRecurrence, recurrenceFreq, nextDueDate } from './types';

describe('formatBytes', () => {
  it('handles null/zero', () => {
    expect(formatBytes(null)).toBe('0 B');
    expect(formatBytes(0)).toBe('0 B');
  });
  it('formats bytes without decimals', () => {
    expect(formatBytes(500)).toBe('500 B');
  });
  it('formats KB/MB with one decimal', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1048576)).toBe('1.0 MB');
  });
});

describe('recurrence parsing', () => {
  it('round-trips make → parse', () => {
    expect(parseRecurrence(makeRecurrence('weekly'))).toEqual({ freq: 'weekly', interval: 1 });
    expect(makeRecurrence('none')).toBeNull();
  });
  it('returns null for empty/garbage/unknown freq', () => {
    expect(parseRecurrence(null)).toBeNull();
    expect(parseRecurrence('not json')).toBeNull();
    expect(parseRecurrence('{"freq":"hourly","interval":1}')).toBeNull();
  });
  it('clamps interval to >= 1', () => {
    expect(parseRecurrence('{"freq":"daily","interval":0}')).toEqual({ freq: 'daily', interval: 1 });
    expect(parseRecurrence('{"freq":"daily"}')).toEqual({ freq: 'daily', interval: 1 });
  });
  it('recurrenceFreq reports current frequency or none', () => {
    expect(recurrenceFreq(makeRecurrence('monthly'))).toBe('monthly');
    expect(recurrenceFreq(null)).toBe('none');
  });
});

describe('nextDueDate (local, due-anchored)', () => {
  const at = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

  it('advances daily and weekly', () => {
    expect(nextDueDate(at(2026, 6, 21), { freq: 'daily', interval: 1 })).toBe(at(2026, 6, 22));
    expect(nextDueDate(at(2026, 6, 21), { freq: 'weekly', interval: 1 })).toBe(at(2026, 6, 28));
  });
  it('advances monthly and yearly', () => {
    expect(nextDueDate(at(2026, 6, 15), { freq: 'monthly', interval: 1 })).toBe(at(2026, 7, 15));
    expect(nextDueDate(at(2026, 6, 15), { freq: 'yearly', interval: 1 })).toBe(at(2027, 6, 15));
  });
  it('clamps month-end overflow (Jan 31 + 1mo → Feb 28)', () => {
    expect(nextDueDate(at(2026, 1, 31), { freq: 'monthly', interval: 1 })).toBe(at(2026, 2, 28));
    expect(nextDueDate(at(2026, 1, 31), { freq: 'monthly', interval: 3 })).toBe(at(2026, 4, 30));
  });
  it('handles a leap-year Feb 29 anchor on yearly', () => {
    expect(nextDueDate(at(2024, 2, 29), { freq: 'yearly', interval: 1 })).toBe(at(2025, 2, 28));
  });
});
