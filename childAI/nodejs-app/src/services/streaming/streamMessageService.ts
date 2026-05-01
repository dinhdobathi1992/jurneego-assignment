import { SSEWriter } from './sseWriter';
import { checkSafety } from '../safety/safetyService';
import { generateWithFallback, streamWithFallback } from '../ai/providerRouter';
import { AI_FALLBACK_RESPONSE } from '../ai/aiFallbacks';
import { loadSystemPrompt } from '../ai/aiProvider';
import { generateAndSaveConversationTitle } from '../ai/titleGenerator';
import {
  createMessage,
  listMessages,
  findMessageById,
} from '../../repositories/messageRepository';
import type { LatestExchange, MessageRow } from '../../repositories/messageRepository';
import { createFlag } from '../../repositories/flagRepository';
import { markConversationFlagged } from '../../repositories/conversationRepository';
import { createAuditEvent } from '../../repositories/auditRepository';
import { settings } from '../../config/settings';

/**
 * Returns true iff the conversation has a latest exchange we can regenerate
 * the assistant reply from. Used by streamRoutes before re-running the AI.
 */
export function canRegenerate(exchange: LatestExchange | null): boolean {
  if (!exchange) return false;
  if (exchange.assistant.status === 'regenerated') return false;
  return exchange.learner.role === 'learner' && exchange.assistant.role === 'assistant';
}

/**
 * Full SSE streaming message flow (§13.2 buffered safety-gated mode).
 *
 * Event sequence (safe):
 *   message.accepted → safety.checked → ai.started → ai.progress → assistant.chunk(s) → assistant.completed → done
 *
 * Event sequence (unsafe input):
 *   message.accepted → safety.checked → assistant.completed (deflection) → done
 */
