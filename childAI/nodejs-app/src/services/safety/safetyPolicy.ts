import { SafetyCheckResult, FlagType } from './ruleSafetyChecker';
import { settings } from '../../config/settings';

/**
 * Combine rule and LLM checker results into a final safety decision.
 *
 * Policy rules (from plan §10):
 * 1. High severity rule result → block immediately
 * 2. Medium severity rule result → block (conservative child-safe default)
 * 3. LLM result unsafe → block
 * 4. If both disagree and one is high severity → block
 * 5. LLM classifier failure → conservative fallback based on environment
 *
 * Note: llmEnabled is read from live env so tests can override it per-case.
 */
export function combineSafetyResults(
  ruleResult: SafetyCheckResult,
  llmResult: SafetyCheckResult | null
): SafetyCheckResult {
  // Case 1 & 2: Rule caught something → block
  if (!ruleResult.isSafe) {
    return ruleResult;
  }

  // Read live env so tests can toggle this without reloading the module
  const llmEnabled = process.env['SAFETY_LLM_CHECK'] === 'true' || settings.SAFETY_LLM_CHECK;

  // LLM not used or unavailable
  if (!llmEnabled || llmResult === null) {
    // LLM disabled — trust rule check
    if (!llmEnabled) {
      return ruleResult;
    }

    // LLM failed (returned null) — conservative production fallback
    if (settings.APP_ENV === 'production') {
      return {
        isSafe: false,
        flagType: 'other',
        severity: 'medium',
        confidence: 0.5,
        reason: 'Safety classifier unavailable — conservative block in production',
      };
    }

    // Non-production: trust rule check even without LLM
    return ruleResult;
  }

  // Case 3: LLM says unsafe
  if (!llmResult.isSafe) {
    return llmResult;
  }

  // Both safe
  return {
    isSafe: true,
    confidence: Math.min(ruleResult.confidence, llmResult.confidence),
    reason: 'Both rule and LLM check passed',
  };
}

/**
 * Get a safe child-appropriate deflection message for a given flag type.
 */
export function getDeflectionMessage(flagType?: FlagType): string {
  switch (flagType) {
    case 'self_harm':
      return "I'm really glad you reached out, and I care about you. I'm not able to help with that, but what you're feeling matters and you deserve support. Please talk to a trusted adult right now — a parent, teacher, or school counselor. If you're in a crisis, you can call or text 988 (US/Canada) or your local emergency number. You are not alone. 💙";
    case 'sexual':
      return "That's not something I can help with. Let's explore a fun and interesting learning topic instead! 🌟";
    case 'contact_info':
      return "It's really important to keep personal information like phone numbers and addresses private online. Let's learn more about staying safe on the internet!";
    case 'manipulation':
      return "If something doesn't feel right, please tell a trusted adult like a parent or teacher right away. They're there to help you. 💙";
    default:
      return "I'm not able to help with that, but I'd love to help you explore something amazing! What would you like to learn about? 🌟";
  }
}
