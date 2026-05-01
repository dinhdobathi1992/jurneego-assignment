import { listClassroomsForTeacher, listMembersWithDetails } from '../repositories/classroomRepository';
import { listConversationsForLearner } from '../repositories/conversationRepository';
import { listMessages } from '../repositories/messageRepository';
import { listSessionsForTeacher } from '../repositories/sharedSessionRepository';
import { createAuditEvent } from '../repositories/auditRepository';
import { adultViewRequestsTotal } from './observability/metrics';
import { resolveName } from '../utils/nameUtils';

/**
 * Teacher view service — all reads are audit-logged and metrics-tracked.
 */

export async function getClassroomsForTeacher(teacherDbId: string) {
  adultViewRequestsTotal.inc({ role: 'teacher', endpoint: 'list_classrooms' });
  return listClassroomsForTeacher(teacherDbId);
}

export async function getStudentsInClassroom(teacherDbId: string, classroomId: string) {
  adultViewRequestsTotal.inc({ role: 'teacher', endpoint: 'list_students' });
  const members = await listMembersWithDetails(classroomId);
  return members.map(m => ({
    id: m.user_id,
    name: resolveName(m.display_name, m.external_subject, m.email),
    display_name: m.display_name,
    email: m.email,
    primary_role: m.primary_role,
  }));
}

export async function getTeacherSessions(teacherDbId: string, requestId: string) {
  adultViewRequestsTotal.inc({ role: 'teacher', endpoint: 'list_sessions' });
  await createAuditEvent({
    request_id: requestId,
    actor_user_id: teacherDbId,
    actor_role: 'teacher',
    event_type: 'teacher.view_sessions',
    entity_type: 'teacher',
    entity_id: teacherDbId,
    metadata: {},
  });
  return listSessionsForTeacher(teacherDbId);
}

export async function getStudentConversations(
  teacherDbId: string,
  studentDbId: string,
  requestId: string,
  limit = 20
) {
  adultViewRequestsTotal.inc({ role: 'teacher', endpoint: 'student_conversations' });
  await createAuditEvent({
    request_id: requestId,
    actor_user_id: teacherDbId,
    actor_role: 'teacher',
    event_type: 'teacher.view_conversations',
    entity_type: 'user',
    entity_id: studentDbId,
    metadata: {},
  });
  return listConversationsForLearner(studentDbId, limit);
}

export async function getStudentMessages(
  teacherDbId: string,
  conversationId: string,
  requestId: string,
  limit = 50
) {
  adultViewRequestsTotal.inc({ role: 'teacher', endpoint: 'student_messages' });
  await createAuditEvent({
    request_id: requestId,
    actor_user_id: teacherDbId,
    actor_role: 'teacher',
    event_type: 'teacher.view_messages',
    entity_type: 'conversation',
    entity_id: conversationId,
    metadata: {},
  });
  return listMessages(conversationId, limit);
}
