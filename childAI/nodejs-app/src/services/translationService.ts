import {
  createTranslation,
  findTranslation,
} from '../repositories/translationRepository';
import { findMessageById } from '../repositories/messageRepository';
import { createAuditEvent } from '../repositories/auditRepository';
import { translationRequestsTotal } from './observability/metrics';
import OpenAI from 'openai';
import { settings } from '../config/settings';

async function translateWithLiteLLM(text: string, targetLanguage: string): Promise<string> {
  const client = new OpenAI({
    baseURL: settings.LITELLM_API_BASE ?? 'http://localhost:4000/v1',
    apiKey: settings.LITELLM_API_KEY ?? 'dev',
  });

  const response = await client.chat.completions.create({
    model: settings.LITELLM_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a translator. Translate the following text to ${targetLanguage}. Return only the translated text, nothing else.`,
      },
      { role: 'user', content: text },
    ],
    max_tokens: 1024,
  });

  return response.choices[0]?.message?.content ?? text;
}

export async function translateMessage(params: {
  messageId: string;
  targetLanguage: string;
  requestedByUserId: string;
  requestId: string;
}) {
  // Return cached translation if available
  const cached = await findTranslation(params.messageId, params.targetLanguage);
  if (cached) return cached;

  const message = await findMessageById(params.messageId);
  if (!message) throw Object.assign(new Error('MESSAGE_NOT_FOUND'), { statusCode: 404 });

  translationRequestsTotal.inc({ target_language: params.targetLanguage });

  let translatedContent: string;
  let provider: string | undefined;
  let model: string | undefined;

  try {
    translatedContent = await translateWithLiteLLM(message.content, params.targetLanguage);
    provider = 'litellm';
    model = settings.LITELLM_MODEL;
  } catch {
    // Fallback: return original text if translation fails
    translatedContent = message.content;
    provider = 'fallback';
  }

  const translation = await createTranslation({
    message_id: params.messageId,
    requested_by_user_id: params.requestedByUserId,
    source_language: message.language,
    target_language: params.targetLanguage,
    translated_content: translatedContent,
    provider,
    model,
  });

  await createAuditEvent({
    request_id: params.requestId,
    actor_user_id: params.requestedByUserId,
    event_type: 'translation.created',
    entity_type: 'message',
    entity_id: params.messageId,
    metadata: { target_language: params.targetLanguage, provider },
  });

  return translation;
}
