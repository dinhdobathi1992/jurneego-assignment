import { describe, it, expect } from 'vitest';
import { isValidFeedbackScore } from '../../src/repositories/messageRepository';

describe('isValidFeedbackScore', () => {
  it('accepts 1 and -1', () => {
    expect(isValidFeedbackScore(1)).toBe(true);
    expect(isValidFeedbackScore(-1)).toBe(true);
  });
  it('accepts null (clear feedback)', () => {
    expect(isValidFeedbackScore(null)).toBe(true);
  });
  it('rejects 0', () => {
    expect(isValidFeedbackScore(0)).toBe(false);
  });
  it('rejects out-of-range', () => {
    expect(isValidFeedbackScore(2)).toBe(false);
    expect(isValidFeedbackScore(-2)).toBe(false);
  });
  it('rejects non-numbers', () => {
    expect(isValidFeedbackScore('1' as unknown as number)).toBe(false);
    expect(isValidFeedbackScore(undefined as unknown as number)).toBe(false);
  });
});
