import { generateWithFallback } from './providerRouter';
import {
  findConversationById,
  setConversationTitle,
} from '../../repositories/conversationRepository';

const TITLE_SYSTEM_PROMPT = `You will be given the first message a child sent in a chat with a learning assistant.
Reply with a short, plain-text title that names the topic — between 3 and 6 words.
Do not include quotes, punctuation, surrounding whitespace, or a trailing period.
Reply with ONLY the title.`;

const MAX_TITLE_LEN = 60;
const TITLE_MAX_TOKENS = 30;

export function sanitizeTitle(raw: string): string | null {
  const trimmed = raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[.!?]+$/, '')
    .replace(/\s+/g, ' ');
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_TITLE_LEN);
}

export async function generateAndSaveConversationTitle(
  conversationId: string,
  firstUserMessage: string,
): Promise<void> {
  try {
    // Self-guard: skip if the conversation is already titled. Lets callers
    // invoke unconditionally without tracking first-exchange state.
    const conv = await findConversationById(conversationId);
    if (!conv || conv.title !== null) return;

    const response = await generateWithFallback(
      {
        systemPrompt: TITLE_SYSTEM_PROMPT,
        history: [],
        userMessage: firstUserMessage.slice(0, 1500),
        maxTokens: TITLE_MAX_TOKENS,
      },
      { conversationId },
    );

    const title = sanitizeTitle(response.content);
    if (!title) return;
    await setConversationTitle(conversationId, title);
  } catch {
    // Silent — leaves title null so the sidebar falls back to "Chat xxxxxx".
    // Next send will retry; not worth surfacing to the user.
  }
}
