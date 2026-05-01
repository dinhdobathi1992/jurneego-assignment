import { runRuleCheck, SafetyCheckResult } from './ruleSafetyChecker';
import { runLlmSafetyCheck } from './llmSafetyChecker';
import { combineSafetyResults, getDeflectionMessage } from './safetyPolicy';
import { createSafetyAssessment } from '../../repositories/safetyRepository';
import { safetyChecksTotal, flagsCreatedTotal } from '../observability/metrics';
import { settings } from '../../config/settings';

export interface SafetyAssessment {
  isSafe: boolean;
  flagType?: string;
  severity?: string;
  confidence: number;
  reason?: string;
  deflectionMessage?: string;
}

/**
 * Run full safety check on a text (input or output direction).
 * Persists the assessment to the database.
 */
export async function checkSafety(params: {
  text: string;
  direction: 'input' | 'output';
  messageId?: string;
  conversationId?: string;
  sessionId?: string;
}): Promise<SafetyAssessment> {
  if (!settings.SAFETY_ENABLED) {
    return { isSafe: true, confidence: 1.0 };
  }

  // Step 1: Rule check (always)
  const ruleResult = runRuleCheck(params.text);

  // Step 2: Optional LLM check (only if enabled and rule passes)
  let llmResult: SafetyCheckResult | null = null;
  if (settings.SAFETY_LLM_CHECK && ruleResult.isSafe) {
    llmResult = await runLlmSafetyCheck(params.text);
  }

  // Step 3: Combine
  const finalResult = combineSafetyResults(ruleResult, llmResult);

  // Step 4: Persist assessment
  try {
    await createSafetyAssessment({
      message_id: params.messageId,
      conversation_id: params.conversationId,
      session_id: params.sessionId,
      direction: params.direction,
      checker: llmResult ? 'llm' : 'rule',
      is_safe: finalResult.isSafe,
      flag_type: finalResult.flagType,
      severity: finalResult.severity,
      confidence: finalResult.confidence,
      reason: finalResult.reason,
    });
  } catch (err) {
    // Don't fail the request if audit persistence fails — log and continue
    console.error('[safety] Failed to persist assessment:', (err as Error).message);
  }

  // Increment safety check metric
  safetyChecksTotal.inc({
    direction: params.direction,
    checker: llmResult ? 'llm' : 'rule',
    result: finalResult.isSafe ? 'safe' : 'unsafe',
    flag_type: finalResult.flagType ?? 'none',
  });

  if (!finalResult.isSafe && finalResult.flagType) {
    flagsCreatedTotal.inc({
      flag_type: finalResult.flagType,
      severity: finalResult.severity ?? 'unknown',
    });
  }

  const assessment: SafetyAssessment = {
    isSafe: finalResult.isSafe,
    flagType: finalResult.flagType,
    severity: finalResult.severity,
    confidence: finalResult.confidence,
    reason: finalResult.reason,
  };

  if (!finalResult.isSafe) {
    assessment.deflectionMessage = getDeflectionMessage(finalResult.flagType);
  }

  return assessment;
}
