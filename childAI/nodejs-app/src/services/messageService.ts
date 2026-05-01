import { findConversationById, markConversationFlagged } from '../repositories/conversationRepository';
import { createMessage, listMessages } from '../repositories/messageRepository';
import { createFlag } from '../repositories/flagRepository';
import { createAuditEvent } from '../repositories/auditRepository';
import { checkSafety } from './safety/safetyService';
import { generateWithFallback } from './ai/providerRouter';
import { AI_FALLBACK_RESPONSE } from './ai/aiFallbacks';
import { loadSystemPrompt } from './ai/aiProvider';
import { generateAndSaveConversationTitle } from './ai/titleGenerator';
import { checkDailyBudget } from './rateLimit/limiter';
import { settings } from '../config/settings';

/** Daily AI message budget per learner. Configurable via env; defaults to 100. */
const DAILY_MESSAGE_BUDGET = parseInt(process.env['DAILY_MESSAGE_BUDGET'] ?? '100', 10);

export interface SendMessageResult {
  learner_message: {
    id: string;
    conversation_id: string;
    role: string;
    content: string;
    is_safe: boolean;
    safety_score: number;
    created_at: Date;
  };
  assistant_message: {
    id: string;
    conversation_id: string;
    role: string;
    content: string;
    is_safe: boolean;
    safety_score: number;
    created_at: Date;
  };
  was_flagged: boolean;
  flag_reason: string | null;
  ai_provider: string;
  ai_model: string;
  ai_latency_ms: number;
}

/**
 * Non-streaming safe message flow.
 * Follows the plan §13.1 pattern:
 *   1. Save learner message
 *   2. Input safety check
 *   3. If unsafe → flag, deflect, return
 *   4. Call AI outside transaction
 *   5. Output safety check
 *   6. Save assistant message, return
 */
