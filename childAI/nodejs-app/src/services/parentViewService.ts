import { listChildrenWithDetails } from '../repositories/relationshipRepository';
import { listConversationsForLearner } from '../repositories/conversationRepository';
import { listMessages } from '../repositories/messageRepository';
import { listSessionsForParentChildren } from '../repositories/sharedSessionRepository';
import { createAuditEvent } from '../repositories/auditRepository';
import { adultViewRequestsTotal } from './observability/metrics';

/**
 * Parent view service — all reads are audit-logged and metrics-tracked.
 */

export async function getChildrenForParent(parentDbId: string) {
  adultViewRequestsTotal.inc({ role: 'parent', endpoint: 'list_children' });
  return listChildrenWithDetails(parentDbId);
}

export async function getChildSessions(parentDbId: string, childDbId: string, requestId: string) {
  adultViewRequestsTotal.inc({ role: 'parent', endpoint: 'child_sessions' });
  await createAuditEvent({
    request_id: requestId,
    actor_user_id: parentDbId,
    actor_role: 'parent',
    event_type: 'parent.view_sessions',
    entity_type: 'user',
    entity_id: childDbId,
    metadata: {},
  });
  return listSessionsForParentChildren([childDbId]);
}

export async function getChildConversations(
  parentDbId: string,
  childDbId: string,
  requestId: string,
  limit = 20
) {
  adultViewRequestsTotal.inc({ role: 'parent', endpoint: 'child_conversations' });
  await createAuditEvent({
    request_id: requestId,
    actor_user_id: parentDbId,
    actor_role: 'parent',
    event_type: 'parent.view_conversations',
    entity_type: 'user',
    entity_id: childDbId,
    metadata: {},
  });
  return listConversationsForLearner(childDbId, limit);
}

export async function getChildConversationMessages(
  parentDbId: string,
  conversationId: string,
  requestId: string,
  limit = 50
) {
  adultViewRequestsTotal.inc({ role: 'parent', endpoint: 'child_messages' });
  await createAuditEvent({
    request_id: requestId,
    actor_user_id: parentDbId,
    actor_role: 'parent',
    event_type: 'parent.view_messages',
    entity_type: 'conversation',
    entity_id: conversationId,
    metadata: {},
  });
  return listMessages(conversationId, limit);
}
