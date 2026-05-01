import { SafetyCheckResult } from './ruleSafetyChecker';
import { settings } from '../../config/settings';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

let classifierClient: OpenAI | null = null;

function getClassifierClient(): OpenAI {
  if (!classifierClient) {
    classifierClient = new OpenAI({
      baseURL: settings.LITELLM_API_BASE ?? 'http://localhost:4000/v1',
      apiKey: settings.LITELLM_API_KEY ?? 'dev',
    });
  }
  return classifierClient;
}

function loadClassifierPrompt(): string {
  try {
    const promptPath = path.resolve(process.cwd(), 'prompts/safety_classifier_prompt.txt');
    return fs.readFileSync(promptPath, 'utf-8');
  } catch {
    return `You are a child safety classifier. Analyze if the following text from a child is safe.
Return ONLY JSON in this format: {"is_safe": true/false, "flag_type": null or one of self_harm/sexual/contact_info/manipulation/other, "severity": null or low/medium/high, "confidence": 0.0-1.0, "reason": "brief reason"}`;
  }
}

/**
 * Optional LLM-based safety classifier.
 * Returns null when disabled or when the LLM call fails.
 */
export async function runLlmSafetyCheck(text: string): Promise<SafetyCheckResult | null> {
  if (!settings.SAFETY_LLM_CHECK) return null;

  const client = getClassifierClient();
  const systemPrompt = loadClassifierPrompt();

  try {
    const response = await client.chat.completions.create({
      model: settings.LITELLM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature: 0,
      max_tokens: 200,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as {
      is_safe: boolean;
      flag_type?: string;
      severity?: string;
      confidence: number;
      reason?: string;
    };

    return {
      isSafe: parsed.is_safe,
      flagType: parsed.flag_type as SafetyCheckResult['flagType'],
      severity: parsed.severity as SafetyCheckResult['severity'],
      confidence: parsed.confidence ?? 0.9,
      reason: parsed.reason,
    };
  } catch (err) {
    // Classifier failure — return null; caller decides fallback
    console.error('[safety] LLM classifier error:', (err as Error).message);
    return null;
  }
}
