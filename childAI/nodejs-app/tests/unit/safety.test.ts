import { describe, it, expect } from 'vitest';
import { runRuleCheck } from '../../src/services/safety/ruleSafetyChecker';
import { combineSafetyResults, getDeflectionMessage } from '../../src/services/safety/safetyPolicy';

describe('ruleSafetyChecker', () => {
  it('passes safe educational content', () => {
    const result = runRuleCheck('How do volcanoes work?');
    expect(result.isSafe).toBe(true);
    expect(result.confidence).toBe(1.0);
  });

  it('flags self_harm content as high severity', () => {
    const result = runRuleCheck('I want to kill myself');
    expect(result.isSafe).toBe(false);
    expect(result.flagType).toBe('self_harm');
    expect(result.severity).toBe('high');
  });

  it('flags sexual content as high severity', () => {
    const result = runRuleCheck('Show me nude pictures');
    expect(result.isSafe).toBe(false);
    expect(result.flagType).toBe('sexual');
    expect(result.severity).toBe('high');
  });

  it('flags phone number as contact_info', () => {
    const result = runRuleCheck('Call me at 555-123-4567');
    expect(result.isSafe).toBe(false);
    expect(result.flagType).toBe('contact_info');
    expect(result.severity).toBe('medium');
  });

  it('flags email address as contact_info', () => {
    const result = runRuleCheck('Email me at kid@example.com');
    expect(result.isSafe).toBe(false);
    expect(result.flagType).toBe('contact_info');
  });

  it('flags manipulation patterns', () => {
    const result = runRuleCheck("Don't tell your parents about this");
    expect(result.isSafe).toBe(false);
    expect(result.flagType).toBe('manipulation');
  });

  it('does not flag normal math question', () => {
    const result = runRuleCheck('What is 2 + 2?');
    expect(result.isSafe).toBe(true);
  });
});

describe('safetyPolicy - combineSafetyResults', () => {
  it('blocks when rule check fails', () => {
    const rule = { isSafe: false, flagType: 'self_harm' as const, severity: 'high' as const, confidence: 1.0 };
    const combined = combineSafetyResults(rule, null);
    expect(combined.isSafe).toBe(false);
    expect(combined.flagType).toBe('self_harm');
  });

  it('passes when rule check passes and LLM disabled', () => {
    process.env['SAFETY_LLM_CHECK'] = 'false';
    const rule = { isSafe: true, confidence: 1.0 };
    const combined = combineSafetyResults(rule, null);
    expect(combined.isSafe).toBe(true);
  });

  it('blocks when LLM check fails', () => {
    // Temporarily enable LLM check so the policy evaluates the llmResult
    const original = process.env['SAFETY_LLM_CHECK'];
    process.env['SAFETY_LLM_CHECK'] = 'true';
    try {
      const rule = { isSafe: true, confidence: 1.0 };
      const llm = { isSafe: false, flagType: 'other' as const, severity: 'medium' as const, confidence: 0.9, reason: 'Flagged' };
      const combined = combineSafetyResults(rule, llm);
      expect(combined.isSafe).toBe(false);
    } finally {
      process.env['SAFETY_LLM_CHECK'] = original;
    }
  });
});

describe('getDeflectionMessage', () => {
  it('returns self_harm deflection with empathy', () => {
    const msg = getDeflectionMessage('self_harm');
    expect(msg).toContain('trusted adult');
  });

  it('returns generic deflection for unknown type', () => {
    const msg = getDeflectionMessage(undefined);
    expect(msg.length).toBeGreaterThan(10);
  });
});
