# Node.js Backend — Walkthrough

## What Was Built

A complete **production-minded Node.js/TypeScript backend** for the ChildAI service in `childAI/nodejs-app/`, implementing all 13 phases of [NODEJS_PORT_PLAN.md](file:///Users/thi/Devops/JurneeGo_Assignment/childAI/NODEJS_PORT_PLAN.md).

---

## Phase Summary

| Phase | Files | Status |
|---|---|---|
| 1: Fastify Skeleton | [src/app.ts](file:///Users/thi/Devops/JurneeGo_Assignment/childAI/nodejs-app/src/app.ts), [src/server.ts](file:///Users/thi/Devops/JurneeGo_Assignment/childAI/nodejs-app/src/server.ts), system routes, error handler | ✅ |
| 2: Config Validation | [src/config/settings.ts](file:///Users/thi/Devops/JurneeGo_Assignment/childAI/nodejs-app/src/config/settings.ts) (Zod), [.env.example](file:///Users/thi/Devops/JurneeGo_Assignment/childAI/nodejs-app/.env.example) | ✅ |
| 3: DB Migrations + Repos | 13 SQL migrations, Kysely types (19 tables), 7 repos | ✅ |
| 4: JWT Auth | [src/auth/jwt.ts](file:///Users/thi/Devops/JurneeGo_Assignment/childAI/nodejs-app/src/auth/jwt.ts), [roles.ts](file:///Users/thi/Devops/JurneeGo_Assignment/childAI/nodejs-app/src/auth/roles.ts), [ownership.ts](file:///Users/thi/Devops/JurneeGo_Assignment/childAI/nodejs-app/src/auth/ownership.ts), [authMiddleware.ts](file:///Users/thi/Devops/JurneeGo_Assignment/childAI/nodejs-app/src/middleware/authMiddleware.ts) | ✅ |
| 5: Rate Limiting | Redis sliding-window limiter, quota policies, pre-handler | ✅ |
| 6: Safety System | Rule checker, LLM classifier, policy combiner, orchestrator | ✅ |
| 7: AI Providers | Mock, LiteLLM, Bedrock providers + circuit-breaker router | ✅ |
| 8: Conv/Msg Services | Full non-streaming message flow + routes | ✅ |
| 9: SSE Streaming | Buffered safety-gated SSE with backpressure + abort | ✅ |
| 10: Moderation | Flag review service + moderation routes | ✅ |
| 11: Observability | Prometheus metrics (prom-client), `/metrics` endpoint | ✅ |
| 12: Tests | Unit tests (safety, roles), Testcontainers integration tests | ✅ |
| 13: Docker | Multi-stage Dockerfile, docker-compose.yml | ✅ |

---

## Key Files

```
nodejs-app/
├── src/
│   ├── app.ts                        ← Fastify factory, all routes registered
│   ├── server.ts                     ← Graceful shutdown entry point
│   ├── config/settings.ts            ← Zod validated startup config
│   ├── auth/
│   │   ├── jwt.ts                    ← JWKS + HS256 dev fallback
│   │   ├── roles.ts                  ← Role hierarchy helpers
│   │   └── ownership.ts              ← Conversation/parent/teacher access checks
│   ├── middleware/
│   │   ├── authMiddleware.ts         ← authenticate + requireRole pre-handlers
│   │   └── rateLimitMiddleware.ts    ← Redis rate limit pre-handler factory
│   ├── db/
│   │   ├── kysely.ts                 ← TypeScript types for 19 tables
│   │   ├── pool.ts / redis.ts        ← Connection singletons
│   │   └── transaction.ts            ← Transaction helper
│   ├── repositories/                 ← All 7 repository files
│   ├── services/
│   │   ├── safety/                   ← rule/LLM/policy/orchestrator
│   │   ├── ai/                       ← mock/litellm/bedrock/router/fallbacks
│   │   ├── rateLimit/                ← limiter + quota policies
│   │   ├── streaming/                ← SSEWriter + streamMessageService
│   │   ├── observability/            ← Prometheus metrics + route
│   │   └── audit/                    ← Audit service
│   └── routes/                       ← conversations/messages/stream/moderation
├── migrations/                       ← 001–013 SQL files
├── prompts/                          ← child_safe_system_prompt + classifier
├── tests/
│   ├── unit/safety.test.ts + roles.test.ts
│   └── integration/database.test.ts  ← Testcontainers PostgreSQL
├── Dockerfile                        ← Multi-stage, non-root user
├── docker-compose.yml                ← API + Postgres + Redis + optional LiteLLM
└── README.md
```

---

## Non-Streaming Message Flow (§13.1)

```
POST /api/conversations/:id/messages
  → authenticate → rateLimitFor('message')
  → save learner message
  → input safety check (rule + optional LLM)
  → if unsafe: flag + deflect
  → call AI (outside transaction, with fallback)
  → output safety check
  → save assistant message
  → createAuditEvent
  → return { learner_message, assistant_message, was_flagged }
```

## SSE Streaming Flow (§13.2 buffered safety-gated)

```
POST /api/conversations/:id/messages/stream
  → message.accepted → safety.checked
  → AI buffered server-side → output safety check
  → stream approved content as assistant.chunk events
  → assistant.completed → done
  Heartbeat every 15s, AbortController on disconnect
```

---

## How to Run

```bash
cd childAI/nodejs-app
cp .env.example .env
docker compose up --build
docker compose exec api npm run migrate
# → http://localhost:8000/docs
```

---

## Anti Markers in Plan

Progress markers (`#####Anti######` ... `######Anti#####`) added to all major sections of [NODEJS_PORT_PLAN.md](file:///Users/thi/Devops/JurneeGo_Assignment/childAI/NODEJS_PORT_PLAN.md):
- §1 Current app summary
- §3 Gap analysis
- §4 Tech stack
- §5 Folder structure
- §7 API contract
- §8 Auth & authorization
- §9 Database schema
- §10 Safety system
- §11 AI provider plan
- §12 SSE streaming plan
