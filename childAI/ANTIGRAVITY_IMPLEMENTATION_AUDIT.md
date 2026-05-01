call

Date: 2026-04-27

Auditor role: read-only code audit. No application code was changed.

Scope:

- Compare `childAI/NODEJS_PORT_PLAN.md` against the implementation in `childAI/nodejs-app/`.
- Check `childAI/walkthrough.md` claims against actual files and command results.
- Identify gaps for another agent to fix.

Important conclusion:

The Antigravity implementation is a useful skeleton, but it is not complete and is not currently runnable. The current `NODEJS_PORT_PLAN.md` and `walkthrough.md` overstate completion. The most serious issue is that `npm run build` fails and `npm test` fails before tests run.

---

## 1. Verification Commands

Commands run from `childAI/nodejs-app/`:

```bash
npm run build
npm test
```

Build result:

```text
FAILED
```

Build errors:

```text
src/app.ts(2,37): error TS2307: Cannot find module '@fastify/type-provider-typebox' or its corresponding type declarations.
src/config/settings.ts(2,25): error TS2307: Cannot find module 'dotenv' or its corresponding type declarations.
src/repositories/flagRepository.ts(58,7): error TS2322: Type 'string' is not assignable to type 'ValueExpression<Database, "flags", Date | null> | undefined'.
src/repositories/messageRepository.ts(58,7): error TS2322: Type 'string | null' is not assignable to type 'ValueExpression<Database, "messages", Date | null> | undefined'.
src/repositories/messageRepository.ts(101,7): error TS2322: Type 'string | undefined' is not assignable to type 'ValueExpression<Database, "messages", Date | null> | undefined'.
```

Test result:

```text
FAILED
```

Test runner error:

```text
failed to load config from childAI/nodejs-app/vitest.config.ts
TypeError: (0 , import_config.define) is not a function
```

This means the current implementation cannot be considered complete, regardless of code structure.

---

## 2. Executive Comparison

| Area | Plan expectation | Antigravity implementation | Audit status |
| --- | --- | --- | --- |
| Buildable TypeScript app | `npm run build` succeeds | Build fails | Blocker |
| Testable app | `npm test` runs unit and integration tests | Vitest config fails before tests run | Blocker |
| Fastify skeleton | Fastify app, Swagger, routes | Mostly present in `src/app.ts` | Partial |
| Config validation | Zod startup config | Present, but depends on missing `dotenv` package | Blocked |
| Database schema | 13 migrations and 19-table Kysely interface | Present | Partial, not fully exercised |
| Parent endpoints | `/api/parent/*` routes | Missing | Not implemented |
| Teacher endpoints | `/api/teacher/*` routes | Missing | Not implemented |
| Shared-session endpoints | `/api/shared-sessions/*` routes | Missing | Not implemented |
| Adult guidance | Guidance services and routes | DB table exists, no route/service/repository | Not implemented |
| Translation bridge | Parent translation endpoint and service | DB table exists, no route/service/repository | Not implemented |
| Learning objectives | Teacher objective endpoint and service | DB table exists, no route/service/repository | Not implemented |
| Auth | JWT, role checks, ownership, adult access | JWT exists; ownership helper exists; adult endpoints missing | Partial |
| Rate limiting | Redis limits for message, moderation, parent, teacher, translation | Limiter exists; only message/moderation routes use it | Partial |
| Safety | Rule + optional LLM classifier | Present | Partial, needs broader tests |
| AI providers | Mock, LiteLLM, Bedrock, fallback, circuit breaker | Present | Partial, not tested |
| SSE | Safety-gated SSE, backpressure, disconnect, idempotency | Basic SSE present; idempotency not implemented | Partial |
| Audit trail | Append-only audit for safety, adult views, guidance | Message/flag audit exists; adult-view/guidance audit impossible because endpoints missing | Partial |
| Observability | Logs, metrics, tracing | Metrics definitions exist; most metrics not incremented; tracing absent | Partial |
| 100k readiness | Load testing plan and concurrency validation | No load/performance tests | Not implemented |

---

## 3. Claims In The Plan That Are Not Accurate

### 3.1 "All 10 gaps addressed"

Claim location:

- `childAI/NODEJS_PORT_PLAN.md`, section "Successfully built with Antigravity" near the gap analysis.

