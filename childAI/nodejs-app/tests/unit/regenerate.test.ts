import { describe, it, expect } from 'vitest';
import { canRegenerate } from '../../src/services/streaming/streamMessageService';

describe('canRegenerate', () => {
  it('returns true when last exchange is (learner, assistant) with completed status', () => {
    expect(canRegenerate({
      learner: { role: 'learner', status: 'completed' } as any,
      assistant: { role: 'assistant', status: 'completed' } as any,
    })).toBe(true);
  });
  it('returns false when there is no exchange', () => {
    expect(canRegenerate(null)).toBe(false);
  });
  it('returns false if assistant is already marked regenerated', () => {
    expect(canRegenerate({
      learner: { role: 'learner', status: 'completed' } as any,
      assistant: { role: 'assistant', status: 'regenerated' } as any,
    })).toBe(false);
  });
});
