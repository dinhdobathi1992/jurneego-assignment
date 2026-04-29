import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { authenticate, requireRole } from '../middleware/authMiddleware';
import { rateLimitFor } from '../middleware/rateLimitMiddleware';
import { isAssignedTeacher } from '../auth/ownership';
import {
  getClassroomsForTeacher,
  getStudentsInClassroom,
  getTeacherSessions,
  getStudentConversations,
  getStudentMessages,
} from '../services/teacherViewService';
import {
  listAllClassrooms,
  createClassroom,
  addMemberToClassroom,
  removeMemberFromClassroom,
  listMembersWithDetails,
} from '../repositories/classroomRepository';
import { addGuidanceNote, getSessionGuidance } from '../services/guidanceService';
import {
  createLearningObjective,
  listObjectivesForSession,
} from '../repositories/learningObjectiveRepository';
import { guidanceNotesCreatedTotal } from '../services/observability/metrics';
import { getDb } from '../db/kysely';
import { getPool } from '../db/pool';

export const teacherRoutes: FastifyPluginAsync = async (fastify) => {
  const teacherGuard = requireRole('teacher', 'admin');

  // GET /api/teacher/classrooms
  fastify.get(
    '/api/teacher/classrooms',
    {
      schema: { tags: ['teacher'], summary: 'List assigned classrooms', security: [{ bearerAuth: [] }, { apiKey: [] }] },
      preHandler: [authenticate, teacherGuard, rateLimitFor('teacher')],
    },
    async (request, reply) => {
      const user = request.user!;
      if (user.role === 'admin') {
        const realClassrooms = await listAllClassrooms();
        return reply.send({
          classrooms: [
            { id: '00000000-0000-0000-0000-000000000001', name: 'All Learners', grade_level: null },
            ...realClassrooms,
          ],
        });
      }
      const classrooms = await getClassroomsForTeacher(user.dbId);
      return reply.send({ classrooms });
    }
  );

  // GET /api/teacher/classrooms/:classroomId/students
  fastify.get(
    '/api/teacher/classrooms/:classroomId/students',
    {
      schema: {
        tags: ['teacher'],
        summary: 'List students in a classroom',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: Type.Object({ classroomId: Type.String({ format: 'uuid' }) }),
      },
      preHandler: [authenticate, teacherGuard, rateLimitFor('teacher')],
    },
    async (request, reply) => {
      const { classroomId } = request.params as { classroomId: string };
      const user = request.user!;
      // Virtual classroom — admin sees all users who have at least one conversation
      if (classroomId === '00000000-0000-0000-0000-000000000001') {
        const db = getDb();
        const rows = await db
          .selectFrom('users as u')
          .innerJoin('conversations as c', 'c.learner_user_id', 'u.id')
          .select(['u.id', 'u.display_name', 'u.external_subject', 'u.primary_role'])
          .groupBy(['u.id', 'u.display_name', 'u.external_subject', 'u.primary_role'])
          .orderBy('u.display_name', 'asc')
          .execute();
        const students = rows.map((r: any) => ({
          id: r.id,
          name: (r.display_name?.trim() || null) ?? (/^\d+$/.test(String(r.external_subject ?? '')) ? null : String(r.external_subject).slice(0, 20)) ?? 'Learner',
          display_name: r.display_name,
          primary_role: r.primary_role,
        }));
        return reply.send({ students });
      }
      const students = await getStudentsInClassroom(user.dbId, classroomId);
      return reply.send({ students });
    }
  );

  // GET /api/teacher/sessions
  fastify.get(
    '/api/teacher/sessions',
    {
      schema: { tags: ['teacher'], summary: 'List sessions the teacher participates in', security: [{ bearerAuth: [] }, { apiKey: [] }] },
      preHandler: [authenticate, teacherGuard, rateLimitFor('teacher')],
    },
    async (request, reply) => {
      const sessions = await getTeacherSessions(request.user!.dbId, request.requestId);
      return reply.send({ sessions });
    }
  );

  // GET /api/teacher/students/:studentId/conversations
  fastify.get(
    '/api/teacher/students/:studentId/conversations',
    {
      schema: {
        tags: ['teacher'],
        summary: 'List conversations for an assigned student',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: Type.Object({ studentId: Type.String({ format: 'uuid' }) }),
        querystring: Type.Object({
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, default: 20 })),
        }),
      },
      preHandler: [authenticate, teacherGuard, rateLimitFor('teacher')],
    },
    async (request, reply) => {
      const { studentId } = request.params as { studentId: string };
      const { limit } = request.query as { limit?: number };
      const user = request.user!;

      if (user.role !== 'admin') {
        const assigned = await isAssignedTeacher(user.dbId, studentId);
        if (!assigned) return reply.status(403).send({ error: 'Student not in your assigned classrooms' });
      }

      const conversations = await getStudentConversations(user.dbId, studentId, request.requestId, limit ?? 20);
      return reply.send({ conversations });
    }
  );

  // GET /api/teacher/conversations/:conversationId/messages
  fastify.get(
    '/api/teacher/conversations/:conversationId/messages',
    {
      schema: {
        tags: ['teacher'],
        summary: 'Read messages in a student conversation',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: Type.Object({ conversationId: Type.String({ format: 'uuid' }) }),
      },
      preHandler: [authenticate, teacherGuard, rateLimitFor('teacher')],
    },
    async (request, reply) => {
      const { conversationId } = request.params as { conversationId: string };
      const messages = await getStudentMessages(request.user!.dbId, conversationId, request.requestId);
      return reply.send({ messages });
    }
  );

  // POST /api/teacher/sessions/:sessionId/guidance
  fastify.post(
    '/api/teacher/sessions/:sessionId/guidance',
    {
      schema: {
        tags: ['teacher'],
        summary: 'Add a guidance note to a session',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: Type.Object({ sessionId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          guidance_type: Type.String(),
          content: Type.String({ minLength: 1, maxLength: 5000 }),
          conversation_id: Type.Optional(Type.String({ format: 'uuid' })),
          target_message_id: Type.Optional(Type.String({ format: 'uuid' })),
          visibility: Type.Optional(Type.Union([
            Type.Literal('adult_only'),
            Type.Literal('child_visible'),
          ])),
        }),
      },
      preHandler: [authenticate, teacherGuard, rateLimitFor('teacher')],
    },
    async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };
      const body = request.body as {
        guidance_type: string;
        content: string;
        conversation_id?: string;
        target_message_id?: string;
        visibility?: string;
      };

      const note = await addGuidanceNote(
        {
          session_id: sessionId,
          conversation_id: body.conversation_id,
          target_message_id: body.target_message_id,
          author_user_id: request.user!.dbId,
          author_role: 'teacher',
          guidance_type: body.guidance_type,
          content: body.content,
          visibility: body.visibility ?? 'adult_only',
        },
        request.requestId
      );

      return reply.status(201).send({ note });
    }
  );

  // GET /api/teacher/sessions/:sessionId/guidance
  fastify.get(
    '/api/teacher/sessions/:sessionId/guidance',
    {
      schema: {
        tags: ['teacher'],
        summary: 'List guidance notes for a session',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: Type.Object({ sessionId: Type.String({ format: 'uuid' }) }),
      },
      preHandler: [authenticate, teacherGuard, rateLimitFor('teacher')],
    },
    async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };
      const guidance = await getSessionGuidance(sessionId, 'teacher');
      return reply.send({ guidance });
    }
  );

  // POST /api/teacher/sessions/:sessionId/objectives
  fastify.post(
    '/api/teacher/sessions/:sessionId/objectives',
    {
      schema: {
        tags: ['teacher'],
        summary: 'Add a learning objective to a session',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: Type.Object({ sessionId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          objective_type: Type.String(),
          title: Type.String({ minLength: 1, maxLength: 500 }),
          description: Type.Optional(Type.String({ maxLength: 2000 })),
          standards: Type.Optional(Type.Any()),
        }),
      },
      preHandler: [authenticate, teacherGuard, rateLimitFor('teacher')],
    },
    async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };
      const body = request.body as {
        objective_type: string;
        title: string;
        description?: string;
        standards?: Record<string, unknown>;
      };

      const objective = await createLearningObjective({
        session_id: sessionId,
        author_user_id: request.user!.dbId,
        objective_type: body.objective_type,
        title: body.title,
        description: body.description,
        standards: body.standards,
      });

      return reply.status(201).send({ objective });
    }
  );

  // GET /api/teacher/sessions/:sessionId/objectives
  fastify.get(
    '/api/teacher/sessions/:sessionId/objectives',
    {
      schema: {
        tags: ['teacher'],
        summary: 'List learning objectives for a session',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: Type.Object({ sessionId: Type.String({ format: 'uuid' }) }),
      },
      preHandler: [authenticate, teacherGuard, rateLimitFor('teacher')],
    },
    async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };
      const objectives = await listObjectivesForSession(sessionId);
      return reply.send({ objectives });
    }
  );

  // ── Classroom Management ──────────────────────────────────────────────────

  // GET /api/teacher/manage/classrooms — all classrooms (admin: all, teacher: assigned)
  fastify.get(
    '/api/teacher/manage/classrooms',
    { schema: { tags: ['teacher'], security: [{ bearerAuth: [] }] }, preHandler: [authenticate, teacherGuard] },
    async (request, reply) => {
      const user = request.user!;
      const classrooms = user.role === 'admin'
        ? await listAllClassrooms()
        : await getClassroomsForTeacher(user.dbId);
      return reply.send({ classrooms });
    }
  );

  // POST /api/teacher/manage/classrooms — create classroom
  fastify.post(
    '/api/teacher/manage/classrooms',
    {
      schema: {
        tags: ['teacher'],
        security: [{ bearerAuth: [] }],
        body: Type.Object({
          name: Type.String({ minLength: 1, maxLength: 200 }),
          grade_level: Type.Optional(Type.String({ maxLength: 50 })),
          academic_year: Type.Optional(Type.String({ maxLength: 20 })),
        }),
      },
      preHandler: [authenticate, teacherGuard],
    },
    async (request, reply) => {
      const body = request.body as { name: string; grade_level?: string; academic_year?: string };
      const classroom = await createClassroom(body);
      // Add creator as teacher member
      await addMemberToClassroom(classroom.id, request.user!.dbId, 'teacher');
      return reply.status(201).send({ classroom });
    }
  );

  // GET /api/teacher/manage/classrooms/:classroomId/members — list students with names
  fastify.get(
    '/api/teacher/manage/classrooms/:classroomId/members',
    {
      schema: { tags: ['teacher'], security: [{ bearerAuth: [] }], params: Type.Object({ classroomId: Type.String({ format: 'uuid' }) }) },
      preHandler: [authenticate, teacherGuard],
    },
    async (request, reply) => {
      const { classroomId } = request.params as { classroomId: string };
      const members = await listMembersWithDetails(classroomId);
      return reply.send({ members });
    }
  );

  // POST /api/teacher/manage/classrooms/:classroomId/members — add learner
  fastify.post(
    '/api/teacher/manage/classrooms/:classroomId/members',
    {
      schema: {
        tags: ['teacher'],
        security: [{ bearerAuth: [] }],
        params: Type.Object({ classroomId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({ user_id: Type.String({ format: 'uuid' }) }),
      },
      preHandler: [authenticate, teacherGuard],
    },
    async (request, reply) => {
      const { classroomId } = request.params as { classroomId: string };
      const { user_id } = request.body as { user_id: string };
      await addMemberToClassroom(classroomId, user_id, 'student');
      return reply.status(201).send({ ok: true });
    }
  );

  // DELETE /api/teacher/manage/classrooms/:classroomId/members/:userId — remove learner
  fastify.delete(
    '/api/teacher/manage/classrooms/:classroomId/members/:userId',
    {
      schema: {
        tags: ['teacher'],
        security: [{ bearerAuth: [] }],
        params: Type.Object({ classroomId: Type.String({ format: 'uuid' }), userId: Type.String({ format: 'uuid' }) }),
      },
      preHandler: [authenticate, teacherGuard],
    },
    async (request, reply) => {
      const { classroomId, userId } = request.params as { classroomId: string; userId: string };
      await removeMemberFromClassroom(classroomId, userId);
      return reply.status(204).send();
    }
  );

  // ── Parent Management ─────────────────────────────────────────────────────

  // GET /api/teacher/students/:studentId/parents
  fastify.get(
    '/api/teacher/students/:studentId/parents',
    {
      schema: {
        tags: ['teacher'],
        summary: 'List linked parents for a student',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: Type.Object({ studentId: Type.String({ format: 'uuid' }) }),
      },
      preHandler: [authenticate, teacherGuard, rateLimitFor('teacher')],
    },
    async (request, reply) => {
      const { studentId } = request.params as { studentId: string };
      const db = getDb();
      const rows = await db
        .selectFrom('parent_child_links as l')
        .innerJoin('users as u', 'u.id', 'l.parent_user_id')
        .select(['l.id as link_id', 'u.id as parent_id', 'u.display_name', 'u.email', 'l.relationship_type'])
        .where('l.child_user_id', '=', studentId)
        .where('l.status', '=', 'active')
        .execute();
      return reply.send({
        parents: (rows as any[]).map(r => ({
          link_id: r.link_id,
          parent_id: r.parent_id,
          name: r.display_name?.trim() || r.email?.split('@')[0] || 'Parent',
          email: r.email ?? null,
          relationship_type: r.relationship_type,
        })),
      });
    }
  );

  // POST /api/teacher/students/:studentId/parents
  fastify.post(
    '/api/teacher/students/:studentId/parents',
    {
      schema: {
        tags: ['teacher'],
        summary: 'Link a parent to a student by email',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: Type.Object({ studentId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          email: Type.String({ minLength: 3, maxLength: 200 }),
        }),
      },
      preHandler: [authenticate, teacherGuard, rateLimitFor('teacher')],
    },
    async (request, reply) => {
      const { studentId } = request.params as { studentId: string };
      const { email } = request.body as { email: string };
      const normalizedEmail = email.toLowerCase().trim();
      const db = getDb();

      const parentUser = await db
        .selectFrom('users')
        .select(['id', 'primary_role', 'display_name'])
        .where('email', '=', normalizedEmail)
        .executeTakeFirst();

      if (!parentUser) {
        return reply.status(404).send({ error: 'No user found with that email. They must log in at least once first.' });
      }
      if (parentUser.primary_role !== 'parent' && parentUser.primary_role !== 'admin') {
        return reply.status(400).send({ error: `User role is '${parentUser.primary_role}', not 'parent'. Update their role in ROLE_MAP first.` });
      }

      const childUser = await db
        .selectFrom('users')
        .select('id')
        .where('id', '=', studentId)
        .executeTakeFirst();
      if (!childUser) return reply.status(404).send({ error: 'Student not found' });

      const existing = await db
        .selectFrom('parent_child_links')
        .select('id')
        .where('parent_user_id', '=', parentUser.id)
        .where('child_user_id', '=', studentId)
        .where('status', '=', 'active')
        .executeTakeFirst();
      if (existing) return reply.status(409).send({ error: 'Parent is already linked to this student' });

      const pool = getPool();
      const inserted = await pool.query(
        `INSERT INTO parent_child_links (parent_user_id, child_user_id, relationship_type, status, consent_source)
         VALUES ($1, $2, 'parent', 'active', 'teacher_assigned')
         RETURNING id`,
        [parentUser.id, studentId]
      );

      return reply.status(201).send({
        link: {
          link_id: inserted.rows[0].id,
          parent_id: parentUser.id,
          name: parentUser.display_name?.trim() || normalizedEmail.split('@')[0],
          email: normalizedEmail,
          relationship_type: 'parent',
        },
      });
    }
  );

  // DELETE /api/teacher/students/:studentId/parents/:parentId
  fastify.delete(
    '/api/teacher/students/:studentId/parents/:parentId',
    {
      schema: {
        tags: ['teacher'],
        summary: 'Remove a parent link from a student',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: Type.Object({
          studentId: Type.String({ format: 'uuid' }),
          parentId: Type.String({ format: 'uuid' }),
        }),
      },
      preHandler: [authenticate, teacherGuard, rateLimitFor('teacher')],
    },
    async (request, reply) => {
      const { studentId, parentId } = request.params as { studentId: string; parentId: string };
      const db = getDb();
      const result = await db
        .deleteFrom('parent_child_links')
        .where('child_user_id', '=', studentId)
        .where('parent_user_id', '=', parentId)
        .where('status', '=', 'active')
        .executeTakeFirst();
      if (!result || Number(result.numDeletedRows) === 0) {
        return reply.status(404).send({ error: 'Link not found' });
      }
      return reply.status(204).send();
    }
  );
};