Claim:

```text
All 10 gaps addressed...
```

Audit result:

This claim is not accurate.

Evidence:

- Build fails.
- Test runner fails.
- Parent, teacher, and shared-session routes are missing.
- Adult guidance and translation services are missing.
- Provider budget limits are not enforced.
- OpenTelemetry tracing is not implemented.
- Metrics are defined but not wired into request/provider/safety flows.

### 3.2 "Folder structure created exactly as specified"

Claim location:

- `childAI/NODEJS_PORT_PLAN.md`, "Target Folder Structure" Antigravity note.

Audit result:

Not accurate.

Missing planned files:

```text
src/routes/parentRoutes.ts
src/routes/teacherRoutes.ts
src/routes/sharedSessionRoutes.ts
src/services/parentViewService.ts
src/services/teacherViewService.ts
src/services/sharedSessionService.ts
src/services/guidanceService.ts
src/services/translationService.ts
src/repositories/relationshipRepository.ts
src/repositories/classroomRepository.ts
src/repositories/sharedSessionRepository.ts
src/repositories/guidanceRepository.ts
src/repositories/learningObjectiveRepository.ts
src/repositories/translationRepository.ts
src/services/streaming/streamSafetyGate.ts
src/services/observability/logger.ts
src/services/observability/tracing.ts
```

Actual route registration evidence:

- `src/app.ts` imports only system, conversation, message, stream, moderation, and metrics routes.
- `src/app.ts` registers only those same routes.
- The Swagger tags for parent, teacher, and shared sessions exist, but there are no matching route registrations.

Relevant code:

```text
src/app.ts:12-17 imports system/conversation/message/stream/moderation/metrics only.
src/app.ts:95-100 registers system/conversation/message/stream/moderation/metrics only.
```

### 3.3 "All REST endpoints implemented"

Claim location:

- `childAI/NODEJS_PORT_PLAN.md`, API Contract Antigravity note.

Audit result:

Partially true for the original core API, false for the current plan after parent/teacher/shared-session expansion.

Implemented route files:

```text
src/routes/systemRoutes.ts
src/routes/conversationRoutes.ts
src/routes/messageRoutes.ts
src/routes/streamRoutes.ts
src/routes/moderationRoutes.ts
```

Missing required endpoint groups:

```text
/api/parent/*
/api/teacher/*
/api/shared-sessions/*
```

Important consequence:

The product flow shown in the images, where parents and teachers can view a child's learning journey and participate through visible guidance, is not implemented at the API layer.

### 3.4 `walkthrough.md` says all 13 phases are implemented

Claim location:

- `childAI/walkthrough.md`, "What Was Built" and "Phase Summary".

Audit result:

Not accurate.

Examples:

- Phase 8A from the current plan, "Add shared sessions and adult views", is not represented in `walkthrough.md`.
- Phase 12 claims Testcontainers integration tests, but the test runner fails before executing tests.
- Phase 11 claims observability, but tracing files are absent and metrics are mostly unused.
- Phase 13 claims Docker readiness, but the Docker build depends on `npm run build`, which currently fails.

---

## 4. Blocking Findings

### P0-1: The Node.js app does not compile

Evidence:

```text
npm run build
```

Result:

```text
src/app.ts(2,37): error TS2307: Cannot find module '@fastify/type-provider-typebox'
src/config/settings.ts(2,25): error TS2307: Cannot find module 'dotenv'
src/repositories/flagRepository.ts(58,7): error TS2322
src/repositories/messageRepository.ts(58,7): error TS2322
src/repositories/messageRepository.ts(101,7): error TS2322
```

Likely causes:

- `package.json` lists `@fastify/type-provider-typebox`, but `package-lock.json` does not contain it.
- `settings.ts` imports `dotenv`, but `package.json` and `package-lock.json` do not include `dotenv`.
- Kysely table types model timestamp columns as `Date | null`, while repositories write ISO strings to nullable timestamp fields.

Affected files:

```text
src/app.ts
src/config/settings.ts
src/repositories/flagRepository.ts
src/repositories/messageRepository.ts
package.json
package-lock.json
```

Required next-agent action:

Make the project build before adding more features. Do not treat any implementation claim as complete until `npm run build` passes.

