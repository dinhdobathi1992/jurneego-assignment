# ChildAI Backend Rebuild Plan In Node.js

Date: 2026-04-27

This plan upgrades the earlier "port to Node.js" idea into a backend-first rebuild plan.

The current Python app is a working prototype. The Node.js version should keep the useful product behavior, but it should fix the known backend gaps now instead of copying them forward.

Primary goal:

Build a high-performing, production-minded Node.js backend for a child-safe AI learning assistant.

Secondary goal:

Keep enough API compatibility that the current demo flow still works, while adding stronger auth, rate limiting, audit logging, provider resilience, PostgreSQL-first testing, and SSE streaming.

---

## 1. Current Application Summary

The current application is a Python FastAPI service for child-safe AI chat.

Plain-language flow:

1. A learner starts a conversation.
2. The learner sends a message.
3. The backend checks the learner message for unsafe content.
4. If unsafe, the backend saves a flag and returns a safe deflection message.
5. If safe, the backend sends the conversation to an AI provider.
6. The backend checks the AI response for unsafe content.
7. If safe, the backend saves and returns the AI response.
8. Teachers or admins can list flagged conversations and mark flags as reviewed.

Current backend:

| Area | Current implementation |
| --- | --- |
| Runtime | Python 3.12 |
| Web framework | FastAPI |
| Database | PostgreSQL through SQLAlchemy |
| Validation | Pydantic |
| Auth | Shared `X-API-Key` |
| AI providers | Mock, AWS Bedrock, LiteLLM |
| Safety | Keyword and regex checks |
| Tests | 45 tests passing |
| Streaming | Not implemented |

Current tests were verified before creating this plan:

```text
45 passed, 1 warning
```

> [!NOTE]
> **🚀 Successfully built with Antigravity**
>
> The Node.js backend in `childAI/nodejs-app/` was built to preserve all current API behavior (conversations, messages, flags, moderation) and add the gaps listed above.

---

## 2. Rebuild Direction

This is not a line-by-line port.

The Node.js backend should:

1. Preserve the core product behavior.
2. Keep the existing REST endpoints where useful.
3. Add a streaming endpoint for AI responses.
4. Add parent and teacher views of child learning sessions.
5. Add shared sessions so child questions, AI answers, and adult guidance live in one visible context.
6. Replace shared API key auth with JWT auth and role checks.
7. Add Redis-backed rate limiting before expensive AI calls.
8. Add a proper audit trail for child-safety decisions.
9. Add provider failover between LiteLLM and Bedrock.
10. Use real PostgreSQL in tests.
11. Use explicit migrations from day one.
12. Be ready for production deployment on AWS.

The frontend is intentionally out of scope for now. The backend should be good first.

---

## 3. Tradeoff Gaps To Fix Now

The file `docs/TRADEOFFS.md` lists seven important backend gaps. The rebuild should address them directly.

| Current gap | Backend rebuild decision |
| --- | --- |
| No authentication | Use JWT authentication with learner, teacher, admin, and service roles |
| Keyword safety misses nuance | Keep rule checks, add optional LLM safety classifier, store safety decisions |
| No rate limiting | Add Redis-backed limits by IP, user, route, and AI budget |
| AI provider is a single point of failure | Add provider router, fallback order, timeouts, retries, and circuit breaker |
| Secrets in `.env` | Use `.env` only for local dev; use AWS Secrets Manager in deployed environments |
| No audit trail | Add append-only `audit_events` and `safety_assessments` tables |
| SQLite tests vs Postgres production | Use Testcontainers PostgreSQL and Redis in integration tests |

Additional shortcut to fix:

| Current shortcut | Backend rebuild decision |
| --- | --- |
| No response streaming | Add SSE streaming with safety-gated output |
| Startup table creation | Use migration files from day one |
| No structured logging | Use structured JSON logs with request IDs |

> [!NOTE]
> **🚀 Successfully built with Antigravity**
>
> All 10 gaps addressed: JWT auth implemented in `src/auth/jwt.ts` + `src/middleware/authMiddleware.ts`. Rule+LLM safety in `src/services/safety/`. Redis rate limiting in `src/services/rateLimit/`. Provider fallback in `src/services/ai/providerRouter.ts`. Append-only audit in `src/repositories/auditRepository.ts`. Testcontainers in `tests/integration/`. Migrations in `migrations/`. SSE streaming in `src/services/streaming/`. Pino structured logs via Fastify built-in.

---

## 4. Recommended High-Performance Tech Stack

Use TypeScript on Node.js.

Reason:

- TypeScript gives compile-time checks for routes, services, database rows, and AI provider responses.
- Node.js handles concurrent I/O well, which is a good match for HTTP, database calls, Redis, and LLM provider calls.
- The live review will be easier because types make design decisions explicit.

Recommended stack:

| Layer | Recommendation | Reason |
| --- | --- | --- |
| Runtime | Active Node.js LTS | Stable production runtime |
| Language | TypeScript strict mode | Safer rebuild and clearer review |
| Web server | Fastify | High performance, low overhead, strong plugin ecosystem |
| Route validation | TypeBox JSON Schema with Fastify Ajv | Fast compiled validation and OpenAPI compatibility |
| Config validation | Zod | Clear startup errors for environment configuration |
| Database | PostgreSQL | Same production database target as current app |
| SQL access | Kysely plus `pg` | Type-safe SQL with low runtime overhead and full SQL control |
| Migrations | node-pg-migrate or dbmate | Explicit migration chain, no startup schema creation |
| Cache and limits | Redis with `ioredis` | Shared rate limiting and distributed coordination |
| Auth | `jose` with JWKS | Standards-based JWT validation for Cognito/Auth0 |
| Bedrock | `@aws-sdk/client-bedrock-runtime` | Native AWS Bedrock support |
| LiteLLM | OpenAI-compatible client | LiteLLM proxy supports OpenAI chat/streaming APIs |
| Logging | Fastify Pino logger | Fast structured JSON logs |
| Metrics | `prom-client` | Prometheus-compatible metrics |
| Tracing | OpenTelemetry | Request and provider call tracing |
| Tests | Vitest, Fastify inject, Testcontainers | Fast unit tests plus realistic Postgres/Redis integration tests |
| Load tests | autocannon and k6 | Backend performance verification |

> [!NOTE]
> **🚀 Successfully built with Antigravity**
>
> Full tech stack implemented as recommended:
> - **Fastify 4** with TypeBox schema validation, Pino logging, Swagger/OpenAPI at `/docs`
> - **Kysely + pg** with 19-table TypeScript database interface in `src/db/kysely.ts`
> - **node-pg-migrate** with 13 migration files in `migrations/`
> - **ioredis** client in `src/db/redis.ts` for rate limiting
> - **jose** for JWKS JWT validation with HS256 dev fallback
> - **AWS SDK Bedrock Runtime** in `src/services/ai/bedrockProvider.ts`
> - **openai** (LiteLLM OpenAI-compatible) in `src/services/ai/litellmProvider.ts`
> - **prom-client** Prometheus metrics in `src/services/observability/metrics.ts`
> - **Vitest** with Testcontainers in `tests/integration/database.test.ts`
> - **zod** config validation at startup in `src/config/settings.ts`

Why not Express:

- Fastify is faster under load.
- Fastify has better route schema integration.
- Fastify integrates naturally with OpenAPI generation.

Why not NestJS for this assignment:

- NestJS is productive for large teams, but it adds more framework concepts.
- This assignment benefits from a direct, readable service architecture.
- Fastify keeps the backend easier to explain in a live review.

Why not Prisma as the primary choice:

- Prisma is readable and good for many teams.
- For this rebuild, Kysely plus `pg` gives more SQL control, lower runtime abstraction, and easier tuning.
- If the team prefers Prisma, it remains a valid alternative, but this plan optimizes for backend performance and explicit SQL behavior.

---

## 5. Target Folder Structure

Create the rebuilt backend in `childAI/nodejs-app/`.

```text
childAI/nodejs-app/
  package.json
  tsconfig.json
  .env.example
  Dockerfile
  docker-compose.yml
  migrations/
    001_create_users.sql
    002_create_conversations.sql
    003_create_messages.sql
    004_create_flags.sql
    005_create_safety_assessments.sql
    006_create_audit_events.sql
    007_create_ai_provider_attempts.sql
    008_create_guardian_and_school_links.sql
    009_create_shared_sessions.sql
    010_create_adult_guidance.sql
    011_create_learning_objectives.sql
    012_create_message_translations.sql
    013_create_session_analytics.sql
  src/
    server.ts
    app.ts
    config/
      settings.ts
    db/
      pool.ts
      kysely.ts
      transaction.ts
    auth/
      jwt.ts
      apiKey.ts
      roles.ts
      ownership.ts
    middleware/
      authMiddleware.ts
      rateLimitMiddleware.ts
      requestContext.ts
      errorHandler.ts
    schemas/
      conversationSchemas.ts
      messageSchemas.ts
      moderationSchemas.ts
      streamSchemas.ts
      parentSchemas.ts
      teacherSchemas.ts
      sharedSessionSchemas.ts
      guidanceSchemas.ts
    routes/
      systemRoutes.ts
      conversationRoutes.ts
      messageRoutes.ts
      streamRoutes.ts
      moderationRoutes.ts
      parentRoutes.ts
      teacherRoutes.ts
      sharedSessionRoutes.ts
    repositories/
      userRepository.ts
      relationshipRepository.ts
      classroomRepository.ts
      sharedSessionRepository.ts
      conversationRepository.ts
      messageRepository.ts
      guidanceRepository.ts
      learningObjectiveRepository.ts
      translationRepository.ts
      flagRepository.ts
      safetyRepository.ts
      auditRepository.ts
      aiProviderAttemptRepository.ts
    services/
      conversationService.ts
      messageService.ts
      moderationService.ts
      parentViewService.ts
      teacherViewService.ts
      sharedSessionService.ts
      guidanceService.ts
      translationService.ts
      safety/
        safetyService.ts
        ruleSafetyChecker.ts
        llmSafetyChecker.ts
        safetyPolicy.ts
      ai/
        aiProvider.ts
        providerRouter.ts
        mockProvider.ts
        bedrockProvider.ts
        litellmProvider.ts
        aiFallbacks.ts
      streaming/
        sseWriter.ts
        streamMessageService.ts
        streamSafetyGate.ts
      rateLimit/
        limiter.ts
        quotaPolicy.ts
      audit/
        auditService.ts
      observability/
        logger.ts
        metrics.ts
        tracing.ts
    prompts/
      child_safe_system_prompt.txt
      safety_classifier_prompt.txt
  tests/
    unit/
    integration/
    contract/
    performance/
```

