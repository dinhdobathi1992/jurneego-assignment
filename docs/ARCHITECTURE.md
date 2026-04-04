# Architecture — JurneeGo Safe AI Learning Assistant

## System Overview

A REST API service built with Python (FastAPI) that supports child-safe AI-assisted learning conversations. Every message passes through a safety layer before and after reaching the AI. Flagged interactions are stored for teacher/admin review.

---

## Component Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                    CLIENT                                     │
│          (Swagger UI / curl / future frontend)                │
└──────────────────┬───────────────────────────────────────────┘
                   │ HTTP REST
                   ▼
┌──────────────────────────────────────────────────────────────┐
│              FastAPI Application (app/main.py)                │
│                                                               │
│  ┌─────────────────┐ ┌──────────────┐ ┌──────────────────┐  │
│  │  Conversations  │ │   Messages   │ │   Moderation     │  │
│  │  Router         │ │   Router     │ │   Router         │  │
│  └────────┬────────┘ └──────┬───────┘ └────────┬─────────┘  │
│           └─────────────────┼──────────────────┘             │
│                             │                                 │
│                             ▼                                 │
│              ┌──────────────────────────┐                    │
│              │   ConversationService    │ ← business logic   │
│              └──────┬───────────────────┘                    │
│                     │                                         │
│           ┌─────────┴──────────┐                             │
│           ▼                    ▼                             │
│  ┌────────────────┐  ┌─────────────────────────────────┐    │
│  │ SafetyService  │  │ AIProvider (interface)           │    │
│  │                │  │  ┌──────┐ ┌─────────┐ ┌───────┐ │    │
│  │ - keyword scan │  │  │ Mock │ │ Bedrock │ │LiteLLM│ │    │
│  │ - regex (PII)  │  │  └──────┘ └─────────┘ └───────┘ │    │
│  └────────────────┘  └─────────────────────────────────┘    │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ PostgreSQL  (conversations · messages · flags)        │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

---

## Core Message Flow

When a learner sends a message, this sequence happens inside `ConversationService.send_message`:

```
1. Learner sends message
        ↓
2. Save learner message to DB
        ↓
3. SafetyService.check_message(learner_text)
        ↓
   ┌────┴─────┐
   │ Unsafe?  │
   └────┬─────┘
   Yes  │   No
        │    ↓
        │   4. AIProvider.generate_response(history)
        │         ↓
        │   5. SafetyService.check_message(ai_response)
        │         ↓
        │    ┌────┴──────┐
        │    │ AI unsafe? │
        │    └────┬──────┘
        │    Yes  │   No
        │         │    ↓
        ↓         ↓   6. Save AI response to DB
   Create Flag    ↓
   Mark conv   Return response
   flagged
        ↓
   Return safe deflection message
```

---

## Key Design Decisions

### AI Provider Abstraction (Adapter Pattern)

All three AI backends (`Mock`, `Bedrock`, `LiteLLM`) implement a single `AIProvider` abstract class. The rest of the app only calls `generate_response()` and doesn't know which backend is active. Switching providers is a one-line env var change with no code changes.

This also makes testing straightforward — the Mock provider never calls an external API, so tests run fast and offline.

### Two-Layer Safety

- **Layer 1:** Keyword + regex matching — runs in microseconds, zero cost, catches obvious violations
- **Layer 2:** Optional LLM-based classification (`SAFETY_LLM_CHECK=true`) — catches nuanced manipulation that keywords miss

Layer 1 always runs. Layer 2 is opt-in to keep costs predictable. The same safety pipeline runs on both the learner's input and the AI's output — an LLM can still produce harmful content even with a careful system prompt.

### Synchronous SQLAlchemy

Sync SQLAlchemy was chosen over async (`asyncpg`) for simplicity. The AI provider call (500–3000ms) dominates latency so heavily that async DB wouldn't change perceived performance at this scale. It's a straightforward migration when needed.

### UUID Primary Keys

All IDs are UUIDs rather than auto-increment integers — safe to expose in URLs (no sequential enumeration), compatible with distributed ID generation.

### Thin Routes, Fat Services

Route handlers validate input and call services — that's it. All business logic lives in `ConversationService` and `SafetyService`. Services are independently testable without an HTTP client.

---

## Data Model

```
conversations
  id (UUID PK) · learner_id · title · is_flagged · created_at · updated_at

messages
  id (UUID PK) · conversation_id (FK) · role (learner/assistant)
  content · is_safe · safety_score · created_at

flags
  id (UUID PK) · conversation_id (FK) · message_id (FK)
  flag_type (self_harm/sexual/contact_info/manipulation)
  reason · severity (low/medium/high)
  reviewed · reviewer_notes · created_at · reviewed_at
```

`is_flagged` on `conversations` is denormalized — it duplicates the presence of a flag record, but allows fast "list all flagged conversations" queries without a JOIN.

---

## Performance Analysis

### Where Latency Actually Lives