export async function sendMessage(params: {
  conversationId: string;
  learnerDbId: string;
  content: string;
  requestId: string;
  sessionId?: string;
}): Promise<SendMessageResult> {
  const conv = await findConversationById(params.conversationId);
  if (!conv) throw new Error('CONVERSATION_NOT_FOUND');

  // Step 1: Save learner message (short transaction — single insert)
  const learnerMsg = await createMessage({
    conversation_id: params.conversationId,
    created_by_user_id: params.learnerDbId,
    role: 'learner',
    content: params.content,
    status: 'completed',
  });

  // Step 2: Input safety check
  const inputSafety = await checkSafety({
    text: params.content,
    direction: 'input',
    messageId: learnerMsg.id,
    conversationId: params.conversationId,
    sessionId: params.sessionId,
  });

  // Step 3: Unsafe input → flag, deflect
  if (!inputSafety.isSafe) {
    await markConversationFlagged(params.conversationId);

    const flag = await createFlag({
      conversation_id: params.conversationId,
      session_id: params.sessionId,
      message_id: learnerMsg.id,
      flag_type: inputSafety.flagType ?? 'other',
      reason: inputSafety.reason ?? 'Safety check failed',
      severity: inputSafety.severity ?? 'medium',
    });

    const deflectionText =
      inputSafety.deflectionMessage ?? AI_FALLBACK_RESPONSE;

    const assistantMsg = await createMessage({
      conversation_id: params.conversationId,
      role: 'assistant',
      content: deflectionText,
      is_safe: true,
      safety_score: 1.0,
      status: 'completed',
    });

    await createAuditEvent({
      request_id: params.requestId,
      actor_user_id: params.learnerDbId,
      actor_role: 'learner',
      event_type: 'message.flagged',
      entity_type: 'message',
      entity_id: learnerMsg.id,
      metadata: { flag_id: flag.id, flag_type: inputSafety.flagType },
    });

    return {
      learner_message: {
        id: learnerMsg.id,
        conversation_id: learnerMsg.conversation_id,
        role: 'learner',
        content: learnerMsg.content,
        is_safe: false,
        safety_score: inputSafety.confidence,
        created_at: learnerMsg.created_at,
      },
      assistant_message: {
        id: assistantMsg.id,
        conversation_id: assistantMsg.conversation_id,
        role: 'assistant',
        content: deflectionText,
        is_safe: true,
        safety_score: 1.0,
        created_at: assistantMsg.created_at,
      },
      was_flagged: true,
      flag_reason: inputSafety.flagType ?? 'unsafe_content',
      ai_provider: 'none',
      ai_model: 'none',
      ai_latency_ms: 0,
    };
  }

  // Step 4a: Enforce daily AI budget before calling the provider
  const budget = await checkDailyBudget(params.learnerDbId, DAILY_MESSAGE_BUDGET);
  if (!budget.allowed) {
    const deflectionText = "You've reached your daily learning limit. Come back tomorrow to keep exploring! 🌟";
    const assistantMsg = await createMessage({
      conversation_id: params.conversationId,
      role: 'assistant',
      content: deflectionText,
      is_safe: true,
      safety_score: 1.0,
      status: 'completed',
    });
    return {
      learner_message: {
        id: learnerMsg.id,
        conversation_id: learnerMsg.conversation_id,
        role: 'learner',
        content: learnerMsg.content,
        is_safe: true,
        safety_score: inputSafety.confidence,
        created_at: learnerMsg.created_at,
      },
      assistant_message: {
        id: assistantMsg.id,
        conversation_id: assistantMsg.conversation_id,
        role: 'assistant',
        content: deflectionText,
        is_safe: true,
        safety_score: 1.0,
        created_at: assistantMsg.created_at,
      },
      was_flagged: false,
      flag_reason: null,
      ai_provider: 'none',
      ai_model: 'none',
      ai_latency_ms: 0,
    };
  }

  // Step 4b: Load history and call AI (outside any transaction)
  const history = await listMessages(params.conversationId, 20);
  const systemPrompt = loadSystemPrompt();

  let aiContent = AI_FALLBACK_RESPONSE;
  let aiProvider = 'mock';
  let aiModel = 'mock-v1';
  let aiLatency = 0;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  try {
    const aiResponse = await generateWithFallback(
      {
        systemPrompt,
        history: history.map((m) => ({
          role: m.role as 'learner' | 'assistant' | 'system',
          content: m.content,
        })),
        userMessage: params.content,
        maxTokens: settings.AI_MAX_OUTPUT_TOKENS,
      },
      {
        conversationId: params.conversationId,
        sessionId: params.sessionId,
      }
    );

    aiContent = aiResponse.content;
    aiProvider = aiResponse.provider;
    aiModel = aiResponse.model;
    aiLatency = aiResponse.latencyMs;
    inputTokens = aiResponse.inputTokens;
    outputTokens = aiResponse.outputTokens;
  } catch {
    // All providers failed — use fallback text
  }

  // Step 5: Output safety check
  const outputSafety = await checkSafety({
    text: aiContent,
    direction: 'output',
    conversationId: params.conversationId,
    sessionId: params.sessionId,
  });

  let finalContent = aiContent;
  let wasFlagged = false;

  if (!outputSafety.isSafe) {
    finalContent = outputSafety.deflectionMessage ?? AI_FALLBACK_RESPONSE;
    wasFlagged = true;
    await markConversationFlagged(params.conversationId);
  }

  // Step 6: Save assistant message
  const assistantMsg = await createMessage({
    conversation_id: params.conversationId,
    role: 'assistant',
    content: finalContent,
    is_safe: !wasFlagged,
    safety_score: outputSafety.confidence,
    ai_provider: aiProvider,
    ai_model: aiModel,
    latency_ms: aiLatency,
    token_count: outputTokens,
    status: 'completed',
  });

  await createAuditEvent({
    request_id: params.requestId,
    actor_user_id: params.learnerDbId,
    actor_role: 'learner',
    event_type: 'message.created',
    entity_type: 'message',
    entity_id: assistantMsg.id,
    metadata: { provider: aiProvider, model: aiModel, was_flagged: wasFlagged },
  });

  // Auto-title untitled conversations after the first safe exchange.
  // Fire-and-forget — must not delay the user-facing response.
  if (conv.title === null && !wasFlagged) {
    void generateAndSaveConversationTitle(conv.id, params.content);
  }

  return {
    learner_message: {
      id: learnerMsg.id,
      conversation_id: learnerMsg.conversation_id,
      role: 'learner',
      content: learnerMsg.content,
      is_safe: true,
      safety_score: inputSafety.confidence,
      created_at: learnerMsg.created_at,
    },
    assistant_message: {
      id: assistantMsg.id,
      conversation_id: assistantMsg.conversation_id,
      role: 'assistant',
      content: finalContent,
      is_safe: !wasFlagged,
      safety_score: outputSafety.confidence,
      created_at: assistantMsg.created_at,
    },
    was_flagged: wasFlagged,
    flag_reason: wasFlagged ? (outputSafety.flagType ?? 'unsafe_output') : null,
    ai_provider: aiProvider,
    ai_model: aiModel,
    ai_latency_ms: aiLatency,
  };
}