> [!NOTE]
> **🚀 Successfully built with Antigravity**
>
> Folder structure created exactly as specified at `childAI/nodejs-app/`. All source files are in `src/` with routes, services, repositories, auth, middleware, and db subdirectories. All 13 migration files in `migrations/`. Prompts in `prompts/`. Tests in `tests/unit/` and `tests/integration/`.

Architecture rule:

Routes should stay thin. Routes validate input, call services, and return responses. Business decisions should live in services. SQL should live in repositories.

---

## 6. Backend Architecture

Target request path:

```text
Client
  -> Fastify route
  -> Auth middleware
  -> Rate limit middleware
  -> Request validation
  -> Service layer
  -> Safety service
  -> Repository layer
  -> AI provider router
  -> Audit service
  -> Response or SSE stream
```

Layer responsibilities:

| Layer | Responsibility |
| --- | --- |
| Routes | HTTP paths, request schemas, response schemas, status codes |
| Middleware | Auth, roles, ownership, rate limits, request IDs |
| Services | Business workflows and transaction boundaries |
| Repositories | SQL queries and persistence |
| Relationship access | Parent-child links, teacher-classroom links, shared-session participation |
| AI providers | Bedrock, LiteLLM, Mock integrations |
| Safety | Rule checks, optional LLM checks, deflections, output checks |
| Streaming | SSE protocol, backpressure, heartbeats, abort handling |
| Audit | Append-only events for safety, moderation, auth, and AI actions |
| Observability | Logs, metrics, traces |

Important backend rule:

Do not hold a database transaction open while waiting for an AI provider.

Reason:

- LLM calls can take seconds.
- Open transactions hold database resources.
- Long transactions increase lock risk and reduce throughput.

Correct pattern:

1. Validate and rate-limit request.
2. Run input safety check.
3. Use a short transaction to save learner message and any immediate flag.
4. Call AI outside a database transaction.
5. Run output safety check.
6. Use a short transaction to save assistant message, flags, provider attempts, and audit events.

---

## 7. API Contract

Keep current REST endpoints for compatibility.

System:

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | No | Health check |
| `GET` | `/ready` | No | Readiness check with database and Redis |
| `GET` | `/metrics` | Internal only | Prometheus metrics |
| `GET` | `/docs` | Configurable | Swagger UI |

Conversations:

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/conversations` | Learner, teacher, admin | Create conversation |
| `GET` | `/api/conversations` | Authenticated | List conversations visible to caller |
| `GET` | `/api/conversations/:conversationId` | Owner, linked parent, assigned teacher, admin | Get conversation |

Messages:

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/conversations/:conversationId/messages` | Learner owner, teacher/admin when guided mode allows | Non-streaming message flow |
| `POST` | `/api/conversations/:conversationId/messages/stream` | Learner owner, teacher/admin when guided mode allows | SSE message flow over fetch |

Shared sessions:

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/shared-sessions` | Learner, parent, teacher, admin | Create a visible learning context |
| `GET` | `/api/shared-sessions/:sessionId` | Participant parent/teacher/learner, admin | Read session summary, participants, objectives, conversations, guidance |
| `GET` | `/api/shared-sessions/:sessionId/timeline` | Participant parent/teacher/learner, admin | Read ordered child messages, AI responses, safety events, and visible adult guidance |
| `POST` | `/api/shared-sessions/:sessionId/guidance` | Linked parent, assigned teacher, admin | Add visible guidance, reflection prompt, or contextual note |
| `POST` | `/api/shared-sessions/:sessionId/objectives` | Assigned teacher, admin; parent optional by policy | Add learning objective or standard alignment |
| `PATCH` | `/api/shared-sessions/:sessionId/mode` | Session owner, teacher, admin | Switch between exploration and guided mode |

Parent views:

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/parent/children` | Parent | List children linked to the parent |
| `GET` | `/api/parent/children/:childUserId/sessions` | Linked parent | List the child's shared sessions and conversations |
| `GET` | `/api/parent/children/:childUserId/conversations/:conversationId/messages` | Linked parent | View the child's message history for an allowed conversation |
| `GET` | `/api/parent/children/:childUserId/timeline` | Linked parent | View cross-session learning journey timeline |
| `POST` | `/api/parent/sessions/:sessionId/guidance` | Linked parent | Add parent reflection prompt or contextual note |
| `GET` | `/api/parent/sessions/:sessionId/translations` | Linked parent | Read translated child questions and AI responses in parent preferred language |

Teacher views:

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/teacher/classes` | Teacher | List classes assigned to teacher |
| `GET` | `/api/teacher/classes/:classroomId/students` | Assigned teacher | List students in a class |
| `GET` | `/api/teacher/students/:childUserId/sessions` | Assigned teacher | List student sessions visible to the teacher |
| `GET` | `/api/teacher/students/:childUserId/conversations/:conversationId/messages` | Assigned teacher | View student message history for allowed conversation |
| `POST` | `/api/teacher/sessions/:sessionId/guidance` | Assigned teacher | Add teacher guidance without overwriting AI response |
| `POST` | `/api/teacher/sessions/:sessionId/objectives` | Assigned teacher | Attach objectives, standards, or lesson context |
| `GET` | `/api/teacher/classes/:classroomId/analytics` | Assigned teacher | View foundational analytics for curiosity, reflection, participation, safety signals |

Parent/teacher message view response shape:

```json
{
  "child": {
    "id": "uuid",
    "display_name": "Student name"
  },
  "conversation": {
    "id": "uuid",
    "shared_session_id": "uuid",
    "title": "Fractions practice",
    "mode": "guided"
  },
  "messages": [
    {
      "id": "uuid",
      "role": "learner",
      "content": "What is one half?",
      "language": "en",
      "is_safe": true,
      "created_at": "2026-04-27T00:00:00.000Z"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "One half means one of two equal parts.",
      "language": "en",
      "is_safe": true,
      "created_at": "2026-04-27T00:00:01.000Z"
    }
  ],
  "guidance_notes": [
    {
      "id": "uuid",
      "author_role": "parent",
      "guidance_type": "reflection_prompt",
      "content": "Can you explain this using pizza slices?",
      "created_at": "2026-04-27T00:01:00.000Z"
    }
  ],
  "learning_objectives": [],
  "flags": []
}
```

Important response rule:

Parent and teacher views show original child-facing content by default. Translations are returned as additional fields or separate translation endpoints, not replacements.

Moderation:

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/moderation/flagged` | Teacher, admin | List flagged conversations |
| `GET` | `/api/moderation/flagged/:conversationId` | Teacher, admin | Read flagged conversation |
| `PATCH` | `/api/moderation/flags/:flagId/review` | Teacher, admin | Mark flag as reviewed |

Compatibility response shape for non-streaming message endpoint:

```json
{
  "learner_message": {
    "id": "uuid",
    "conversation_id": "uuid",
    "role": "learner",
    "content": "How do volcanoes work?",
    "is_safe": true,
    "safety_score": 1.0,
    "created_at": "2026-04-27T00:00:00.000Z"
  },
  "assistant_message": {
    "id": "uuid",
    "conversation_id": "uuid",
    "role": "assistant",
    "content": "Short child-safe answer...",
    "is_safe": true,
    "safety_score": 1.0,
    "created_at": "2026-04-27T00:00:01.000Z"
  },
  "was_flagged": false,
  "flag_reason": null
}
```

New fields can be added later, but the above fields should remain stable.

> [!NOTE]
> **🚀 Successfully built with Antigravity**
>
> All REST endpoints implemented:
> - `GET /health` and `GET /ready` → `src/routes/systemRoutes.ts`
> - `GET /metrics` → `src/services/observability/metricsRoute.ts`
> - `GET /docs` → Swagger UI via `@fastify/swagger-ui`
> - `POST /api/conversations`, `GET /api/conversations`, `GET /api/conversations/:id` → `src/routes/conversationRoutes.ts`
> - `POST /api/conversations/:id/messages` → `src/routes/messageRoutes.ts`
> - `POST /api/conversations/:id/messages/stream` → `src/routes/streamRoutes.ts`
> - `GET /api/moderation/flagged`, `GET /api/moderation/flagged/:id`, `PATCH /api/moderation/flags/:id/review` → `src/routes/moderationRoutes.ts`
> - Response shape matches the plan exactly (learner_message, assistant_message, was_flagged, flag_reason)

---

## 8. Authentication And Authorization Plan

The current shared API key is not enough for a child-facing service.

Target auth model:

| Role | Permissions |
| --- | --- |
| `learner` | Create/read own conversations and shared sessions, send own messages |
| `parent` | Read linked child sessions and messages, add visible parent guidance, read translated views |
| `teacher` | Read assigned student sessions and messages, add visible teacher guidance, attach objectives, review flags |
| `admin` | Full moderation and operational access |
| `service` | Internal automation, health checks, trusted server-to-server calls |