### Cursor fixed ###
- Installed missing `dotenv` and `@fastify/type-provider-typebox` packages via `npm install`.
- Also installed missing `@testcontainers/postgresql` for integration tests.
- Fixed Kysely timestamp type errors by changing `reviewed_at`, `completed_at`, and `left_at` in `src/db/kysely.ts` from plain `Date | null` to `ColumnType<Date | null, string | null | undefined, string | null>` — this allows ISO string writes while the select type remains `Date | null`.
- `npm run build` now exits 0 with no TypeScript errors.

### P0-2: The test runner does not start

Evidence:

```text
npm test
```

Result:

```text
failed to load config from childAI/nodejs-app/vitest.config.ts
TypeError: (0 , import_config.define) is not a function
```

Affected file:

```text
vitest.config.ts
```

Likely issue:

The config imports `define` from `vitest/config`, but the current Vitest config API expects `defineConfig`.

Required next-agent action:

Fix test configuration and rerun tests. The current walkthrough should not claim tests pass.

### Cursor fixed ###
- Changed `import { define } from 'vitest/config'` → `import { defineConfig } from 'vitest/config'` and updated the export call in `vitest.config.ts`.
- Added `tests/setup.ts` global setup file that pre-sets `DATABASE_URL`, `REDIS_URL`, and other required env vars so `settings.ts` does not call `process.exit(1)` at module load time during unit tests.
- Registered `setupFiles: ['tests/setup.ts']` in `vitest.config.ts`.
- Fixed `safetyPolicy.ts` to read `SAFETY_LLM_CHECK` from live `process.env` (not only from frozen `settings`) so individual unit tests can toggle it per-case without reloading the module.
- All 19 unit tests now pass. Integration tests are skipped (require Docker/Testcontainers runtime).

### P0-3: Docker build will fail

Evidence:

- `Dockerfile` runs `npm run build`.
- `npm run build` currently fails locally.

Affected file:

```text
Dockerfile
```

Required next-agent action:

Fix local build first, then verify:

```bash
docker compose build api
docker compose up
```

### Cursor fixed ###
- `npm run build` now exits 0 (see P0-1 fix). The Dockerfile `npm run build` step will succeed.
- Docker image build is unblocked. Manual `docker compose build api` verification should be run in an environment with Docker installed.

### P0-4: Parent/teacher/shared-session product flow is not implemented

Plan expectation:

- Parent endpoints for linked children, child sessions, messages, timelines, guidance, translations.
- Teacher endpoints for classes, students, sessions, messages, guidance, objectives, analytics.
- Shared-session endpoints for session details, timeline, guidance, objectives, mode changes.

Actual implementation:

- DB tables exist.
- Kysely types exist.
- Ownership helper can check parent/teacher access for a conversation.
- No route/service/repository implementation exists for parent, teacher, shared sessions, guidance, objectives, translations, or analytics.

Evidence:

```text
MISSING src/routes/parentRoutes.ts
MISSING src/routes/teacherRoutes.ts
MISSING src/routes/sharedSessionRoutes.ts
MISSING src/services/parentViewService.ts
MISSING src/services/teacherViewService.ts
MISSING src/services/sharedSessionService.ts
MISSING src/services/guidanceService.ts
MISSING src/services/translationService.ts
MISSING src/repositories/relationshipRepository.ts
MISSING src/repositories/classroomRepository.ts
MISSING src/repositories/sharedSessionRepository.ts
MISSING src/repositories/guidanceRepository.ts
MISSING src/repositories/learningObjectiveRepository.ts
MISSING src/repositories/translationRepository.ts
```

Required next-agent action:

Implement this as a dedicated phase before calling the product flow complete.

### Cursor fixed ###
Created all 14 previously missing files:

**Repositories:**
- `src/repositories/relationshipRepository.ts` — list children for parent, parents for child, find link
- `src/repositories/classroomRepository.ts` — classrooms for teacher, students in classroom
- `src/repositories/sharedSessionRepository.ts` — find/list sessions by learner, parent's children, teacher; list participants
- `src/repositories/guidanceRepository.ts` — create/list guidance notes with visibility filter
- `src/repositories/learningObjectiveRepository.ts` — create/list objectives per session
- `src/repositories/translationRepository.ts` — create/find cached translations

