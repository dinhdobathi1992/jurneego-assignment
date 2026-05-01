import {
  createGuidanceNote,
  listGuidanceForSession,
  listGuidanceForConversation,
  CreateGuidanceNoteInput,
} from '../repositories/guidanceRepository';
import { createAuditEvent } from '../repositories/auditRepository';
import { guidanceNotesCreatedTotal } from './observability/metrics';

export async function addGuidanceNote(
  input: CreateGuidanceNoteInput,
  requestId: string
) {
  const note = await createGuidanceNote(input);

  guidanceNotesCreatedTotal.inc({ author_role: input.author_role });

  await createAuditEvent({
    request_id: requestId,
    actor_user_id: input.author_user_id,
    actor_role: input.author_role,
    event_type: 'guidance.created',
    entity_type: 'guidance_note',
    entity_id: note.id,
    metadata: { guidance_type: input.guidance_type, session_id: input.session_id },
  });

  return note;
}

export async function getSessionGuidance(
  sessionId: string,
  callerRole: string
) {
  // Learners only see child-visible notes; adults see all
  const visibilityFilter = callerRole === 'learner' ? 'child_visible' : undefined;
  return listGuidanceForSession(sessionId, visibilityFilter);
}

export async function getConversationGuidance(conversationId: string) {
  return listGuidanceForConversation(conversationId);
}