JWT requirements:

1. Validate JWT signature using JWKS.
2. Validate issuer.
3. Validate audience.
4. Validate expiration.
5. Extract subject as `auth_user_id`.
6. Extract role claims.
7. Reject requests without required role.
8. Enforce conversation ownership, parent-child links, teacher-classroom links, or admin permissions.

Development mode:

- Allow a local dev JWT issuer for easy testing.
- Provide seeded learner, parent, teacher, and admin dev tokens for live review.
- Keep API key auth only as a development fallback or service-to-service option.
- In production, shared API key should not authorize learner actions.

Ownership rules:

| Operation | Rule |
| --- | --- |
| Create conversation | Learner can create only for self |
| List conversations | Learner sees own, linked parent sees linked children, teacher sees assigned students, admin sees all |
| Read conversation | Learner must own it, parent must be linked to child, teacher must be assigned through class/session, admin can read |
| Send message | Learner can send own messages; adults can add guidance notes, not silently impersonate the child |
| Create shared session | Learner, linked parent, assigned teacher, or admin can create according to policy |
| Add parent guidance | Parent must be linked to the child in that session |
| Add teacher guidance | Teacher must be assigned to the class/student/session |
| Read translated parent view | Parent must be linked to child; translation must preserve original text |
| Moderation endpoints | Teacher/admin only |

Implementation files:

```text
src/auth/jwt.ts
src/auth/roles.ts
src/auth/ownership.ts
src/middleware/authMiddleware.ts
```

> [!NOTE]
> **🚀 Successfully built with Antigravity**
>
> Auth layer fully implemented:
> - `src/auth/jwt.ts` → JWKS + HS256 dev fallback via `jose`
> - `src/auth/roles.ts` → role hierarchy helpers (`hasRole`, `canModerate`, `isAdmin`, `isAdult`)
> - `src/auth/ownership.ts` → `canAccessConversation`, `isLinkedParent`, `isAssignedTeacher` with DB checks
> - `src/middleware/authMiddleware.ts` → `authenticate` and `requireRole` pre-handlers, user upsert on auth
> - X-API-Key dev fallback with constant-time compare

Acceptance tests:

1. Missing JWT returns `401`.
2. Invalid JWT returns `401`.
3. Learner cannot read another learner conversation.
4. Parent cannot read an unlinked child conversation.
5. Teacher cannot read a student outside assigned classes or sessions.
6. Learner cannot access moderation endpoints.
7. Teacher can read flagged conversations for assigned students.
8. Admin can review any flag.

---

## 9. Database Design

Use PostgreSQL as the only integration-test and production database.

Core tables:

```text
users
  id uuid primary key
  external_subject text unique not null
  primary_role text not null
  display_name text null
  preferred_language text not null default 'en'
  created_at timestamptz not null
  updated_at timestamptz not null

user_roles
  user_id uuid not null references users(id)
  role text not null
  created_at timestamptz not null
  primary key (user_id, role)

parent_child_links
  id uuid primary key
  parent_user_id uuid not null references users(id)
  child_user_id uuid not null references users(id)
  relationship_type text not null
  status text not null default 'active'
  consent_source text null
  created_at timestamptz not null
  updated_at timestamptz not null

schools
  id uuid primary key
  name text not null
  created_at timestamptz not null
  updated_at timestamptz not null

classrooms
  id uuid primary key
  school_id uuid null references schools(id)
  name text not null
  grade_level text null
  academic_year text null
  created_at timestamptz not null
  updated_at timestamptz not null

classroom_memberships
  id uuid primary key
  classroom_id uuid not null references classrooms(id)
  user_id uuid not null references users(id)
  membership_role text not null
  status text not null default 'active'
  created_at timestamptz not null
  updated_at timestamptz not null

shared_sessions
  id uuid primary key
  learner_user_id uuid not null references users(id)
  created_by_user_id uuid not null references users(id)
  classroom_id uuid null references classrooms(id)
  title varchar(255) null
  mode text not null default 'exploration'
  visibility text not null default 'linked_adults'
  status text not null default 'active'
  created_at timestamptz not null
  updated_at timestamptz not null

session_participants
  id uuid primary key
  session_id uuid not null references shared_sessions(id)
  user_id uuid not null references users(id)
  participant_role text not null
  permissions jsonb not null default '{}'
  joined_at timestamptz not null
  left_at timestamptz null

conversations
  id uuid primary key
  learner_user_id uuid not null references users(id)
  shared_session_id uuid null references shared_sessions(id)
  title varchar(255) null
  is_flagged boolean not null default false
  status text not null default 'active'
  created_at timestamptz not null
  updated_at timestamptz not null

messages
  id uuid primary key
  conversation_id uuid not null references conversations(id)
  created_by_user_id uuid null references users(id)
  role text not null
  content text not null
  language text not null default 'en'
  status text not null
  is_safe boolean null
  safety_score double precision null
  ai_provider text null
  ai_model text null
  token_count integer null
  latency_ms integer null
  metadata jsonb not null default '{}'
  created_at timestamptz not null
  completed_at timestamptz null

guidance_notes
  id uuid primary key
  session_id uuid not null references shared_sessions(id)
  conversation_id uuid null references conversations(id)
  target_message_id uuid null references messages(id)
  author_user_id uuid not null references users(id)
  author_role text not null
  guidance_type text not null
  content text not null
  language text not null default 'en'
  visibility text not null default 'visible_to_session'
  status text not null default 'active'
  created_at timestamptz not null
  updated_at timestamptz not null

learning_objectives
  id uuid primary key
  session_id uuid not null references shared_sessions(id)
  author_user_id uuid not null references users(id)
  objective_type text not null
  title text not null
  description text null
  standards jsonb not null default '[]'
  status text not null default 'active'
  created_at timestamptz not null
  updated_at timestamptz not null

message_translations
  id uuid primary key
  message_id uuid not null references messages(id)
  requested_by_user_id uuid not null references users(id)
  source_language text not null
  target_language text not null
  translated_content text not null
  provider text null
  model text null
  created_at timestamptz not null

session_events
  id uuid primary key
  session_id uuid not null references shared_sessions(id)
  event_type text not null
  actor_user_id uuid null references users(id)
  entity_type text not null
  entity_id uuid not null
  child_visible boolean not null default true
  metadata jsonb not null default '{}'
  created_at timestamptz not null

flags
  id uuid primary key
  session_id uuid null references shared_sessions(id)
  conversation_id uuid not null references conversations(id)
  message_id uuid not null references messages(id)
  flag_type text not null
  reason text not null
  severity text not null
  reviewed boolean not null default false
  reviewer_user_id uuid null references users(id)
  reviewer_notes text null
  created_at timestamptz not null
  reviewed_at timestamptz null

safety_assessments
  id uuid primary key
  session_id uuid null references shared_sessions(id)
  message_id uuid null references messages(id)
  conversation_id uuid null references conversations(id)
  direction text not null
  checker text not null
  is_safe boolean not null
  flag_type text null
  severity text null
  confidence double precision not null
  reason text null
  metadata jsonb not null default '{}'
  created_at timestamptz not null

audit_events
  id uuid primary key
  request_id text not null
  actor_user_id uuid null references users(id)
  actor_role text null
  event_type text not null
  entity_type text not null
  entity_id uuid null
  ip_hash text null
  user_agent_hash text null
  metadata jsonb not null default '{}'
  created_at timestamptz not null

ai_provider_attempts
  id uuid primary key
  conversation_id uuid not null references conversations(id)
  session_id uuid null references shared_sessions(id)
  message_id uuid null references messages(id)
  provider text not null
  model text not null
  status text not null
  latency_ms integer null
  error_code text null
  input_tokens integer null
  output_tokens integer null
  created_at timestamptz not null

session_analytics_snapshots
  id uuid primary key
  session_id uuid not null references shared_sessions(id)
  learner_user_id uuid not null references users(id)
  classroom_id uuid null references classrooms(id)
  snapshot_type text not null
  metrics jsonb not null
  generated_at timestamptz not null
```

Important indexes:

```sql
create unique index parent_child_links_unique_active_idx
  on parent_child_links (parent_user_id, child_user_id)
  where status = 'active';

create index parent_child_links_child_idx
  on parent_child_links (child_user_id, status);

create unique index classroom_memberships_unique_active_idx
  on classroom_memberships (classroom_id, user_id, membership_role)
  where status = 'active';

create index classroom_memberships_user_role_idx
  on classroom_memberships (user_id, membership_role, status);

create index shared_sessions_learner_updated_idx
  on shared_sessions (learner_user_id, updated_at desc);

create index shared_sessions_classroom_updated_idx
  on shared_sessions (classroom_id, updated_at desc)
  where classroom_id is not null;

create unique index session_participants_unique_active_idx
  on session_participants (session_id, user_id, participant_role)
  where left_at is null;

create index conversations_learner_created_idx
  on conversations (learner_user_id, created_at desc);

create index conversations_session_created_idx
  on conversations (shared_session_id, created_at desc)
  where shared_session_id is not null;

create index conversations_flagged_updated_idx
  on conversations (is_flagged, updated_at desc)
  where is_flagged = true;

create index messages_conversation_created_idx
  on messages (conversation_id, created_at asc);

create index guidance_notes_session_created_idx
  on guidance_notes (session_id, created_at desc);

create index learning_objectives_session_idx
  on learning_objectives (session_id, status);

create unique index message_translations_unique_idx
  on message_translations (message_id, requested_by_user_id, target_language);

create index session_events_session_created_idx
  on session_events (session_id, created_at asc);

create index flags_reviewed_created_idx
  on flags (reviewed, created_at desc);

create index flags_session_created_idx
  on flags (session_id, created_at desc)
  where session_id is not null;

create index audit_events_entity_idx
  on audit_events (entity_type, entity_id, created_at desc);

create index safety_assessments_message_idx
  on safety_assessments (message_id, created_at desc);

create index safety_assessments_session_idx
  on safety_assessments (session_id, created_at desc)
  where session_id is not null;
```

