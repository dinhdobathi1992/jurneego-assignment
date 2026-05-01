import { AIProvider, AIResponse, AIStreamEvent, GenerateInput, ProviderName } from './aiProvider';
import { mockProvider } from './mockProvider';
import { litellmProvider } from './litellmProvider';
import { bedrockProvider } from './bedrockProvider';
import { nineRouterProvider } from './nineRouterProvider';
import { createAiProviderAttempt } from '../../repositories/aiProviderAttemptRepository';
import { aiRequestDurationSeconds, aiProviderFailuresTotal, aiTokensTotal } from '../observability/metrics';
import { settings } from '../../config/settings';

const REGISTRY: Record<ProviderName, AIProvider> = {
  mock: mockProvider,
  litellm: litellmProvider,
  bedrock: bedrockProvider,
  '9router': nineRouterProvider,
};

// Simple in-memory circuit breaker state
const circuitBreaker: Record<string, { failures: number; openUntil: number }> = {};
const CB_THRESHOLD = 3;
const CB_RESET_MS = 30_000;

function isCircuitOpen(name: string): boolean {
  const state = circuitBreaker[name];
  if (!state) return false;
  if (state.openUntil > Date.now()) return true;
  // Reset if window has passed
  circuitBreaker[name] = { failures: 0, openUntil: 0 };
  return false;
}

function recordFailure(name: string): void {
  const state = circuitBreaker[name] ?? { failures: 0, openUntil: 0 };
  state.failures += 1;
  if (state.failures >= CB_THRESHOLD) {
    state.openUntil = Date.now() + CB_RESET_MS;
  }
  circuitBreaker[name] = state;
}

function recordSuccess(name: string): void {
  circuitBreaker[name] = { failures: 0, openUntil: 0 };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('AI_PROVIDER_TIMEOUT')), timeoutMs);
  });
  try {
    const result = await Promise.race([promise, timeout]);
    clearTimeout(timer!);
    return result as T;
  } catch (err) {
    clearTimeout(timer!);
    throw err;
  }
}

export interface RouterOptions {
  conversationId: string;
  sessionId?: string;
  messageId?: string;
}

/**
 * Call AI providers in priority order with fallback.
 * Records each attempt in the database.
 */
export async function generateWithFallback(
  input: GenerateInput,
  opts: RouterOptions
): Promise<AIResponse> {
  const order = settings.AI_PROVIDER_ORDER as ProviderName[];
  const timeoutMs = settings.AI_TIMEOUT_SECONDS * 1000;
  let lastError: Error | null = null;

  for (const name of order) {
    if (isCircuitOpen(name)) continue;

    const provider = REGISTRY[name];
    if (!provider) continue;

    const start = Date.now();
    try {
      const response = await withTimeout(provider.generateResponse(input), timeoutMs);
      recordSuccess(name);

      // Record AI metrics
      aiRequestDurationSeconds.observe(
        { provider: name, model: response.model, status: 'success' },
        response.latencyMs / 1000
      );
      if (response.inputTokens) {
        aiTokensTotal.inc({ provider: name, model: response.model, direction: 'input' }, response.inputTokens);
      }
      if (response.outputTokens) {
        aiTokensTotal.inc({ provider: name, model: response.model, direction: 'output' }, response.outputTokens);
      }

      await createAiProviderAttempt({
        conversation_id: opts.conversationId,
        session_id: opts.sessionId,
        message_id: opts.messageId,
        provider: name,
        model: response.model,
        status: 'success',
        latency_ms: response.latencyMs,
        input_tokens: response.inputTokens,
        output_tokens: response.outputTokens,
      }).catch(() => {}); // Don't fail request if audit fails

      return response;
    } catch (err) {
      lastError = err as Error;
      const latencyMs = Date.now() - start;
      const isTimeout = (err as Error).message === 'AI_PROVIDER_TIMEOUT';

      recordFailure(name);
      aiProviderFailuresTotal.inc({ provider: name, error_class: isTimeout ? 'timeout' : 'error' });
      const failedModel =
        name === 'bedrock' ? settings.BEDROCK_MODEL_ID
        : name === '9router' ? settings.NINE_ROUTER_MODEL
        : settings.LITELLM_MODEL;

      aiRequestDurationSeconds.observe(
        { provider: name, model: failedModel, status: isTimeout ? 'timeout' : 'failed' },
        latencyMs / 1000
      );

      await createAiProviderAttempt({
        conversation_id: opts.conversationId,
        session_id: opts.sessionId,
        message_id: opts.messageId,
        provider: name,
        model: failedModel,
        status: isTimeout ? 'timeout' : 'failed',
        latency_ms: latencyMs,
        error_code: (err as Error).message,
      }).catch(() => {});
    }
  }

  throw lastError ?? new Error('All AI providers failed');
}

/**
 * Stream from the first available provider.
 * Falls back to non-streaming if streaming is unavailable.
 */
export async function* streamWithFallback(
  input: GenerateInput,
  opts: RouterOptions
): AsyncGenerator<AIStreamEvent> {
  const order = settings.AI_PROVIDER_ORDER as ProviderName[];

  for (const name of order) {
    if (isCircuitOpen(name)) continue;
    const provider = REGISTRY[name];
    if (!provider) continue;

    try {
      yield* provider.streamResponse(input);
      return;
    } catch {
      recordFailure(name);
    }
  }

  yield { type: 'error', error: 'All providers failed' };
}