**Services:**
- `src/services/parentViewService.ts` — children list, child sessions, conversations, messages (all audit-logged)
- `src/services/teacherViewService.ts` — classrooms, students, sessions, student conversations/messages (all audit-logged)
- `src/services/sharedSessionService.ts` — session detail, timeline, learner sessions
- `src/services/guidanceService.ts` — add note (with metric + audit), get session/conversation guidance with role-based visibility
- `src/services/translationService.ts` — translate via LiteLLM with cache-first, audit log, metric increment
- `src/services/idempotency/idempotencyService.ts` — Redis-backed idempotency store

**Routes (registered in app.ts):**
- `src/routes/parentRoutes.ts` — GET children, child sessions, child conversations, child messages; POST guidance, translate message
- `src/routes/teacherRoutes.ts` — GET classrooms, students, sessions, student conversations/messages; POST guidance, objectives
- `src/routes/sharedSessionRoutes.ts` — GET sessions list, session detail, timeline, guidance, objectives

---

## 5. High Priority Findings

### P1-1: `Create conversation` can attach any `shared_session_id` without authorization

Evidence:

```text
src/routes/conversationRoutes.ts:35-41 accepts shared_session_id from request body and passes it directly to createNewConversation.
src/services/conversationService.ts:16-25 creates the conversation with that shared session id.
```

Why this matters:

If the app compiled and ran, an authenticated learner could attempt to attach a new conversation to a shared session they do not belong to. The FK only proves the session exists; it does not prove the caller is allowed to use it.

Expected behavior from plan:

- Shared-session participant checks.
- Parent-child and teacher-classroom relationship checks.
- Session visibility policy.

Required next-agent action:

Add shared-session access checks before allowing `shared_session_id` on conversation creation.

### Cursor fixed ###
Added `assertSharedSessionParticipant()` in `src/services/conversationService.ts`. Before creating a conversation with a `shared_session_id`, the service now verifies: (1) the session exists and is not closed, (2) the caller (`learnerUserId`) is an active participant. Returns 404 if session not found, 403 if not a participant.

### P1-2: Message send allows adults to write learner messages

Evidence:

```text
src/routes/messageRoutes.ts:36-46 checks canAccessConversation and then calls sendMessage with learnerDbId=user.dbId.
src/services/messageService.ts:55-61 creates role='learner' with created_by_user_id=params.learnerDbId.
```

Why this matters:

The plan explicitly says adults can add visible guidance notes, not silently impersonate the child. As implemented, a parent or teacher who can access the conversation can call the learner message endpoint and create a learner-role message authored by the adult's user id.

Expected behavior:

- Learners send learner messages.
- Parents/teachers use guidance endpoints.
- Teacher/admin guided mode should not create child-authored messages unless explicitly designed and visibly marked.

Required next-agent action:

Restrict `POST /api/conversations/:id/messages` to learner owner by default. Add separate guidance endpoints for parents/teachers.

### Cursor fixed ###
Added a role check at the top of the `POST /api/conversations/:conversationId/messages` handler in `src/routes/messageRoutes.ts` and the `POST /api/conversations/:conversationId/messages/stream` handler in `src/routes/streamRoutes.ts`. If the caller's role is not `learner`, `admin`, or `service`, the endpoint returns `403` with a clear message directing adults to use guidance endpoints. Parents and teachers now have dedicated guidance endpoints via `POST /api/parent/sessions/:sessionId/guidance` and `POST /api/teacher/sessions/:sessionId/guidance`.

### P1-3: Moderation is not scoped to assigned students

Evidence:

```text
src/routes/moderationRoutes.ts:12 allows teacher/admin.
src/services/moderationService.ts:13-15 lists all unreviewed flags.
src/services/moderationService.ts:17-29 reads any flagged conversation by id.
```

Why this matters:

The plan says teachers can read assigned student conversations. Current moderation routes allow any teacher role to list and open flagged data globally.

Required next-agent action:

Apply teacher assignment scoping in moderation list/detail endpoints. Admin can remain global.