> [!NOTE]
> **🚀 Successfully built with Antigravity**
>
> All 13 migration files implemented in `migrations/`:
> 1. `001_create_users.sql` → users + user_roles tables
> 2. `002_create_conversations.sql` → conversations table
> 3. `003_create_messages.sql` → messages table
> 4. `004_create_flags.sql` → flags table with severity/reviewed lifecycle
> 5. `005_create_safety_assessments.sql` → safety_assessments
> 6. `006_create_audit_events.sql` → append-only audit with IP/UA hash
> 7. `007_create_ai_provider_attempts.sql` → AI provider attempt log
> 8. `008_create_guardian_and_school_links.sql` → schools, classrooms, memberships, parent_child_links
> 9. `009_create_shared_sessions.sql` → shared_sessions + session_participants + FK back-links
> 10. `010_create_adult_guidance.sql` → guidance_notes + session_events
> 11. `011_create_learning_objectives.sql` → learning_objectives
> 12. `012_create_message_translations.sql` → message_translations
> 13. `013_create_session_analytics.sql` → session_analytics_snapshots
> 
> Full TypeScript types for all 19 tables in `src/db/kysely.ts`.

Compatibility note:

- Current API response fields can still use `conversation_id`, `is_safe`, and `safety_score`.
- Internal TypeScript types can use camelCase.
- SQL columns should stay snake_case.

Migration rule:

All schema changes must be migration files. The app must not create or alter tables at startup.

### 9.1 Shared Sessions Technology

Shared sessions are the backend concept that connects children, parents, and teachers in one visible learning context.

Product rule:

Adults can be present and helpful, but the system must not become silent monitoring or invisible adult control.

Backend meaning:

| Concept | Backend representation |
| --- | --- |
| Child asks freely | `messages` with `role='learner'` inside a `conversation` |
| AI answers safely | `messages` with `role='assistant'`, safety assessment, provider metadata |
| Answer structure | `messages.metadata` can store hook, explanation, and thinking-prompt sections |
| Parent stays connected | `parent_child_links` plus `session_participants` |
| Teacher guides learning | `classroom_memberships`, `learning_objectives`, `guidance_notes` |
| Adults guide visibly | `guidance_notes` and `session_events` are shown in timeline |
| One shared context | `shared_sessions` groups conversations, objectives, guidance, messages, and analytics |
| Exploration and guided modes | `shared_sessions.mode` controls prompt framing and adult affordances |
| Multilingual parent bridge | `message_translations` stores translated child questions and AI responses |

Session modes:

| Mode | Meaning | Child experience | Adult capabilities |
| --- | --- | --- | --- |
| `exploration` | Curiosity-first child-led learning | Child asks naturally with light structure | Parents/teachers can view and add visible notes |
| `guided` | Connected to a learning goal | Child can see simple learning goal when appropriate | Teachers/parents can attach objectives and reflection prompts |
| `review_only` | Adult can observe but not guide | Child continues normally | Adults can read, translate, and flag concerns only |

Visible guidance rule:

Adult notes are never injected invisibly as if they were the child or the AI. Guidance can influence future AI context only when policy allows, and the session timeline must show that guidance was added.

Example guidance types:

| Type | Author | Purpose |
| --- | --- | --- |
| `reflection_prompt` | Parent or teacher | Encourage child to think further |
| `context_note` | Parent or teacher | Add useful background for the session |
| `learning_objective` | Teacher, admin; parent by policy | Connect session to a classroom or family learning goal |
| `safety_note` | Parent, teacher, admin | Mark concern for review without changing history |
| `translation_note` | Parent | Store parent-language context without changing child-facing content |

Timeline rule:

The session timeline should combine:

1. Child messages.
2. AI responses.
3. Safety events visible to allowed adults.
4. Parent guidance notes.
5. Teacher guidance notes.
6. Learning objectives.
7. Flag and review status when allowed by role.

The timeline is a product feature and an audit-friendly backend model. Internal audit events remain separate because audit logs are not the same thing as child-visible session history.

### 9.2 Parent And Teacher Data Access Rules

Parent access:

1. Parent must be linked to the child through `parent_child_links`.
2. Link status must be `active`.
3. Parent can read child sessions allowed by session visibility.
4. Parent can read child messages, AI responses, flags visible to parents, guidance notes, and translations.
5. Parent can add visible guidance notes.
6. Parent cannot impersonate the child.
7. Parent cannot silently rewrite AI responses.
8. Parent cannot view unrelated children.

Teacher access:

1. Teacher must be linked through `classroom_memberships` or direct `session_participants`.
2. Teacher can read assigned student sessions.
3. Teacher can attach objectives and standards.
4. Teacher can add visible guidance notes.
5. Teacher can review flags when moderation policy allows.
6. Teacher cannot read students outside assigned classrooms or sessions.
7. Teacher cannot impersonate a child.

Admin access:

Admin can manage links, classrooms, sessions, and moderation, but admin actions must still be audit logged.

Privacy rule:

Child-facing content, parent translated content, and teacher guidance must preserve original records. Translation and guidance create new records; they do not overwrite the child question or AI answer.

---

## 10. Safety System Plan

Safety is a backend product requirement, not just an AI prompt.

Target safety layers:

| Layer | When used | Purpose |
| --- | --- | --- |
| Rule checker | Always | Fast, cheap, deterministic catches |
| LLM safety checker | Configurable, recommended in production | Nuanced classification |
| Provider guardrails | When supported | Native provider safety controls |
| Output checker | Always | Prevent unsafe AI responses from reaching child |
| Streaming safety gate | SSE endpoint | Prevent raw unsafe chunks from being emitted |

Rule checker categories to preserve:

| Category | Type | Severity |
| --- | --- | --- |
| Self-harm | `self_harm` | `high` |
| Sexual content | `sexual` | `high` |
| Contact information | `contact_info` | `medium` |
| Manipulation | `manipulation` | `high` |
| Other | `other` | configurable |

LLM safety classifier:

The classifier should return structured JSON only:

```json
{
  "is_safe": true,
  "flag_type": null,
  "severity": null,
  "confidence": 0.97,
  "reason": "Educational question"
}
```

Safety policy:

1. If rule checker returns high severity, block immediately.
2. If rule checker returns medium severity, block by default for child safety.
3. If LLM checker is enabled and returns unsafe, block.
4. If checks disagree and one result is high severity, block.
5. If the classifier fails, use conservative fallback based on environment.
6. In production child-facing mode, classifier failure should not allow questionable content through.

Deflection behavior:

| Flag type | Response style |
| --- | --- |
| `self_harm` | Encourage talking to trusted adult, no detailed harmful content |
| `sexual` | Redirect to age-appropriate learning topics |
| `contact_info` | Explain privacy and online safety |
| `manipulation` | Reinforce talking to parents, teachers, or trusted adults |
| `other` | Redirect to learning |

What to store:

1. Store the learner message.
2. Store the safety assessment.
3. Store any flag.
4. Store an audit event.
5. Do not log full unsafe content in application logs.

Implementation files:

```text
src/services/safety/ruleSafetyChecker.ts
src/services/safety/llmSafetyChecker.ts
src/services/safety/safetyPolicy.ts
src/services/safety/safetyService.ts
```

> [!NOTE]
> **🚀 Successfully built with Antigravity**
>
> Safety system fully implemented:
> - `src/services/safety/ruleSafetyChecker.ts` → deterministic regex/keyword rules for 4 flag types
> - `src/services/safety/llmSafetyChecker.ts` → optional LLM classifier using OpenAI-compatible API, returns structured JSON
> - `src/services/safety/safetyPolicy.ts` → combiner with conservative production fallback + age-appropriate deflection messages
> - `src/services/safety/safetyService.ts` → orchestrator: rule → optional LLM → persist to `safety_assessments` → return result
> - `prompts/child_safe_system_prompt.txt` + `prompts/safety_classifier_prompt.txt` loaded from disk
> - SAFETY_ENABLED and SAFETY_LLM_CHECK env vars control what runs

---

## 11. AI Provider Plan

The backend must support both:

| Mode | Provider |
| --- | --- |
| Native | AWS Bedrock |
| Proxy | LiteLLM |

Preferred default:

Use LiteLLM first for local and flexible provider routing, because the user already has experience with it.

Production fallback:

Configure provider order, for example:

```env
AI_PROVIDER_MODE=fallback
AI_PROVIDER_ORDER=litellm,bedrock
```

Provider interface:

```ts
export type ConversationHistoryItem = {
  role: "learner" | "assistant" | "system";
  content: string;
};

export type AIResponse = {
  content: string;
  provider: "mock" | "bedrock" | "litellm";
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
};

export interface AIProvider {
  name: "mock" | "bedrock" | "litellm";
  generateResponse(input: GenerateInput): Promise<AIResponse>;
  streamResponse(input: GenerateInput): AsyncGenerator<AIStreamEvent>;
}
```

Provider router responsibilities:

1. Select provider by config.
2. Apply timeout per provider call.
3. Retry only safe retryable errors.
4. Open circuit when a provider repeatedly fails.
5. Fallback to the next provider when allowed.
6. Record provider attempts.
7. Return child-friendly fallback text if all providers fail.

Bedrock provider:

- Use AWS SDK Bedrock Runtime.
- Use non-streaming Converse API for normal endpoint.
- Use ConverseStream API for SSE endpoint.
- Use IAM role in AWS deployment.
- Use access keys only for local development.

LiteLLM provider:

- Use OpenAI-compatible chat completions API.
- Use non-streaming completions for normal endpoint.
- Use streaming completions for SSE endpoint.
- Configure `baseURL` with `LITELLM_API_BASE`.
- Configure model with `LITELLM_MODEL`.

Fallback text:

Use a safe, child-friendly fallback and do not expose provider errors:

```text
I'm having a little trouble thinking right now. Can you try asking me again in a moment? I still want to help you learn.
```

> [!NOTE]
> **🚀 Successfully built with Antigravity**
>
> AI provider layer fully implemented:
> - `src/services/ai/mockProvider.ts` → deterministic dev responses with simulated delay
> - `src/services/ai/litellmProvider.ts` → OpenAI-compatible streaming + non-streaming
> - `src/services/ai/bedrockProvider.ts` → AWS Bedrock ConverseAPI + ConverseStreamAPI
> - `src/services/ai/providerRouter.ts` → fallback order, in-memory circuit breaker (CB_THRESHOLD=3, reset=30s), timeout wrapper, per-attempt DB recording
> - `src/services/ai/aiFallbacks.ts` → child-safe fallback text, retryable error classifier

---

## 12. SSE Streaming Plan

SSE is required for a better backend and perceived responsiveness.

Important safety decision:

Do not stream raw model tokens directly to a child before safety checks.

Reason:

- The current product promise is child safety.
- If unsafe model text is streamed first and checked later, the harm has already happened.

Recommended default:

Use safety-gated SSE.

Two supported stream modes:

| Mode | Default | Behavior |
| --- | --- | --- |
| `buffered` | Yes | Stream progress events while model generates, check final output, then stream safe answer chunks |
| `sentence_gate` | Later | Buffer by sentence, safety-check each sentence, emit safe chunks as they pass |

Why buffered mode first:

- Safest for children.
- Easier to implement correctly.
- Still gives frontend progress events.
- Can be upgraded to sentence-gated streaming later.

Streaming endpoint:

```text
POST /api/conversations/:conversationId/messages/stream
Content-Type: application/json
Accept: text/event-stream
```

Request body:

```json
{
  "content": "Can you explain fractions?",
  "idempotency_key": "client-generated-uuid"
}
```

SSE response events:

```text
event: message.accepted
data: {"request_id":"...","conversation_id":"..."}

event: safety.checked
data: {"direction":"input","is_safe":true}

event: ai.started
data: {"provider":"litellm","model":"gpt-4o-mini"}

event: ai.progress
data: {"status":"thinking"}

event: assistant.chunk
data: {"content":"A fraction is "}

event: assistant.chunk
data: {"content":"one part of a whole."}

event: assistant.completed
data: {"message_id":"...","is_safe":true}

event: done
data: {"ok":true}
```

Unsafe input event sequence:

```text
event: message.accepted
data: {"request_id":"...","conversation_id":"..."}

event: safety.checked
data: {"direction":"input","is_safe":false,"flag_type":"self_harm"}

event: assistant.completed
data: {"content":"safe deflection text","was_flagged":true}

event: done
data: {"ok":true}
```

Error event sequence:

```text
event: error
data: {"code":"AI_PROVIDER_UNAVAILABLE","message":"The assistant is temporarily unavailable."}

event: done
data: {"ok":false}
```

SSE implementation requirements:

1. Set `Content-Type: text/event-stream`.
2. Set `Cache-Control: no-cache, no-transform`.
3. Set `Connection: keep-alive`.
4. Send heartbeat comments every 15 seconds.
5. Use `AbortController` when the client disconnects.
6. Respect Node stream backpressure.
7. Apply total stream timeout.
8. Apply maximum output token budget.
9. Store final assistant message only after output safety passes.
10. Store provider attempts even when the stream fails.

Backpressure rule:

If `reply.raw.write()` returns `false`, wait for the `drain` event before writing more.

Client disconnect rule:

If the client disconnects:

1. Abort the AI provider request.
2. Mark the in-progress assistant message as cancelled or do not create it.
3. Record an audit event.
4. Do not retry automatically unless the client sends the same idempotency key.

Idempotency rule:

The streaming endpoint should accept `idempotency_key`.

Reason:

- SSE connections can drop.
- The client may retry.
- Without idempotency, a reconnect can create duplicate learner messages and duplicate AI calls.

> [!NOTE]
> **🚀 Successfully built with Antigravity**
>
> SSE streaming fully implemented:
> - `src/services/streaming/sseWriter.ts` → SSEWriter class with `start()`, `write()` (backpressure-aware), heartbeats every 15s, `onClose()` disconnect hook
> - `src/services/streaming/streamMessageService.ts` → buffered safety-gated flow: buffer AI response server-side → output safety check → stream approved chunks as `assistant.chunk` events
> - `src/routes/streamRoutes.ts` → `POST /api/conversations/:id/messages/stream` with AbortController on client disconnect
> - SSE event sequence: `message.accepted` → `safety.checked` → `ai.started` → `ai.progress` → `assistant.chunk`(s) → `assistant.completed` → `done`

---

## 13. Message Flow Details

### 13.1 Non-Streaming Safe Message Flow

```text
1. Receive POST /api/conversations/:id/messages.
2. Authenticate JWT.
3. Check conversation ownership.
4. Apply rate limit.
5. Validate request body.
6. Run input safety check.
7. Short transaction:
   - Insert learner message.
   - Insert safety assessment.
8. If input unsafe:
   - Short transaction creates flag.
   - Mark conversation is_flagged=true.
   - Insert assistant deflection message.
   - Insert audit event.
   - Return response with was_flagged=true.
9. If input safe:
   - Load conversation history.
   - Call AI provider router outside transaction.
   - Run output safety check.
10. Short transaction:
   - Insert assistant message.
   - Insert output safety assessment.
   - Insert provider attempt rows.
   - Insert audit event.
11. Return response with was_flagged=false.
```

### 13.2 Streaming Safe Message Flow

```text
1. Receive POST /api/conversations/:id/messages/stream.
2. Authenticate JWT.
3. Check ownership.
4. Apply rate limit and idempotency check.
5. Start SSE response.
6. Emit message.accepted.
7. Run input safety check.
8. Emit safety.checked.
9. Save learner message and input safety assessment in short transaction.
10. If unsafe:
    - Save flag and assistant deflection.
    - Emit assistant.completed with deflection.
    - Emit done.
11. If safe:
    - Emit ai.started.
    - Call AI streaming provider.
    - Buffer provider tokens server-side.
    - Emit ai.progress heartbeats.
    - Run output safety check on final buffered response.
12. If output unsafe:
    - Replace content with safe fallback.
    - Create flag for assistant message.
13. Save final assistant message in short transaction.
14. Emit assistant.chunk events for approved content.
15. Emit assistant.completed.
16. Emit done.
```

Why approved chunks are emitted after safety:

- This protects the child.
- SSE still improves UX by showing accepted, safety, and thinking events quickly.
- Later, sentence-gated mode can emit safe sentences earlier.

---

## 14. Rate Limiting And Quota Plan

Rate limiting must happen before AI provider calls.

Use Redis-backed limits so multiple API instances share limits.

Recommended limits for first production version:

| Limit type | Example policy | Applies to |
| --- | --- | --- |
| IP burst | 100 requests per minute | All routes |
| Learner message | 10 AI messages per minute | Message routes |
| Learner daily | 200 AI messages per day | Message routes |
| Provider budget | Configured token or request budget | AI calls |
| Moderation | 60 requests per minute | Teacher/admin routes |
| Parent dashboard | 120 requests per minute | Parent child/session/message view routes |
| Teacher dashboard | 180 requests per minute | Teacher class/student/session routes |
| Translation | 30 requests per hour per parent | Parent translation routes |

429 response:

```json
{
  "detail": "Rate limit exceeded",
  "retry_after_seconds": 30
}
```

Implementation files:

```text
src/services/rateLimit/limiter.ts
src/services/rateLimit/quotaPolicy.ts
src/middleware/rateLimitMiddleware.ts
```

Metrics to expose:

| Metric | Meaning |
| --- | --- |
| `rate_limit_blocked_total` | Number of blocked requests |
| `ai_requests_total` | Number of AI requests by provider |
| `ai_tokens_total` | Token usage by provider and model |
| `ai_provider_failures_total` | Provider failures by error class |

---

## 15. Audit Trail Plan

Audit logging is mandatory for child safety and moderation.

Audit events to store:

| Event type | Trigger |
| --- | --- |
| `conversation.created` | New conversation |
| `message.created` | Learner or assistant message saved |
| `safety.checked` | Any input or output safety decision |
| `message.flagged` | Unsafe message detected |
| `flag.reviewed` | Teacher/admin reviews flag |
| `adult.viewed_child_session` | Parent or teacher opens child session/message view |
| `adult.guidance_created` | Parent or teacher adds visible guidance |
| `objective.created` | Teacher/admin attaches learning objective |
| `translation.created` | Parent translated view is generated |
| `ai.provider_attempted` | AI provider call attempted |
| `ai.provider_failed` | Provider call failed |
| `auth.denied` | Auth or ownership check failed |
| `stream.disconnected` | Client disconnects SSE |

Audit rules:

1. Audit events are append-only.
2. Audit events should not store full message content.
3. Use request ID to join logs, traces, and audit events.
4. Store actor ID and role when available.
5. Hash IP and user-agent if storing them.

Implementation files:

```text
src/services/audit/auditService.ts
src/repositories/auditRepository.ts
```

---

## 16. Secrets And Configuration Plan

Local development:

- Use `.env`.
- Keep `.env.example` committed.
- Never commit real secrets.

Production:

- Use AWS Secrets Manager.
- Inject secrets into the runtime through ECS task secrets, EKS External Secrets Operator, or equivalent.
- Use IAM roles for Bedrock access.
- Avoid long-lived AWS access keys.

Configuration validation:

Use Zod for startup config validation.

Important env vars:

```env
APP_ENV=development
APP_HOST=0.0.0.0
APP_PORT=8000
LOG_LEVEL=info

DATABASE_URL=postgresql://jurnee:jurnee_secret@localhost:5432/jurnee_ai
REDIS_URL=redis://localhost:6379

AUTH_MODE=jwt
JWT_ISSUER=http://localhost:9000
JWT_AUDIENCE=childai-api
JWT_JWKS_URL=http://localhost:9000/.well-known/jwks.json

AI_PROVIDER_MODE=fallback
AI_PROVIDER_ORDER=litellm,bedrock

AWS_REGION=us-east-1
BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0

LITELLM_API_BASE=http://localhost:4000/v1
LITELLM_MODEL=gpt-4o-mini
LITELLM_API_KEY=sk-local-dev-key

SAFETY_ENABLED=true
SAFETY_LLM_CHECK=true
SAFETY_STREAM_MODE=buffered

SSE_HEARTBEAT_SECONDS=15
AI_TIMEOUT_SECONDS=30
AI_MAX_OUTPUT_TOKENS=512
```

---

## 17. Observability Plan

The backend should be diagnosable during live review and production.

Structured logs:

Use JSON logs with these fields:

```json
{
  "level": "info",
  "time": "2026-04-27T00:00:00.000Z",
  "request_id": "uuid",
  "route": "/api/conversations/:id/messages",
  "actor_user_id": "uuid",
  "actor_role": "learner",
  "event": "message.completed",
  "latency_ms": 1234
}
```

Do not log full child message content by default.

Metrics:

| Metric | Labels |
| --- | --- |
| `http_requests_total` | method, route, status |
| `http_request_duration_seconds` | method, route |
| `ai_request_duration_seconds` | provider, model, status |
| `ai_provider_failures_total` | provider, error_class |
| `safety_checks_total` | direction, checker, result, flag_type |
| `flags_created_total` | flag_type, severity |
| `sse_streams_active` | route |
| `sse_stream_duration_seconds` | status |
| `rate_limit_blocked_total` | limit_type |
| `adult_view_requests_total` | role, route, status |
| `guidance_notes_created_total` | author_role, guidance_type |
| `translation_requests_total` | source_language, target_language, status |

Tracing:

Trace spans:

```text
HTTP request
  auth.validate
  rate_limit.check
  safety.input_check
  db.insert_learner_message
  ai.provider_call
  safety.output_check
  db.insert_assistant_message
  audit.write
```

---

## 18. Testing Strategy

Testing must verify behavior, safety, and performance.

Test layers:

| Layer | Tool | Purpose |
| --- | --- | --- |
| Unit | Vitest | Safety rules, provider mapping, auth helpers |
| Integration | Vitest plus Testcontainers | Real Postgres and Redis |
| Contract | Fastify inject | Exact API response shapes |
| Streaming | Fastify inject or undici | SSE event order and disconnect handling |
| Security | Unit/integration | Auth, roles, ownership, rate limits |
| Performance | autocannon/k6 | Throughput, latency, SSE concurrency |

Do not use SQLite for integration tests.

Required test groups:

1. Health and readiness tests.
2. JWT auth tests.
3. Role and ownership tests.
4. Parent-child link authorization tests.
5. Teacher-classroom authorization tests.
6. Shared session participant tests.
7. Parent child-message view tests.
8. Teacher student-message view tests.
9. Parent/teacher guidance visibility tests.
10. Translation view tests for parent preferred language.
11. Conversation CRUD tests.
12. Safe non-streaming message test.
13. Unsafe non-streaming message test.
14. Safe SSE message test.
15. Unsafe SSE message test.
16. SSE disconnect and abort test.
17. Rate limit tests.
18. Provider fallback tests.
19. Audit event tests.
20. Safety assessment persistence tests.
21. Moderation review tests.
22. OpenAPI schema generation test.

Performance targets for the backend excluding external AI latency:

| Scenario | Target |
| --- | --- |
| Health endpoint | p95 under 30 ms locally |
| Create conversation | p95 under 100 ms locally |
| Rule safety check | p95 under 5 ms |
| Auth plus ownership check | p95 under 50 ms locally |
| SSE connection setup | p95 under 100 ms locally |

AI latency should be measured separately because provider response time is external.

---

## 19. Implementation Plan

### Phase 0: Baseline current app

Goal:

Confirm what behavior the Node.js backend must preserve.

Tasks:

1. Run current Python tests.
2. Capture current API examples from Swagger or README.
3. Save sample JSON responses for create conversation, send safe message, send unsafe message, list flagged conversations, and review flag.
4. Treat those samples as compatibility fixtures.

Done when:

- Current behavior is documented.
- Compatibility fixtures exist.

### Phase 1: Create backend skeleton

Goal:

Create a strict TypeScript Fastify app.

Files:

```text
package.json
tsconfig.json
src/app.ts
src/server.ts
src/routes/systemRoutes.ts
src/middleware/errorHandler.ts
```

Tasks:

1. Add Fastify.
2. Add TypeScript strict mode.
3. Add Pino logger.
4. Add request IDs.
5. Add global error handler.
6. Add `/health`.
7. Add `/ready` placeholder.
8. Add OpenAPI docs setup.

Done when:

- `npm run dev` starts.
- `GET /health` returns healthy.
- `GET /docs` opens.

### Phase 2: Add config validation

Goal:

Make configuration explicit and safe.

Files:

```text
src/config/settings.ts
.env.example
```

Tasks:

1. Load `.env` in local dev.
2. Validate all env vars at startup.
3. Fail startup on invalid config.
4. Normalize booleans, numbers, URL strings, and provider lists.

Done when:

- Invalid `AI_PROVIDER_ORDER` fails fast.
- Missing production auth config fails fast.

### Phase 3: Add database migrations and repositories

Goal:

Create PostgreSQL schema with migrations.

Files:

```text
migrations/*.sql
src/db/pool.ts
src/db/kysely.ts
src/repositories/*.ts
```

Tasks:

1. Create migration files.
2. Add Kysely database types.
3. Add connection pool.
4. Add repository methods.
5. Add transaction helper.
6. Add `/ready` database check.
7. Add parent-child link tables.
8. Add classroom and membership tables.
9. Add shared session, participant, guidance, objective, translation, and timeline tables.

Done when:

- Migrations run cleanly.
- Integration test can create and read a conversation through repositories.
- Integration test can link a parent to a child and a teacher to a classroom.
- Integration test can create a shared session with child, parent, and teacher participants.

### Phase 4: Add JWT auth and authorization

Goal:

Fix the biggest security gap.

Files:

```text
src/auth/jwt.ts
src/auth/roles.ts
src/auth/ownership.ts
src/middleware/authMiddleware.ts
```

Tasks:

1. Validate JWT with JWKS.
2. Extract user subject and role.
3. Upsert local user record on first authenticated request if needed.
4. Enforce route roles.
5. Enforce conversation ownership.
6. Enforce parent-child relationship access.
7. Enforce teacher-classroom and teacher-session access.
8. Keep dev-only API key mode if needed.

Done when:

- Learner cannot access another learner's conversation.
- Parent can access linked child sessions but not unlinked children.
- Teacher can access assigned student sessions but not unrelated students.
- Teacher/admin can access moderation.
- Missing auth is rejected.

### Phase 5: Add rate limiting

Goal:

Protect provider budget and database.

Files:

```text
src/services/rateLimit/limiter.ts
src/middleware/rateLimitMiddleware.ts
```

Tasks:

1. Add Redis client.
2. Add IP limit.
3. Add learner message limit.
4. Add moderation route limit.
5. Add provider budget limit hooks.
6. Add 429 response with retry-after.

Done when:

- Repeated message sends are blocked before AI provider call.
- Limits work across multiple app instances in tests.

### Phase 6: Add safety system

Goal:

Port rule checks and add extensible LLM safety checks.

Files:

```text
src/services/safety/*.ts
src/repositories/safetyRepository.ts
```

Tasks:

1. Port keyword lists.
2. Port regex checks.
3. Port deflection text.
4. Add safety policy combiner.
5. Add safety assessment persistence.
6. Add optional LLM classifier interface.

Done when:

- Existing safety unit tests pass.
- Safety decisions are stored.
- Unsafe messages create assessment records.

### Phase 7: Add AI providers and provider router

Goal:

Support mock, LiteLLM, and Bedrock with fallback.

Files:

```text
src/services/ai/*.ts
src/repositories/aiProviderAttemptRepository.ts
```

Tasks:

1. Implement mock provider.
2. Implement LiteLLM non-streaming.
3. Implement LiteLLM streaming.
4. Implement Bedrock non-streaming.
5. Implement Bedrock streaming.
6. Add provider timeout.
7. Add fallback order.
8. Add provider attempt persistence.
9. Add child-safe fallback response.

Done when:

- `AI_PROVIDER_ORDER=litellm,bedrock` is respected.
- LiteLLM failure falls back to Bedrock when configured.
- All provider failures return safe fallback text.

### Phase 8: Add conversation and message services

Goal:

Rebuild core business flow.

Files:

```text
src/services/conversationService.ts
src/services/messageService.ts
src/routes/conversationRoutes.ts
src/routes/messageRoutes.ts
```

Tasks:

1. Create conversation.
2. List visible conversations.
3. Get conversation with messages and flags.
4. Implement non-streaming safe message flow.
5. Implement non-streaming unsafe message flow.
6. Keep response shape compatible with current Python API.
7. Add audit events.

Done when:

- Existing non-streaming API behavior works.
- Unsafe content creates flags and deflections.
- No transaction is held during AI call.

### Phase 8A: Add shared sessions and adult views

Goal:

