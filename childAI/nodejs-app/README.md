# ChildAI Node.js Backend

Production-minded Node.js/TypeScript backend for a child-safe AI learning assistant.

## Quick Start

```bash
# 1. Copy environment config
cp .env.example .env

# 2. Start everything with Docker
docker compose up --build

# 3. Run migrations
docker compose exec api npm run migrate

# Visit:
# API docs:  http://localhost:8000/docs
# Health:    http://localhost:8000/health
# Ready:     http://localhost:8000/ready
# Metrics:   http://localhost:8000/metrics
```

## Local Development (without Docker)

```bash
npm install

# Requires: PostgreSQL and Redis running locally
# Update DATABASE_URL and REDIS_URL in .env

npm run migrate   # Run all 13 migrations
npm run dev       # Start with hot reload
npm run test      # Run tests (requires Docker for Testcontainers)
npm run typecheck # TypeScript type check
```

## Environment Variables

Copy `.env.example` to `.env`. Key variables:

| Variable | Default | Description |
|---|---|---|
| `APP_PORT` | `8000` | HTTP port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `REDIS_URL` | — | Redis connection string |
| `AUTH_MODE` | `jwt` | `jwt` or `apikey` (dev only) |
| `DEV_JWT_SECRET` | — | 32+ char secret for dev JWT (HS256) |
| `DEV_API_KEY` | — | Dev-only API key fallback |
| `AI_PROVIDER_ORDER` | `mock` | Comma-separated: `mock,litellm,bedrock` |
| `LITELLM_API_BASE` | — | LiteLLM proxy URL |
| `SAFETY_ENABLED` | `true` | Enable/disable safety checks |
| `SAFETY_LLM_CHECK` | `false` | Enable LLM-based safety classifier |

## LiteLLM Profile

```bash
docker compose --profile litellm up
```

## Architecture

```
Client → Fastify Route → Auth Middleware → Rate Limit → Service → Safety → Repository → AI Provider → Audit → Response
```

| Layer | Location |
|---|---|
| Routes | `src/routes/` |
| Auth middleware | `src/middleware/authMiddleware.ts` |
| Rate limiter | `src/services/rateLimit/` |
| Safety service | `src/services/safety/` |
| AI providers | `src/services/ai/` |
| Repositories | `src/repositories/` |
| Audit | `src/services/audit/` |
| Observability | `src/services/observability/` |

## Key Design Decisions

1. **Fastify** over Express — faster schema validation, native OpenAPI
2. **Kysely + pg** — type-safe SQL with no ORM overhead
3. **JWT via JWKS** — production-ready; HS256 dev fallback for local testing
4. **Safety-gated SSE** — AI response is buffered server-side and safety-checked before streaming chunks to the child
5. **Short transactions** — AI calls happen outside DB transactions to prevent lock contention
6. **Provider circuit breaker** — in-memory circuit breaker with 30s reset, fallback across providers
7. **Append-only audit** — audit_events table never deleted, IP/user-agent hashed before storage

## Running Tests

```bash
# Unit tests (no infrastructure needed)
npx vitest run tests/unit/

# Integration tests (requires Docker for Testcontainers)
npx vitest run tests/integration/
```
