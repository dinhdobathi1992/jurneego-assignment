/**
 * Safe child-friendly fallback text when all AI providers fail.
 */
export const AI_FALLBACK_RESPONSE =
  "I'm having a little trouble thinking right now. Can you try asking me again in a moment? I still want to help you learn. 🌟";

/**
 * Determine if an error is retryable (network, timeout) vs. permanent (auth, quota).
 */
export function isRetryableError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('network') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('429')
  );
}