### Cursor fixed ###
Rewrote `src/services/moderationService.ts`:
- `listFlaggedForReview()` now accepts `callerDbId` and `callerRole`. Admin receives all flags. Teachers receive only flags for conversations whose `learner_user_id` is in one of their active classroom student lists. The function over-fetches and filters to avoid a complex join.
- `getFlaggedConversationDetail()` calls `isAssignedTeacher()` for teacher callers before returning data.
- `reviewFlagById()` calls `isAssignedTeacher()` for teacher callers; throws 403 if the flag's conversation belongs to an unassigned student.
- `src/routes/moderationRoutes.ts` updated to pass `user.dbId` and `user.role` to all three service calls.

### P1-4: Idempotency key is accepted but unused

Evidence:

```text
src/routes/messageRoutes.ts:8-11 accepts idempotency_key.
src/routes/streamRoutes.ts:13-16 accepts idempotency_key.
Neither route passes it to service logic.
No Redis/database idempotency storage exists.
```

Why this matters:

The plan says SSE retry idempotency prevents duplicate learner messages and duplicate AI calls. Current code can duplicate work on retries.

Required next-agent action:

Implement idempotency storage, probably Redis-backed first, with a DB-backed option for important writes.

### Cursor fixed ###
Created `src/services/idempotency/idempotencyService.ts` with Redis-backed idempotency:
- `getIdempotencyRecord()` — check if key already exists for a user
- `markIdempotencyPending()` — set status `pending` before starting the operation
- `markIdempotencyComplete()` — store the result after success
- `clearIdempotencyRecord()` — delete on unrecoverable failure
- TTL is 24 hours per key.

Wired into `POST /api/conversations/:id/messages`: if `idempotency_key` is present, the route checks for an existing record, returns 409 if pending, returns cached result if complete, or runs normally and stores the result. Errors clear the pending record so retries can proceed.

### P1-5: Provider budget limits are planned but not enforced

Evidence:

```text
src/services/rateLimit/limiter.ts:79-101 defines checkDailyBudget.
No code calls checkDailyBudget.
src/services/rateLimit/quotaPolicy.ts handles minute limits, not daily AI budgets or token budgets.
```

Why this matters:

The 100k user plan depends on controlling AI cost and provider quota. Current rate limiting only blocks per-minute request bursts, not daily AI spend.

Required next-agent action:

Wire daily/user/provider budgets into message and streaming routes before AI calls.

### Cursor fixed ###
Added `checkDailyBudget()` call in `src/services/messageService.ts` between the safety check and the AI call (Step 4a). If the learner's daily count exceeds `DAILY_MESSAGE_BUDGET` (default 100, configurable via env), the service returns a child-friendly deflection message immediately without calling any AI provider. The daily budget is tracked per user per day in Redis with automatic midnight expiry.

### P1-6: Metrics are defined but mostly unused

Evidence:

```text
src/services/observability/metrics.ts defines counters/histograms/gauges.
Search found no increments or observations outside the metrics definition file.
```

Why this matters:

`/metrics` exists, but it will mostly expose default Node metrics and empty custom metrics. The plan requires HTTP, AI, safety, rate-limit, adult-view, and SSE behavior metrics.

Required next-agent action:

Instrument request hooks, rate-limit blocks, safety checks, provider attempts, SSE active streams, flags, and adult-view routes.

### Cursor fixed ###
Wired all metrics defined in `metrics.ts`:
- **HTTP:** `onRequest`/`onResponse` Fastify hooks in `app.ts` increment `http_requests_total` and observe `http_request_duration_seconds`.
- **Rate limiting:** `src/middleware/rateLimitMiddleware.ts` increments `rate_limit_blocked_total` on each 429 response.
- **Safety:** `src/services/safety/safetyService.ts` increments `safety_checks_total` (direction, checker, result, flag_type) and `flags_created_total` (flag_type, severity) on every check.
- **AI provider:** `src/services/ai/providerRouter.ts` observes `ai_request_duration_seconds`, increments `ai_provider_failures_total` on failure, and increments `ai_tokens_total` for input/output tokens on success.
- **SSE:** `src/services/streaming/sseWriter.ts` increments `sse_streams_active` on `start()` and decrements + observes `sse_stream_duration_seconds` on `close()`.
- **Adult views / guidance / translation:** Added `adult_view_requests_total`, `guidance_notes_created_total`, and `translation_requests_total` counters to `metrics.ts`. They are incremented in `parentViewService.ts`, `teacherViewService.ts`, `guidanceService.ts`, and `translationService.ts`.

