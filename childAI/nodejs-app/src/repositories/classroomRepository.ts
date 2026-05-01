import { getDb } from '../db/kysely';

export interface ClassroomRow {
  id: string;
  school_id: string | null;
  name: string;
  grade_level: string | null;
  academic_year: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ClassroomMembershipRow {
  id: string;
  classroom_id: string;
  user_id: string;
  membership_role: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export async function listClassroomsForTeacher(teacherUserId: string): Promise<ClassroomRow[]> {
  const db = getDb();
  const memberships = await db
    .selectFrom('classroom_memberships')
    .select('classroom_id')
    .where('user_id', '=', teacherUserId)
    .where('membership_role', '=', 'teacher')
    .where('status', '=', 'active')
    .execute();

  if (memberships.length === 0) return [];
  const ids = memberships.map((m) => m.classroom_id);

  const rows = await db
    .selectFrom('classrooms')
    .selectAll()
    .where('id', 'in', ids)
    .orderBy('name', 'asc')
    .execute();

  return rows as unknown as ClassroomRow[];
}

export async function listStudentsInClassroom(classroomId: string): Promise<ClassroomMembershipRow[]> {
  const db = getDb();
  const rows = await db
    .selectFrom('classroom_memberships')
    .selectAll()
    .where('classroom_id', '=', classroomId)
    .where('membership_role', '=', 'student')
    .where('status', '=', 'active')
    .execute();
  return rows as unknown as ClassroomMembershipRow[];
}

export async function listAllClassrooms(): Promise<ClassroomRow[]> {
  const db = getDb();
  const rows = await db
    .selectFrom('classrooms')
    .selectAll()
    .orderBy('name', 'asc')
    .execute();
  return rows as unknown as ClassroomRow[];
}

export async function createClassroom(input: { name: string; grade_level?: string; academic_year?: string }): Promise<ClassroomRow> {
  const db = getDb();
  const now = new Date().toISOString();
  const [row] = await db
    .insertInto('classrooms')
    .values({ name: input.name, grade_level: input.grade_level ?? null, academic_year: input.academic_year ?? null, created_at: now, updated_at: now })
    .returningAll()
    .execute();
  return row as unknown as ClassroomRow;
}

export async function addMemberToClassroom(classroomId: string, userId: string, role: 'student' | 'teacher'): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  await db
    .insertInto('classroom_memberships')
    .values({ classroom_id: classroomId, user_id: userId, membership_role: role, status: 'active', created_at: now, updated_at: now })
    .onConflict(oc => oc.doNothing())
    .execute();
}

export async function removeMemberFromClassroom(classroomId: string, userId: string): Promise<void> {
  const db = getDb();
  await db
    .updateTable('classroom_memberships')
    .set({ status: 'inactive', updated_at: new Date().toISOString() })
    .where('classroom_id', '=', classroomId)
    .where('user_id', '=', userId)
    .where('membership_role', '=', 'student')
    .execute();
}

export async function listMembersWithDetails(classroomId: string): Promise<Array<{ id: string; user_id: string; display_name: string | null; external_subject: string; email: string | null; primary_role: string }>> {
  const db = getDb();
  const rows = await db
    .selectFrom('classroom_memberships as m')
    .innerJoin('users as u', 'u.id', 'm.user_id')
    .select(['m.id', 'm.user_id', 'u.display_name', 'u.external_subject', 'u.email', 'u.primary_role'])
    .where('m.classroom_id', '=', classroomId)
    .where('m.membership_role', '=', 'student')
    .where('m.status', '=', 'active')
    .where('u.primary_role', 'in', ['learner', 'parent'])
    .orderBy('u.display_name', 'asc')
    .execute();
  return rows as any;
}