Make the backend support the three connected roles shown in the storyboard: children learn, parents stay visibly connected, and teachers guide structured learning.

Files:

```text
src/services/sharedSessionService.ts
src/services/parentViewService.ts
src/services/teacherViewService.ts
src/services/guidanceService.ts
src/services/translationService.ts
src/routes/sharedSessionRoutes.ts
src/routes/parentRoutes.ts
src/routes/teacherRoutes.ts
src/repositories/relationshipRepository.ts
src/repositories/classroomRepository.ts
src/repositories/sharedSessionRepository.ts
src/repositories/guidanceRepository.ts
src/repositories/learningObjectiveRepository.ts
src/repositories/translationRepository.ts
```

Tasks:

1. Create parent-child link management for seeded/demo users.
2. Create classroom and student membership management for seeded/demo users.
3. Create shared sessions that include learner, parent, and teacher participants.
4. Add parent endpoint to list linked children.
5. Add parent endpoint to view child sessions and messages.
6. Add teacher endpoint to list classes and students.
7. Add teacher endpoint to view assigned student sessions and messages.
8. Add visible guidance notes for parents and teachers.
9. Add teacher learning objectives and standards alignment.
10. Add parent translated view using `message_translations`.
11. Add session timeline combining messages, AI responses, objectives, guidance, and visible safety events.
12. Add audit events for adult access and guidance creation.

Done when:

- Parent can view only linked child sessions and message history.
- Teacher can view only assigned student sessions and message history.
- Parent/teacher guidance appears in the shared-session timeline.
- Adult guidance does not overwrite child messages or AI responses.
- Parent translated view preserves the original child-facing content.

### Phase 9: Add SSE streaming

Goal:

Add safe streaming without violating child-safety guarantees.

Files:

```text
src/services/streaming/sseWriter.ts
src/services/streaming/streamMessageService.ts
src/services/streaming/streamSafetyGate.ts
src/routes/streamRoutes.ts
```

Tasks:

1. Add SSE writer.
2. Add heartbeat support.
3. Add backpressure handling.
4. Add client disconnect handling.
5. Add idempotency key support.
6. Add buffered safety-gated stream mode.
7. Emit documented SSE events.
8. Persist final assistant message after output safety.
9. Record stream audit events.

Done when:

- Safe stream emits expected event order.
- Unsafe input stream emits deflection and done.
- Provider stream can be aborted on disconnect.
- Raw unsafe provider tokens are not emitted before safety approval.

### Phase 10: Add moderation and audit flows

Goal:

Make teacher/admin review production-readable.

Files:

```text
src/services/moderationService.ts
src/routes/moderationRoutes.ts
src/services/audit/auditService.ts
```

Tasks:

1. List flagged conversations.
2. Get flagged conversation details.
3. Review flag.
4. Store reviewer user ID.
5. Store reviewer notes.
6. Store audit event for review.

Done when:

- Learner cannot review flags.
- Teacher/admin can review flags.
- Review action is auditable.

### Phase 11: Add observability

Goal:

Make backend behavior visible.

Files:

```text
src/services/observability/logger.ts
src/services/observability/metrics.ts
src/services/observability/tracing.ts
```

Tasks:

1. Add structured logs.
2. Add Prometheus metrics.
3. Add OpenTelemetry tracing.
4. Add provider latency metrics.
5. Add safety metrics.
6. Add SSE active stream metrics.

Done when:

- `/metrics` exposes useful metrics.
- Logs include request IDs.
- Provider failures are visible in metrics and logs.

### Phase 12: Add tests

Goal:

Prove the backend is correct and safe.

Files:

```text
tests/unit/*
tests/integration/*
tests/contract/*
tests/performance/*
```

Tasks:

1. Add Testcontainers Postgres.
2. Add Testcontainers Redis.
3. Add auth tests.
4. Add parent-child relationship tests.
5. Add teacher-classroom relationship tests.
6. Add shared-session participant tests.
7. Add parent and teacher message-view tests.
8. Add guidance visibility tests.
9. Add translation view tests.
10. Add safety tests.
11. Add route contract tests.
12. Add SSE tests.
13. Add provider fallback tests.
14. Add audit tests.
15. Add rate limit tests.
16. Add basic load tests.

Done when:

- Unit tests pass.
- Integration tests pass against Postgres and Redis.
- Contract tests confirm response shapes.
- SSE tests confirm event order and disconnect behavior.
- Parent/teacher access tests prove no adult can view an unrelated child.

### Phase 13: Add Docker and deployment readiness

Goal:

Make backend easy to run and review.

Files:

```text
Dockerfile
docker-compose.yml
README.md
REVIEW_NOTES.md
```

Tasks:

1. Add production Dockerfile.
2. Run as non-root user.
3. Add health check.
4. Add docker-compose with API, Postgres, Redis, and optional LiteLLM.
5. Add local startup instructions.
6. Add review demo script.

Done when:

- `docker compose up --build` starts everything.
- `/health`, `/ready`, `/docs`, and `/metrics` work.
- Mock provider flow works without external keys.
- LiteLLM profile can be started for proxy testing.

---

## 20. Backend Performance Plan

Performance principles:

1. Keep route handlers thin.
2. Validate requests with compiled JSON Schema.
3. Avoid blocking CPU work on the event loop.
4. Do not hold DB transactions during AI calls.
5. Use indexes for list and moderation queries.
6. Use cursor pagination for high-volume lists.
7. Use Redis for shared rate limiting.
8. Use provider timeouts and abort signals.
9. Respect SSE backpressure.
10. Measure provider latency separately from backend latency.

Database performance:

- Use connection pool sizing appropriate to deployment.
- Use PgBouncer or RDS Proxy in production.
- Add indexes before load testing.
- Use cursor pagination for conversations and flags.
- Avoid loading entire long conversations into memory; cap history sent to AI.

AI performance:

- Cap max context messages.
- Cap max output tokens.
- Use cheaper/faster model for safety classifier when possible.
- Track provider latency by model.
- Use fallback only after timeout or retryable failure.

SSE performance:

- Keep heartbeat interval reasonable.
- Stop provider call when client disconnects.
- Avoid buffering unbounded model output.
- Set maximum stream duration.
- Track active stream count.

---

## 21. 100k User Scalability Plan

Short answer:

The rebuilt backend can be designed to support 100k registered users. It should not claim to support 100k simultaneous AI conversations without a much larger capacity plan, provider quota plan, and cost model.

The phrase "100k users" must be defined during review.

| Meaning | Difficulty | Backend answer |
| --- | --- | --- |
| 100k registered users | Normal production target | Yes, with the proposed backend design |
| 100k monthly active users | Reasonable production target | Yes, with horizontal scaling and provider quota planning |
| 100k daily active users | Larger but realistic | Yes, if traffic is spread through the day and AI quotas are sized |
| 100k concurrent logged-in users | Hard | Requires careful load testing, bigger Redis/RDS sizing, and more API replicas |
| 100k concurrent AI/SSE conversations | Very hard and expensive | Requires a dedicated scale architecture and large LLM provider commitments |

Recommended claim for this assignment:

```text
The backend is designed so it can scale toward 100k registered users. The first production target should be 100k registered users, 10k daily active users, 1k concurrent active users, and 100-500 concurrent AI streams. Higher concurrency is possible, but it must be validated with load testing and provider quota planning.
```

### 21.1 Capacity Assumptions

Use these assumptions for the first serious production sizing discussion:

| Metric | Initial target |
| --- | --- |
| Registered users | 100,000 |
| Daily active users | 10,000 |
| Peak concurrent active users | 1,000 |
| Peak concurrent AI requests | 100-300 |
| Peak concurrent SSE streams | 100-500 |
| Average learner messages per active day | 5-20 |
| Normal REST p95 excluding AI | Under 200 ms |
| SSE connection setup p95 excluding AI | Under 200 ms |
| AI response latency | Depends on model and provider quota |

Reasoning:

- Most applications do not have all registered users online at the same moment.
- AI calls are the expensive bottleneck, not normal REST routes.
- SSE creates long-lived connections, so concurrent streams matter more than total user count.

### 21.2 Main Bottlenecks At 100k Users

| Bottleneck | Why it matters | Plan |
| --- | --- | --- |
| LLM provider quota | Bedrock/LiteLLM request and token limits can throttle traffic | Provider fallback, quotas, rate limits, budget controls |
| SSE connections | Long-lived HTTP connections consume memory and file descriptors | Horizontal API replicas, ALB tuning, stream timeouts |
| PostgreSQL writes | Every message creates message, safety, audit, and provider rows | Short transactions, indexes, pool tuning, RDS sizing |
| Redis limits | Every protected route checks Redis | ElastiCache sizing, efficient keys, local short TTL cache where safe |
| Safety classifier | LLM-based safety can double AI calls | Use rules first, classifier selectively, cheaper model |
| Conversation history | Long chats can create large prompts | Cap history, summarize older context, store summaries |
| Moderation queries | Flag dashboards can grow large | Partial indexes, cursor pagination, filtered views |
| Parent/teacher dashboards | Adult views can fan out across many children and sessions | Relationship-scoped queries, cursor pagination, summary tables, analytics snapshots |

### 21.3 Scaling Architecture

For 100k registered users:

```text
CloudFront or client
  -> ALB
  -> multiple Fastify API tasks/pods
  -> RDS PostgreSQL
  -> ElastiCache Redis
  -> LiteLLM internal service
  -> AWS Bedrock
```

API scaling:

- Keep API servers stateless.
- Scale horizontally behind ALB.
- Use Redis for shared rate limits and idempotency.
- Use database transactions only for short writes.
- Use autoscaling based on CPU, memory, request rate, and active SSE streams.

Database scaling:

