import {
  findSharedSessionById,
  listSessionsForLearner,
  listParticipants,
} from '../repositories/sharedSessionRepository';
import { listConversationsForLearner } from '../repositories/conversationRepository';
import { listMessages } from '../repositories/messageRepository';
import { listGuidanceForSession } from '../repositories/guidanceRepository';
import { listObjectivesForSession } from '../repositories/learningObjectiveRepository';

export async function getSharedSessionDetail(sessionId: string, callerRole: string) {
  const session = await findSharedSessionById(sessionId);
  if (!session) return null;

  const [participants, objectives, guidance] = await Promise.all([
    listParticipants(sessionId),
    listObjectivesForSession(sessionId),
    listGuidanceForSession(sessionId, callerRole === 'learner' ? 'child_visible' : undefined),
  ]);

  return { session, participants, objectives, guidance };
}

export async function getSessionTimeline(
  sessionId: string,
  learnerUserId: string,
  limit = 50
) {
  const conversations = await listConversationsForLearner(learnerUserId, limit);
  const sessionConversations = conversations.filter(
    (c) => c.shared_session_id === sessionId
  );

  const timeline = await Promise.all(
    sessionConversations.map(async (conv) => ({
      conversation: conv,
      messages: await listMessages(conv.id, 20),
    }))
  );

  return timeline;
}

export async function getLearnerSessions(learnerUserId: string) {
  return listSessionsForLearner(learnerUserId);
}
