export type FlagType = 'self_harm' | 'sexual' | 'contact_info' | 'manipulation' | 'other';
export type Severity = 'low' | 'medium' | 'high';

export interface SafetyCheckResult {
  isSafe: boolean;
  flagType?: FlagType;
  severity?: Severity;
  confidence: number;
  reason?: string;
}

interface RuleEntry {
  flagType: FlagType;
  severity: Severity;
  patterns: RegExp[];
}

const rules: RuleEntry[] = [
  {
    flagType: 'self_harm',
    severity: 'high',
    patterns: [
      // Direct self-harm intents
      /\b(kill\s+my\s*self|kill\s+me\b|self[- ]?kill|suicide|suicidal)\b/i,
      /\b(self[- ]?harm|cut\s+my\s*self|hurt\s+my\s*self|harm\s+my\s*self)\b/i,
      /\b(wanna\s+die|want\s+to\s+die|gonna\s+die|i\s+should\s+(just\s+)?die|let\s+me\s+die)\b/i,
      /\b(don'?t\s+want\s+to\s+live|no\s+reason\s+to\s+live|end\s+my\s+life|take\s+my\s+(own\s+)?life)\b/i,
      /\b(overdose|take\s+too\s+many\s+pills|hang\s+my\s*self|drown\s+my\s*self|jump\s+off|slit\s+my)\b/i,
      // Requests for methods
      /\b(how\s+to\s+(kill|hurt|harm|end|destroy)\s+(my\s*self|me|myself))\b/i,
      /\b(guide\s+(me\s+to\s+)?(self[- ]?kill|kill\s+my\s*self|suicide|harm\s+my\s*self))\b/i,
      /\b(ways?\s+to\s+(die|kill\s+my\s*self|end\s+(it|my\s+life)))\b/i,
      // Expressions of hopelessness with self-harm context
      /\b(don'?t\s+want\s+to\s+(live|be\s+alive|exist)\s+anymore)\b/i,
      /\b(life\s+(is\s+)?not\s+worth|rather\s+be\s+dead|better\s+off\s+dead|wish\s+i\s+(was|were)\s+dead)\b/i,
    ],
  },
  {
    flagType: 'sexual',
    severity: 'high',
    patterns: [
      /\b(nude|naked|sex|porn|masturbat|genitals|penis|vagina|erection|orgasm)\b/i,
      /\b(sexual|intercourse|rape|molest)\b/i,
    ],
  },
  {
    flagType: 'contact_info',
    severity: 'medium',
    patterns: [
      /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/, // phone number
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // email
      /\b(my address|where i live|come to my house|meet me|my phone number)\b/i,
    ],
  },
  {
    flagType: 'manipulation',
    severity: 'high',
    patterns: [
      /\b(don'?t tell (your parents|anyone|adults)|keep this secret|this is our secret)\b/i,
      /\b(send me (a photo|picture|video)|take a (photo|picture|video) of)\b/i,
    ],
  },
];

/**
 * Run keyword/regex-based safety checks on a text.
 * Deterministic, fast, no API calls.
 */
export function runRuleCheck(text: string): SafetyCheckResult {
  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) {
        return {
          isSafe: false,
          flagType: rule.flagType,
          severity: rule.severity,
          confidence: 1.0,
          reason: `Matched rule: ${rule.flagType}`,
        };
      }
    }
  }

  return { isSafe: true, confidence: 1.0 };
}