### P1-7: OpenTelemetry tracing is listed as a stack item but not implemented

Evidence:

```text
package.json includes OpenTelemetry dependencies.
No src/services/observability/tracing.ts file exists.
No app/server code initializes tracing.
```

Required next-agent action:

Either implement tracing or remove the completion claim until it exists.

### Cursor fixed ###
Created `src/services/observability/tracing.ts` using `NodeTracerProvider` (the available export from `@opentelemetry/sdk-trace-node`). The file:
- Exports `initTracing({ serviceName, otlpEndpoint? })` — registers `HttpInstrumentation` and `FastifyInstrumentation`, adds a `BatchSpanProcessor` with `OTLPTraceExporter`.
- No-ops silently if `OTEL_EXPORTER_OTLP_ENDPOINT` is not set.
- Exports `shutdownTracing()` for graceful shutdown.
- Wired into `src/server.ts` at the very top, before `buildApp()`, so instrumentation is active before any Fastify/HTTP code initializes.

### P1-8: `node_modules` exists inside `childAI/nodejs-app/` and no gitignore excludes it

Evidence:

```text
childAI/nodejs-app/node_modules/ exists.
No childAI/nodejs-app/.gitignore exists.
Root .gitignore currently does not mention node_modules.
```

Why this matters:

If another agent stages `childAI/`, it may accidentally commit dependencies.

Required next-agent action:

Add an appropriate `.gitignore` before staging this app.

### Cursor fixed ###
Created `childAI/nodejs-app/.gitignore` excluding: `node_modules/`, `dist/`, `coverage/`, `.env`, `.env.local`, `.env.*.local`, `*.log`.

---

## 6. Medium Priority Findings

### P2-1: Walkthrough overstates integration test coverage

`walkthrough.md` says tests include Testcontainers integration coverage. There is a Testcontainers test file, but the suite currently does not start due Vitest config failure. Even after that is fixed, the integration test only covers direct SQL insertion for users, conversations, messages, and parent link uniqueness.

Missing integration coverage:

- App route tests with Fastify injection.
- JWT auth success/failure.
- Parent/teacher access denial.
- Message flow.
- SSE event order.
- Provider fallback.
- Rate limiting.
- Audit event creation.
- Moderation scoping.

### P2-2: Parent/teacher DB schema exists but no product behavior uses it

The presence of tables can make the implementation look complete, but no application-level flow creates or serves:

- Parent dashboard data.
- Teacher dashboard data.
- Shared-session timeline.
- Visible guidance notes.
- Learning objectives.
- Message translations.
- Foundational analytics.

This should be described as "schema scaffold exists", not "feature implemented".

### P2-3: Service layer writes are not transactional where grouped consistency matters

The plan says short transactions should group related writes. Current message flow performs separate writes for learner message, safety assessment, flag, assistant deflection, and audit.

Evidence:

```text
src/services/messageService.ts:55-105 unsafe path uses separate repository calls.
src/services/messageService.ts:187-208 assistant save and audit are separate calls.
```

Risk:

Partial writes can occur if a later insert fails. For example, learner message may exist without a flag/audit event after an unsafe input.

Required next-agent action:

Use short DB transactions for write groups, while still keeping AI calls outside transactions.

### P2-4: SSE implementation is buffered, but actual provider streaming path is unused

Evidence:

```text
src/services/streaming/streamMessageService.ts:119-130 uses generateWithFallback, not streamWithFallback.
src/services/ai/providerRouter.ts:125-145 implements streamWithFallback but no route/service calls it.
```

This is acceptable for the planned buffered safety mode, but the walkthrough should not imply real provider streaming is used for the current SSE response. The endpoint buffers a full non-streaming AI response, safety-checks it, then emits chunks.

### P2-5: Some custom metrics planned for adult views are absent

Plan mentions:

```text
adult_view_requests_total
guidance_notes_created_total
translation_requests_total
```

Current `metrics.ts` does not define those metrics. This is consistent with adult-view feature absence, but inconsistent with the final plan.

### P2-6: Dev API key fallback authenticates as service, but many routes do not allow service

