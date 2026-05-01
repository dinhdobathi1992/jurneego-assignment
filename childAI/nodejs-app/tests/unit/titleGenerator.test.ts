import { describe, it, expect } from 'vitest';
import { sanitizeTitle } from '../../src/services/ai/titleGenerator';

describe('sanitizeTitle', () => {
  it('returns the input trimmed when already clean', () => {
    expect(sanitizeTitle('Brave Little Dragon')).toBe('Brave Little Dragon');
  });

  it('strips wrapping double quotes', () => {
    expect(sanitizeTitle('"Brave Little Dragon"')).toBe('Brave Little Dragon');
  });

  it('strips wrapping single quotes and backticks', () => {
    expect(sanitizeTitle("'Brave Little Dragon'")).toBe('Brave Little Dragon');
    expect(sanitizeTitle('`Brave Little Dragon`')).toBe('Brave Little Dragon');
  });

  it('strips trailing punctuation', () => {
    expect(sanitizeTitle('Hello there.')).toBe('Hello there');
    expect(sanitizeTitle('Are dragons real?')).toBe('Are dragons real');
    expect(sanitizeTitle('Wow!')).toBe('Wow');
  });

  it('collapses internal whitespace', () => {
    expect(sanitizeTitle('Brave    little\n\ndragon')).toBe('Brave little dragon');
  });

  it('returns null on empty or whitespace-only input', () => {
    expect(sanitizeTitle('')).toBeNull();
    expect(sanitizeTitle('   ')).toBeNull();
    expect(sanitizeTitle('\n\t')).toBeNull();
  });

  it('truncates to 60 characters', () => {
    const long = 'A'.repeat(120);
    const result = sanitizeTitle(long);
    expect(result?.length).toBe(60);
  });

  it('handles combined cases', () => {
    expect(sanitizeTitle('  "Story  about\ta brave dragon!"  ')).toBe(
      'Story about a brave dragon',
    );
  });
});
