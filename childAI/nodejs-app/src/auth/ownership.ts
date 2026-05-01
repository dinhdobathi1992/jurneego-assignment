import { getDb } from '../db/kysely';

/**
 * Check if the caller owns the conversation
 * (conversation.learner_user_id === callerDbId).
 */
export async function canAccessConversation(
  conversationId: string,
  callerDbId: string,
  callerRole: string
): Promise<boolean> {
  if (callerRole === 'admin') return true;

  const db = getDb();
  const conv = await db
    .selectFrom('conversations')
    .select(['learner_user_id', 'shared_session_id'])
    .where('id', '=', conversationId)
    .executeTakeFirst();

  if (!conv) return false;

  // Learner owns it
  if (conv.learner_user_id === callerDbId) return true;

  // Parent: must be linked to the child
  if (callerRole === 'parent') {
    const link = await db
      .selectFrom('parent_child_links')
      .select('id')
      .where('parent_user_id', '=', callerDbId)
      .where('child_user_id', '=', conv.learner_user_id)
      .where('status', '=', 'active')
      .executeTakeFirst();
    return !!link;
  }

  // Teacher: must be in same classroom as learner or a session participant
  if (callerRole === 'teacher') {
    if (conv.shared_session_id) {
      const participant = await db
        .selectFrom('session_participants')
        .select('id')
        .where('session_id', '=', conv.shared_session_id)
        .where('user_id', '=', callerDbId)
        .where('left_at', 'is', null)
        .executeTakeFirst();
      if (participant) return true;
    }

    // Check classroom membership overlap
    const teacherClasses = await db
      .selectFrom('classroom_memberships')
      .select('classroom_id')
      .where('user_id', '=', callerDbId)
      .where('membership_role', '=', 'teacher')
      .where('status', '=', 'active')
      .execute();

    if (teacherClasses.length === 0) return false;

    const classIds = teacherClasses.map((c) => c.classroom_id);
    const studentMembership = await db
      .selectFrom('classroom_memberships')
      .select('id')
      .where('user_id', '=', conv.learner_user_id)
      .where('classroom_id', 'in', classIds)
      .where('status', '=', 'active')
      .executeTakeFirst();

    return !!studentMembership;
  }

  return false;
}

/**
 * Check whether a parent can access a child's data.
 */
export async function isLinkedParent(parentDbId: string, childDbId: string): Promise<boolean> {
  const db = getDb();
  const link = await db
    .selectFrom('parent_child_links')
    .select('id')
    .where('parent_user_id', '=', parentDbId)
    .where('child_user_id', '=', childDbId)
    .where('status', '=', 'active')
    .executeTakeFirst();
  return !!link;
}

/**
 * Check whether a teacher is assigned to a session or classroom containing the student.
 */
export async function isAssignedTeacher(
  teacherDbId: string,
  studentDbId: string,
  sessionId?: string
): Promise<boolean> {
  const db = getDb();

  if (sessionId) {
    const participant = await db
      .selectFrom('session_participants')
      .select('id')
      .where('session_id', '=', sessionId)
      .where('user_id', '=', teacherDbId)
      .where('left_at', 'is', null)
      .executeTakeFirst();
    if (participant) return true;
  }

  const teacherClasses = await db
    .selectFrom('classroom_memberships')
    .select('classroom_id')
    .where('user_id', '=', teacherDbId)
    .where('membership_role', '=', 'teacher')
    .where('status', '=', 'active')
    .execute();

  if (teacherClasses.length === 0) return false;
  const classIds = teacherClasses.map((c) => c.classroom_id);

  const studentMembership = await db
    .selectFrom('classroom_memberships')
    .select('id')
    .where('user_id', '=', studentDbId)
    .where('classroom_id', 'in', classIds)
    .where('status', '=', 'active')
    .executeTakeFirst();

  return !!studentMembership;
}