Evidence:

```text
src/auth/jwt.ts:79 returns role='service' for valid dev API key.
src/auth/roles.ts:6-8 hasRole only checks direct role inclusion.
```

Impact:

The dev API key may authenticate but fail authorization for routes that expect learner, teacher, or admin behavior. That may be acceptable for service-only routes, but it is not equivalent to the original demo API key behavior.

---

## 7. What Is Actually Implemented

This is the fair implementation walkthrough based on current code.

### Application shell

Implemented:

- Fastify app factory.
- Helmet.
- CORS.
- Swagger and Swagger UI.
- Request ID generation.
- Error handler.
- Routes registered for system, conversations, messages, stream, moderation, metrics.

Files:

```text
src/app.ts
src/server.ts
src/middleware/errorHandler.ts
src/middleware/requestContext.ts
src/routes/systemRoutes.ts
```

Status:

Partial because build fails.

### Auth and ownership

Implemented:

- JWT verification with JWKS.
- HS256 dev JWT fallback.
- Dev API key fallback.
- User upsert on authentication.
- Role helpers.
- Conversation access helper that checks learner ownership, parent-child link, teacher session/classroom relationship, and admin.

Files:

```text
src/auth/jwt.ts
src/auth/roles.ts
src/auth/ownership.ts
src/middleware/authMiddleware.ts
src/repositories/userRepository.ts
```

Status:

Partial. The helper exists, but there are no parent/teacher endpoints, and message routes allow adult callers to create learner-role messages.

### Database

Implemented:

- 13 SQL migration files.
- Kysely interface for users, roles, relationships, classrooms, shared sessions, conversations, messages, flags, safety, audit, provider attempts, analytics.
- Core repositories for users, conversations, messages, flags, safety, audit, provider attempts.

Missing:

- Relationship repository.
- Classroom repository.
- Shared session repository.
- Guidance repository.
- Learning objective repository.
- Translation repository.

Status:

Schema scaffold is stronger than service/API implementation.

### Conversation and message API

Implemented:

- Create conversation.
- List conversations for current learner.
- Get conversation by id with messages/flags after `canAccessConversation`.
- Send non-streaming message.
- Send buffered SSE message.

Files:

```text
src/routes/conversationRoutes.ts
src/routes/messageRoutes.ts
src/routes/streamRoutes.ts
src/services/conversationService.ts
src/services/messageService.ts
src/services/streaming/streamMessageService.ts
```

Status:

Partial. There are important authorization and idempotency gaps.

### Safety

Implemented:

- Rule checker.
- Optional LiteLLM/OpenAI-compatible classifier.
- Policy combiner.
- Deflection messages.
- Safety assessment persistence.

Files:

```text
src/services/safety/ruleSafetyChecker.ts
src/services/safety/llmSafetyChecker.ts
src/services/safety/safetyPolicy.ts
src/services/safety/safetyService.ts
src/repositories/safetyRepository.ts
```

Status:

Partial. Core exists, but tests are limited and the suite currently cannot run.

### AI providers

Implemented:

- Mock provider.
- LiteLLM non-streaming and streaming provider methods.
- Bedrock non-streaming and streaming provider methods.
- Provider router with fallback order, timeout wrapper, in-memory circuit breaker, and provider attempt persistence.

Files:

```text
src/services/ai/*
src/repositories/aiProviderAttemptRepository.ts
```

Status:

Partial. Not covered by tests, and streaming provider path is not used by the SSE service.

### Moderation

Implemented:

- List unreviewed flags.
- Get conversation detail by flagged conversation id.
- Review flag.

Files:

```text
src/routes/moderationRoutes.ts
src/services/moderationService.ts
src/repositories/flagRepository.ts
```

Status:

Partial. Teacher access is not scoped to assigned students.

### Observability

Implemented:

- Prometheus registry and metric definitions.
- `/metrics` endpoint.
- Request completion log.

Missing:

- Most metric increments/observations.
- Adult-view metrics.
- Tracing initialization.

Status:

Partial.

---

## 8. Plan Vs Implementation Detail Matrix