```
Operation                      Latency (typical)    % of total
─────────────────────────────────────────────────────────────
AI provider call (Bedrock)     500–3000 ms          ~95%
DB: SELECT conversation          1–3 ms              <1%
DB: INSERT learner message        1–2 ms              <1%
DB: SELECT messages (history)     2–5 ms              <1%
Safety check (keyword/regex)     <0.1 ms              <1%
DB: INSERT assistant message      1–2 ms              <1%
DB: COMMIT + REFRESH              2–5 ms              <1%
─────────────────────────────────────────────────────────────
Total (safe path)             ~510–3020 ms
```

The AI call is 95%+ of total latency. Database operations combined are ~10–15ms.

### Why PostgreSQL Over In-Memory Storage

| Concern | In-Memory | PostgreSQL |
|---------|-----------|------------|
| **Moderation queries** | Custom indexing logic for "list flagged conversations" | `WHERE is_flagged = TRUE` with index |
| **Conversation history** | Lost on restart — multi-turn context breaks | Persistent across restarts and deploys |
| **Data integrity** | No FK constraints or cascade deletes | Enforced by the engine |
| **Production path** | Would need a full rewrite | Swap Docker Postgres for RDS, zero code change |

For an assignment focused on DevOps, a real database dependency demonstrates infrastructure thinking that in-memory storage does not.

### Performance Improvements Worth Making

1. **Eager-load conversation history** — The `messages` relationship uses lazy loading, triggering a separate `SELECT` when building AI context. `lazy="selectin"` batches this into the initial conversation query.
2. **Cap history sent to AI** — A sliding window bounds the AI payload size and reduces token cost.
3. **Async SQLAlchemy** — Under high concurrency, sync DB calls block the event loop. `asyncpg` + `AsyncSession` handles more concurrent requests on the same hardware.
4. **Connection pooling** — Current config `pool_size=5, max_overflow=10`. At scale with multiple pods, PgBouncer or RDS Proxy is needed.
5. **SSE streaming** — The learner waits 1–3 seconds for the full response. Streaming via Server-Sent Events improves perceived performance without changing actual latency.

---

## What Was Intentionally Not Built

| Feature | Reason |
|---------|--------|
| Authentication / JWT | Out of scope for the prototype; top production priority |
| Rate limiting | Would use `slowapi` or API Gateway; not needed for the demo |
| Streaming responses | SSE adds backend and client complexity without changing the core design |
| Alembic migrations | Tables created via `create_all()` at startup; Alembic is installed but not wired |
| Frontend UI | Assignment states API-only is acceptable with clear demo instructions |
| Real-time flag notifications | Teachers poll the moderation endpoint |

---

## Evolving to Production

### Compute

| Now | Production |
|-----|-----------|
| `docker compose up` | EKS (Kubernetes) |
| No scaling | HPA on API pods; Karpenter for node autoscaling |

### Database

| Now | Production |
|-----|-----------|
| Postgres in Docker | Amazon RDS PostgreSQL (Multi-AZ) |
| Default connection pool | PgBouncer sidecar or RDS Proxy |

### Secrets

| Now | Production |
|-----|-----------|
| `.env` file | AWS Secrets Manager + External Secrets Operator |

### CI/CD

| Now | Production |
|-----|-----------|
| GHA → Docker build | GHA → ECR push → ArgoCD sync → EKS rolling deploy |
| No image promotion | Image promotion: dev → staging → prod with approval gate |
| No rollback | ArgoCD rollback to previous Git commit |

### AI / Model Access

| Now | Production |
|-----|-----------|
| Bedrock over public internet | Bedrock via VPC endpoint |
| Model hardcoded in env | Model config in AWS AppConfig for hot-reload |

### Observability

| Now | Production |
|-----|-----------|
| Python `logging` to stdout | Structured JSON logs → CloudWatch Logs |
| No metrics | Prometheus endpoint → Grafana |
| No tracing | AWS X-Ray or OpenTelemetry |
| No alerting | CloudWatch Alarms → SNS → Slack |

### Security

| Enhancement | Reason |
|-------------|--------|
| WAF in front of ALB | Block common web attacks and bot traffic |
| JWT authentication | Verified learner and teacher sessions |
| Audit log table | Immutable record of safety decisions for compliance |
| Secrets rotation | Automatic rotation of DB credentials and API keys |

### Why Kubernetes (EKS) Over Simpler Alternatives

| Option | Consideration |
|--------|---------------|
| **AWS App Runner** | Simple for stateless APIs, but no sidecar support (PgBouncer, log shippers), limited egress control for Bedrock VPC endpoints |
| **AWS ECS (Fargate)** | Lower ops burden, but no ArgoCD-native GitOps, no Karpenter, harder to run operator-based tooling (External Secrets Operator, KEDA) |
| **AWS Lambda** | Cold starts add 500–2000ms to an already-slow AI response; SQLAlchemy connection pooling doesn't fit the ephemeral execution model |
| **EKS** | Full control over networking, scheduling, and sidecars; ArgoCD enables clean rollbacks; HPA handles traffic spikes |

Tradeoffs of EKS: higher operational complexity (control plane upgrades, IAM for service accounts, node group management), and overkill for a small team in early stages. ECS Fargate is the more pragmatic starting point — the switch to EKS makes sense when multi-tenant isolation, GPU nodes for model fine-tuning, or complex multi-service scaling is needed.