export async function handleStreamingMessage(params: {
  conversationId: string;
  learnerDbId: string;
  content: string;
  requestId: string;
  sessionId?: string;
  sse: SSEWriter;
  abortSignal: AbortSignal;
  /**
   * If set, skip creating a new learner message — re-use this existing one.
   * Used by the regenerate endpoint, which already has a learner message
   * to re-run from.
   */
  regenerateFromLearnerMsgId?: string;
}): Promise<void> {
  const { sse, abortSignal } = params;

  try {
    // Emit accepted
    await sse.write({
      event: 'message.accepted',
      data: { request_id: params.requestId, conversation_id: params.conversationId },
    });

    if (abortSignal.aborted) { sse.close(); return; }

    // Save learner message (or re-use existing one for regenerate)
    // When regenerating, params.content is the original learner message text fetched
    // upstream by the route. If a future task (edit message) lets learners modify
    // their question between send and regenerate, the route must pass the EDITED
    // content as params.content while still passing the original message id as
    // regenerateFromLearnerMsgId. Don't reach into learnerMsg.content here.
    let learnerMsg: MessageRow;
    if (params.regenerateFromLearnerMsgId) {
      const existing = await findMessageById(params.regenerateFromLearnerMsgId);
      if (!existing || existing.role !== 'learner') {
        // Surfaces to the SSE client as a generic INTERNAL_ERROR via the outer
        // try/catch in this function — acceptable since this only fires on race
        // conditions or DB inconsistency, not normal user paths.
        throw new Error('REGEN_LEARNER_MESSAGE_NOT_FOUND');
      }
      learnerMsg = existing;
    } else {
      learnerMsg = await createMessage({
        conversation_id: params.conversationId,
        created_by_user_id: params.learnerDbId,
        role: 'learner',
        content: params.content,
        status: 'completed',
      });
    }

    // Input safety check
    const inputSafety = await checkSafety({
      text: params.content,
      direction: 'input',
      messageId: learnerMsg.id,
      conversationId: params.conversationId,
      sessionId: params.sessionId,
    });

    await sse.write({
      event: 'safety.checked',
      data: {
        direction: 'input',
        is_safe: inputSafety.isSafe,
        ...(inputSafety.flagType ? { flag_type: inputSafety.flagType } : {}),
      },
    });

    // Unsafe input path
    if (!inputSafety.isSafe) {
      await markConversationFlagged(params.conversationId);
      const deflection = inputSafety.deflectionMessage ?? AI_FALLBACK_RESPONSE;

      await createFlag({
        conversation_id: params.conversationId,
        session_id: params.sessionId,
        message_id: learnerMsg.id,
        flag_type: inputSafety.flagType ?? 'other',
        reason: inputSafety.reason ?? 'Safety check failed',
        severity: inputSafety.severity ?? 'medium',
      });

      const assistantMsg = await createMessage({
        conversation_id: params.conversationId,
        role: 'assistant',
        content: deflection,
        is_safe: true,
        status: 'completed',
      });

      await sse.write({
        event: 'assistant.completed',
        data: { message_id: assistantMsg.id, content: deflection, was_flagged: true },
      });
      await sse.write({ event: 'done', data: { ok: true } });
      sse.close();
      return;
    }

    if (abortSignal.aborted) { sse.close(); return; }

    // Emit ai.started — show full provider order so the client knows the chain
    const providerName = settings.AI_PROVIDER_ORDER[0] ?? 'mock';
    const startModel =
      providerName === '9router' ? settings.NINE_ROUTER_MODEL
      : providerName === 'bedrock' ? settings.BEDROCK_MODEL_ID
      : providerName === 'litellm' ? settings.LITELLM_MODEL
      : 'mock-v1';
    await sse.write({
      event: 'ai.started',
      data: {
        provider: providerName,
        model: startModel,
        provider_order: settings.AI_PROVIDER_ORDER,
      },
    });

    // Load history
    const history = await listMessages(params.conversationId, 20);

    // Buffer AI response server-side (buffered safety-gated mode)
    await sse.write({ event: 'ai.progress', data: { status: 'thinking' } });

    let bufferedContent = '';
    let aiProvider = providerName;
    let aiModel = 'unknown';

    try {
      // Use non-streaming call to buffer the full response
      const aiResponse = await generateWithFallback(
        {
          systemPrompt: loadSystemPrompt(),
          history: history.map((m) => ({
            role: m.role as 'learner' | 'assistant' | 'system',
            content: m.content,
          })),
          userMessage: params.content,
          maxTokens: settings.AI_MAX_OUTPUT_TOKENS,
        },
        { conversationId: params.conversationId, sessionId: params.sessionId }
      );

      bufferedContent = aiResponse.content;
      aiProvider = aiResponse.provider;
      aiModel = aiResponse.model;
    } catch {
      bufferedContent = AI_FALLBACK_RESPONSE;
    }

    if (abortSignal.aborted) { sse.close(); return; }

    // Output safety check on buffered content
    const outputSafety = await checkSafety({
      text: bufferedContent,
      direction: 'output',
      conversationId: params.conversationId,
      sessionId: params.sessionId,
    });

    let finalContent = bufferedContent;
    let wasFlagged = false;

    if (!outputSafety.isSafe) {
      finalContent = outputSafety.deflectionMessage ?? AI_FALLBACK_RESPONSE;
      wasFlagged = true;
      await markConversationFlagged(params.conversationId);
      await createFlag({
        conversation_id: params.conversationId,
        session_id: params.sessionId,
        message_id: learnerMsg.id,
        flag_type: outputSafety.flagType ?? 'other',
        reason: outputSafety.reason ?? 'AI output failed safety check',
        severity: outputSafety.severity ?? 'medium',
      });
    }

    // Save assistant message
    const assistantMsg = await createMessage({
      conversation_id: params.conversationId,
      role: 'assistant',
      content: finalContent,
      is_safe: !wasFlagged,
      safety_score: outputSafety.confidence,
      ai_provider: aiProvider,
      ai_model: aiModel,
      status: 'completed',
    });

    // Stream approved content in chunks
    const words = finalContent.split(' ');
    const CHUNK_SIZE = 5;
    for (let i = 0; i < words.length; i += CHUNK_SIZE) {
      if (abortSignal.aborted) break;
      const chunk = words.slice(i, i + CHUNK_SIZE).join(' ') + ' ';
      await sse.write({ event: 'assistant.chunk', data: { content: chunk } });
    }

    await sse.write({
      event: 'assistant.completed',
      data: { message_id: assistantMsg.id, is_safe: !wasFlagged },
    });

    await createAuditEvent({
      request_id: params.requestId,
      actor_user_id: params.learnerDbId,
      actor_role: 'learner',
      event_type: 'message.created',
      entity_type: 'message',
      entity_id: assistantMsg.id,
      metadata: { provider: aiProvider, streaming: true, was_flagged: wasFlagged },
    });

    // Auto-title untitled conversations after the first safe exchange.
    // Fire-and-forget — the generator self-guards if a title already exists.
    if (!wasFlagged) {
      void generateAndSaveConversationTitle(params.conversationId, params.content);
    }

    await sse.write({
      event: 'done',
      data: { ok: true, ai_provider: aiProvider, ai_model: aiModel },
    });
  } catch (err) {
    console.error('[streamMessageService] unhandled error:', err);
    await sse.write({
      event: 'error',
      data: {
        code: 'INTERNAL_ERROR',
        message: 'The assistant is temporarily unavailable.',
      },
    });
    await sse.write({ event: 'done', data: { ok: false } });
  } finally {
    sse.close();
  }
}
