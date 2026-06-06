import { describe, it, expect } from 'vitest';
import { formatBytes } from './types';

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