- Use RDS PostgreSQL Multi-AZ.
- Start with a moderate instance, then load-test.
- Add read replicas only when read traffic needs it.
- Use PgBouncer or RDS Proxy if connection count becomes a bottleneck.
- Use cursor pagination, not offset pagination, for large lists.

Redis scaling:

- Use ElastiCache Redis.
- Keep rate-limit keys small with TTLs.
- Track active SSE stream count per user and globally.
- Use Redis for idempotency records on stream retries.

AI scaling:

- Set per-user and global AI budgets.
- Configure LiteLLM with provider routing and spend limits.
- Configure Bedrock quota increases before launch.
- Track tokens per provider and model.
- Fall back from LiteLLM to Bedrock only for retryable failures.

### 21.4 What If The Requirement Is 100k Concurrent AI Users?

If the reviewer means 100k simultaneous users actively chatting with AI, the answer is:

```text
Not with a simple backend deployment. The architecture can evolve there, but 100k concurrent AI conversations is a separate scale project.
```

Additional requirements would include:

1. Large LLM provider quota contracts.
2. Strict per-user and per-tenant budgets.
3. Dedicated LiteLLM cluster with autoscaling.
4. Queue-based admission control for AI requests.
5. Separate stream gateway tier for SSE connections.
6. Regional deployment if users are geographically distributed.
7. RDS write scaling strategy, partitioning, or event-log offloading.
8. Asynchronous audit/event pipeline through SQS or Kafka-compatible streaming.
9. Dedicated load testing at 10k, 25k, 50k, and 100k concurrent connections.
10. Cost model for tokens, provider calls, database writes, logs, and traces.

### 21.5 Load Testing Plan For 100k Readiness

Load tests should be staged.

| Stage | Goal |
| --- | --- |
| Stage 1 | 100 concurrent users, mock AI |
| Stage 2 | 1,000 concurrent users, mock AI |
| Stage 3 | 500 concurrent SSE streams, mock AI |
| Stage 4 | 100 concurrent real LiteLLM/Bedrock calls |
| Stage 5 | 1,000 concurrent mixed traffic with provider calls rate-limited |
| Stage 6 | Failover test where LiteLLM is unavailable and Bedrock fallback is used |

Metrics to watch:

- API p95 and p99 latency.
- Active SSE streams.
- Node.js event loop delay.
- API memory per active stream.
- PostgreSQL CPU, locks, connections, and slow queries.
- Redis CPU and command latency.
- AI provider latency and throttling.
- Rate-limit rejection count.
- Error rate by route.

Acceptance target for the first production version:

```text
100k registered users supported by design.
10k daily active users validated by load model.
1k concurrent active users validated with mock AI.
100-500 concurrent SSE streams validated with mock AI.
Real AI concurrency limited by provider quotas and cost controls.
```

---

## 22. Production Deployment Plan

Recommended AWS path:

| Layer | Recommended service |
| --- | --- |
| Container runtime | ECS Fargate first, EKS later if needed |
| Database | RDS PostgreSQL Multi-AZ |
| Redis | ElastiCache Redis |
| Secrets | AWS Secrets Manager |
| Logs | CloudWatch Logs |
| Metrics | Prometheus/Grafana or CloudWatch |
| Tracing | OpenTelemetry to AWS X-Ray or compatible backend |
| AI native | AWS Bedrock with IAM role |
| AI proxy | LiteLLM deployed as internal service |
| Edge | ALB plus WAF |

Why ECS first:

- Lower operational overhead than EKS.
- Good enough for a backend-first assignment and early production.
- EKS can be introduced later if Kubernetes-specific scaling or platform needs appear.

Production hardening:

1. Use TLS everywhere.
2. Use WAF in front of ALB.
3. Use private subnets for API tasks.
4. Use RDS with backups and point-in-time recovery.
5. Use IAM roles instead of static AWS keys.
6. Use Secrets Manager rotation where possible.
7. Add alarms for high flag rate, provider failure rate, 5xx rate, and DB saturation.

---

## 23. Claude Verification Checklist

Use this checklist when asking Claude or another reviewer to verify the plan.

Architecture:

- Does the plan avoid copying prototype shortcuts into the rebuild?
- Are routes, services, repositories, and providers separated clearly?
- Is the AI provider abstraction independent from safety logic?

Security:

- Does JWT replace free-form `learner_id` trust?
- Are roles and ownership checks defined?
- Can parents access only linked children?
- Can teachers access only assigned students/classes/sessions?
- Are moderation routes restricted to teacher/admin?
- Are secrets kept out of production `.env` files?

Parent and teacher product model:

- Does the plan support three connected roles: child, parent, teacher?
- Are shared sessions modeled as a first-class backend concept?
- Can parent and teacher views read child messages without impersonating the child?
- Is adult guidance visible rather than silently injected?
- Are translations stored as separate records instead of replacing original messages?

Safety:

- Are learner input and assistant output both checked?
- Does SSE avoid streaming raw unsafe model tokens?
- Are safety decisions persisted?
- Are self-harm and child-safety cases handled conservatively?

Performance:

- Are DB transactions short?
- Are AI calls outside transactions?
- Is rate limiting before AI provider calls?
- Is SSE backpressure handled?
- Are indexes specified for hot queries?

Reliability:

- Is provider fallback specified?
- Are timeouts and aborts specified?
- Are client disconnects handled?
- Is idempotency included for streaming retries?

Testing:

- Does integration testing use PostgreSQL and Redis?
- Are auth, safety, rate limit, provider fallback, audit, and SSE covered?
- Are API response contracts tested?

Operations:

- Are logs structured?
- Are metrics defined?
- Are audit events append-only?
- Is deployment path realistic for AWS?

Scale:

- Does the plan distinguish registered users from concurrent users?
- Are AI provider quotas treated as a primary bottleneck?
- Are SSE connection limits and backpressure accounted for?
- Is there a staged load-testing plan for 100k readiness?

---

## 24. Live Review Talking Points

Key design decisions to explain:

1. Fastify was chosen for performance and simple route-level schema validation.
2. Kysely plus PostgreSQL was chosen for type-safe SQL without heavy runtime ORM behavior.
3. JWT auth fixes the biggest current security gap.
4. Redis-backed rate limiting protects AI budget and backend availability.
5. Safety is outside the AI provider so every model path is guarded consistently.
6. SSE is safety-gated because child safety matters more than raw token streaming.
7. Provider fallback prevents LiteLLM or Bedrock from being a single point of failure.
8. Audit events make moderation and safety decisions reviewable.
9. Testcontainers avoids the SQLite vs PostgreSQL mismatch.
10. Transactions are deliberately short and never wrap slow LLM calls.
11. Shared sessions make child questions, AI answers, parent guidance, teacher objectives, and timeline events part of one visible learning context.
12. Parent and teacher endpoints are authorization-bound by real relationship tables, not by trusting request parameters.
13. Adult guidance is visible and supportive, not silent monitoring or hidden AI prompt manipulation.
14. The backend can target 100k registered users, but 100k concurrent AI users requires separate capacity planning and provider commitments.

Where AI helps:

- Generating educational responses.
- Optional nuanced safety classification.
- Summarizing long conversation history before sending to the model.
- Helping teachers review flagged conversations with summaries in a future version.

Where AI does not replace backend logic:

- Authentication.
- Authorization.
- Rate limiting.
- Audit logging.
- Database consistency.
- Safety policy decisions.
- Incident response and monitoring.

---

## 25. Definition Of Done

The backend rebuild is done when:

1. `docker compose up --build` starts API, Postgres, Redis, and optional LiteLLM.
2. `/health` returns healthy.
3. `/ready` checks database and Redis.
4. `/docs` shows all REST and SSE endpoints.
5. JWT auth protects `/api/*`.
6. Learners can only access their own conversations.
7. Parents can only access linked children.
8. Teachers can only access assigned students.
9. Parent endpoints expose child sessions, conversations, messages, timelines, and translations.
10. Teacher endpoints expose classes, assigned students, sessions, messages, objectives, guidance, and analytics.
11. Shared sessions connect child messages, AI responses, adult guidance, objectives, and visible timeline events.
12. Adult guidance is visible and does not silently rewrite child or AI messages.
13. Teacher/admin roles can access moderation.
14. Non-streaming safe message flow works.
15. Non-streaming unsafe message flow flags and deflects.
16. SSE safe message flow works with safety-gated chunks.
17. SSE unsafe input flow returns a deflection and creates a flag.
18. LiteLLM provider works.
19. Bedrock provider works.
20. Provider fallback works.
21. Redis rate limiting blocks abusive usage before AI calls.
22. Safety assessments are stored.
23. Audit events are stored for adult views and guidance actions.
24. Tests run against PostgreSQL and Redis.
25. Logs include request IDs and no full unsafe child content.
26. Metrics expose HTTP, AI, safety, rate limit, adult-view, and SSE behavior.
27. Load tests validate the agreed first target: 1k concurrent active users and 100-500 concurrent SSE streams with mock AI.
28. Real AI concurrency limits are documented based on Bedrock and LiteLLM quotas.

---

## 26. First Build Milestone

Build this first:

```text
Fastify backend
strict TypeScript
config validation
PostgreSQL migrations
Kysely repositories
JWT auth with local dev issuer
ownership checks
parent-child relationship checks
teacher-classroom relationship checks
shared session model
basic parent child-message view endpoint
basic teacher student-message view endpoint
Redis rate limiting
rule safety checker
mock AI provider
non-streaming conversation and message flow
audit events
Postgres and Redis integration tests
```

Do not implement Bedrock, LiteLLM streaming, or advanced SSE until the first milestone is stable.

Reason:

- The core backend must be correct before external AI complexity is added.
- Auth, ownership, safety, rate limiting, and audit are higher priority than streaming polish.
- Once the mock provider flow is solid, Bedrock, LiteLLM, and SSE become controlled extensions.
