import {
  createConversation,
  findConversationById,
  listConversationsForLearner,
  listFlaggedConversations,
  ConversationRow,
} from '../repositories/conversationRepository';
import { listMessages } from '../repositories/messageRepository';
import { listFlagsByConversation } from '../repositories/flagRepository';
import { getDb } from '../db/kysely';

export interface ConversationWithDetails extends ConversationRow {
  messages?: Awaited<ReturnType<typeof listMessages>>;
  flags?: Awaited<ReturnType<typeof listFlagsByConversation>>;
}

/**
 * Verify the caller is an active participant in the given shared session.
 * Throws if the session does not exist or the caller is not a participant.
 */
async function assertSharedSessionParticipant(
  sessionId: string,
  callerDbId: string
): Promise<void> {
  const db = getDb();
  const session = await db
    .selectFrom('shared_sessions')
    .select('id')
    .where('id', '=', sessionId)
    .where('status', '!=', 'closed')
    .executeTakeFirst();

  if (!session) {
    throw Object.assign(new Error('SHARED_SESSION_NOT_FOUND'), { statusCode: 404 });
  }

  const participant = await db
    .selectFrom('session_participants')
    .select('id')
    .where('session_id', '=', sessionId)
    .where('user_id', '=', callerDbId)
    .where('left_at', 'is', null)
    .executeTakeFirst();

  if (!participant) {
    throw Object.assign(new Error('NOT_SESSION_PARTICIPANT'), { statusCode: 403 });
  }
}

export async function createNewConversation(params: {
  learnerUserId: string;
  sharedSessionId?: string;
  title?: string;
}): Promise<ConversationRow> {
  if (params.sharedSessionId) {
    await assertSharedSessionParticipant(params.sharedSessionId, params.learnerUserId);
  }

  return createConversation({
    learner_user_id: params.learnerUserId,
    shared_session_id: params.sharedSessionId,
    title: params.title,
  });
}

export async function getConversation(
  id: string,
  includeMessages = false
): Promise<ConversationWithDetails | null> {
  const conv = await findConversationById(id);
  if (!conv) return null;

  const result: ConversationWithDetails = { ...conv };

  if (includeMessages) {
    result.messages = await listMessages(id);
    result.flags = await listFlagsByConversation(id);
  }

  return result;
}

export async function listLearnerConversations(
  learnerUserId: string,
  limit = 20,
  cursor?: string
): Promise<ConversationRow[]> {
  return listConversationsForLearner(learnerUserId, limit, cursor);
}

export async function listAllFlaggedConversations(
  limit = 20
): Promise<ConversationRow[]> {
  return listFlaggedConversations(limit);
}