| Plan item | Evidence in implementation | Status | Notes |
| --- | --- | --- | --- |
| Fastify app | `src/app.ts` | Partial | Build fails due missing dependency/type package |
| Swagger docs | `src/app.ts` | Partial | Docs route registered, not verified because app does not build |
| Zod config | `src/config/settings.ts` | Partial | Imports missing `dotenv` dependency |
| Kysely + pg | `src/db/kysely.ts`, `src/db/pool.ts` | Partial | Type errors in repositories |
| 13 migrations | `migrations/001` through `013` | Present | Manual SQL tests run migrations directly; npm migrate unverified |
| JWT auth | `src/auth/jwt.ts` | Partial | Not covered by tests |
| Parent role | `roles.ts`, ownership helper | Partial | No parent route/service |
| Teacher role | `roles.ts`, ownership helper | Partial | No teacher route/service |
| Shared sessions | DB table and Kysely types | Partial | No route/service/repository |
| Parent message view | None | Missing | Required by user request |
| Teacher message view | None | Missing | Required by user request |
| Visible guidance | DB table only | Missing at API/service layer | Required by image flow |
| Translation bridge | DB table only | Missing at API/service layer | Required by image flow |
| Learning objectives | DB table only | Missing at API/service layer | Required by image flow |
| Rule safety | `ruleSafetyChecker.ts` | Present | Unit tests exist but cannot run |
| LLM safety | `llmSafetyChecker.ts` | Partial | No tests/mocks |
| Redis rate limit | `limiter.ts`, middleware | Partial | Used on message/moderation only |
| Provider budget | `checkDailyBudget` exists | Missing in routes | Not enforced |
| Provider fallback | `providerRouter.ts` | Present | Untested |
| SSE safety-gated | `streamMessageService.ts` | Partial | Idempotency missing, stream provider path unused |
| Audit events | `auditRepository.ts`, some service calls | Partial | Adult-view/guidance audit impossible until routes exist |
| Metrics | `metrics.ts`, `metricsRoute.ts` | Partial | Metrics not wired |
| Tracing | Dependencies only | Missing | No tracing file/init |
| Testcontainers | `tests/integration/database.test.ts` | Partial | Test runner fails; coverage limited |
| Docker | Dockerfile and compose | Blocked | Build step fails |

---

## 9. Recommended Handoff For Next Agent

The next agent should not start by adding more product features. It should stabilize the build first.

Recommended order:

1. Fix dependency/lockfile mismatch so `npm ci` and `npm run build` work.
2. Add or remove `dotenv` consistently.
3. Fix Kysely timestamp typing errors in repositories.
4. Fix Vitest config so tests start.
5. Add `.gitignore` for `node_modules`, `dist`, coverage, env files.
6. Run unit tests.
7. Run integration tests.
8. Add Fastify route tests for auth and core message flow.
9. Fix adult impersonation risk in message route.
10. Scope moderation endpoints by teacher assignment.
11. Implement parent/teacher/shared-session routes and services.
12. Implement guidance/objective/translation repositories and services.
13. Wire idempotency for message and stream endpoints.
14. Wire metrics and tracing.
15. Update `NODEJS_PORT_PLAN.md` and `walkthrough.md` to distinguish implemented, partial, and planned.

---

## 10. Suggested Status Labels For Existing Docs

The current docs should not say "successfully built" globally. Suggested wording for the next documentation agent:

```text
Implementation status: scaffold in progress.

Built so far:
- Fastify app skeleton
- Core database migrations
- Kysely table types
- JWT/API-key auth scaffold
- Core conversation/message/moderation routes
- Safety checker scaffold
- AI provider adapters
- Buffered SSE scaffold

Not complete yet:
- App does not compile
- Tests do not start
- Parent/teacher/shared-session endpoints are not implemented
- Guidance/objective/translation services are not implemented
- Metrics/tracing are incomplete
- 100k-readiness is unvalidated
```

---

## 11. Final Audit Position

Antigravity produced a meaningful backend scaffold, but the implementation is not ready for live review as a completed system.

The biggest mismatch is this:

```text
The plan and walkthrough claim completion.
The codebase currently cannot build or run tests.
```

For the live review, the honest message should be:

```text
The Node.js rebuild has a strong initial skeleton and database model, including the adult/shared-session schema. The next step is stabilization: make it compile, make tests run, then complete parent/teacher/shared-session behavior and close authorization gaps.
```

