import { listUnreviewedFlags, reviewFlag, findFlagById, listFlagsByConversation } from '../repositories/flagRepository';
import { findConversationById } from '../repositories/conversationRepository';
import { listMessages } from '../repositories/messageRepository';
import { createAuditEvent } from '../repositories/auditRepository';
import { isAssignedTeacher } from '../auth/ownership';
import { getDb } from '../db/kysely';
import { FlagRow } from '../repositories/flagRepository';

export interface EnrichedFlag extends FlagRow {
  learner_name: string | null;
  conversation_title: string | null;
  flagged_message_preview: string | null;
}

export interface FlaggedConversationDetail {
  conversation: Awaited<ReturnType<typeof findConversationById>>;
  messages: Awaited<ReturnType<typeof listMessages>>;
  flags: FlagRow[];
}

async function enrichFlags(flags: FlagRow[]): Promise<EnrichedFlag[]> {
  const db = getDb();
  if (!flags.length) return [];

  const convIds  = [...new Set(flags.map(f => f.conversation_id))];
  const msgIds   = [...new Set(flags.map(f => f.message_id).filter(Boolean))];

  const [convRows, msgRows] = await Promise.all([
    db.selectFrom('conversations as c')
      .innerJoin('users as u', 'u.id', 'c.learner_user_id')
      .select(['c.id', 'c.title', 'u.display_name', 'u.external_subject'])
      .where('c.id', 'in', convIds)
      .execute(),
    msgIds.length
      ? db.selectFrom('messages').select(['id', 'content']).where('id', 'in', msgIds).execute()
      : Promise.resolve([]),
  ]);

  const convMap = new Map(convRows.map(r => [r.id, r]));
  const msgMap  = new Map(msgRows.map(r => [r.id, r]));

  return flags.map(f => {
    const conv = convMap.get(f.conversation_id);
    const msg  = msgMap.get(f.message_id);
    return {
      ...f,
      learner_name: (() => { const d = (conv as any)?.display_name?.trim(); const s = String((conv as any)?.external_subject ?? ''); return d || (/^\d+$/.test(s) ? null : s.slice(0, 20)) || null; })(),
      conversation_title: conv?.title ?? null,
      flagged_message_preview: msg?.content ? String(msg.content).slice(0, 80) : null,
    };
  });
}

/**
 * List unreviewed flags, enriched with learner name + conversation title.
 * - Admins see all.
 * - Teachers see only flags for conversations belonging to their assigned students.
 */
export async function listFlaggedForReview(
  limit = 20,
  callerDbId?: string,
  callerRole?: string
): Promise<EnrichedFlag[]> {
  const flags = await listUnreviewedFlags(limit * 5); // over-fetch, then filter for teachers

  let result: FlagRow[];

  if (!callerDbId || callerRole === 'admin') {
    result = flags.slice(0, limit);
  } else if (callerRole === 'teacher') {
    const db = getDb();
    const teacherClasses = await db
      .selectFrom('classroom_memberships')
      .select('classroom_id')
      .where('user_id', '=', callerDbId)
      .where('membership_role', '=', 'teacher')
      .where('status', '=', 'active')
      .execute();

    if (teacherClasses.length === 0) return [];
    const classIds = teacherClasses.map((c) => c.classroom_id);

    const students = await db
      .selectFrom('classroom_memberships')
      .select('user_id')
      .where('classroom_id', 'in', classIds)
      .where('membership_role', '=', 'student')
      .where('status', '=', 'active')
      .execute();

    if (students.length === 0) return [];
    const studentIds = new Set(students.map((s) => s.user_id));

    const scoped: FlagRow[] = [];
    for (const flag of flags) {
      if (scoped.length >= limit) break;
      const conv = await findConversationById(flag.conversation_id);
      if (conv && studentIds.has(conv.learner_user_id)) {
        scoped.push(flag);
      }
    }
    result = scoped;
  } else {
    return [];
  }

  return enrichFlags(result);
}

export async function getFlaggedConversationDetail(
  conversationId: string,
  callerDbId?: string,
  callerRole?: string
): Promise<FlaggedConversationDetail | null> {
  const conv = await findConversationById(conversationId);
  if (!conv) return null;

  // Teachers must be assigned to this student
  if (callerRole === 'teacher' && callerDbId) {
    const assigned = await isAssignedTeacher(callerDbId, conv.learner_user_id);
    if (!assigned) return null;
  }

  const [messages, flags] = await Promise.all([
    listMessages(conversationId),
    listFlagsByConversation(conversationId),
  ]);

  return { conversation: conv, messages, flags };
}

export async function reviewFlagById(params: {
  flagId: string;
  reviewerUserId: string;
  reviewerRole: string;
  reviewerNotes?: string;
  requestId: string;
}): Promise<void> {
  const flag = await findFlagById(params.flagId);
  if (!flag) throw new Error('FLAG_NOT_FOUND');

  // Teachers can only review flags scoped to their students
  if (params.reviewerRole === 'teacher') {
    const conv = await findConversationById(flag.conversation_id);
    if (!conv) throw new Error('CONVERSATION_NOT_FOUND');
    const assigned = await isAssignedTeacher(params.reviewerUserId, conv.learner_user_id);
    if (!assigned) throw Object.assign(new Error('ACCESS_DENIED'), { statusCode: 403 });
  }

  await reviewFlag(params.flagId, params.reviewerUserId, params.reviewerNotes);

  await createAuditEvent({
    request_id: params.requestId,
    actor_user_id: params.reviewerUserId,
    event_type: 'flag.reviewed',
    entity_type: 'flag',
    entity_id: params.flagId,
    metadata: { reviewer_notes: params.reviewerNotes },
  });
}
