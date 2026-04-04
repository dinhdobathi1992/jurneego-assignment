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

When a learner sends a message, this sequence happens (inside `ConversationService.send_message`):

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
        │    ┌────┴─────┐
        │    │ AI unsafe?│
        │    └────┬─────┘
        │    Yes  │   No
        │         │    ↓
        ↓         ↓   6. Save AI response to DB
   Create Flag    ↓
   Mark conv   Return sanitized response
   flagged
        ↓
   Return safe deflection message
```

---

## Key Design Decisions

### 1. AI Provider Abstraction (Adapter Pattern)
All three AI backends (`Mock`, `Bedrock`, `LiteLLM`) implement a single `AIProvider` abstract class. The rest of the app only calls `generate_response()` — it doesn't know or care which backend is used. Switching providers is a one-line env var change.

**Why**: Isolates the app from vendor-specific SDK changes. Makes testing trivial (Mock provider never calls an external API).

### 2. Two-Layer Safety (Defense in Depth)
- **Layer 1:** Keyword + regex matching — fast, zero cost, catches obvious violations immediately
- **Layer 2:** Optional LLM-based classification (`SAFETY_LLM_CHECK=true`) — catches nuanced manipulation that keywords miss

**Why**: Same principle as network security — multiple layers. Keyword matching runs in microseconds, so it never adds latency. LLM-based safety is opt-in to control cost.

### 3. Safety Checks on AI Output Too
The AI's response is also checked before being returned to the learner. An LLM can still generate inappropriate content even with a good system prompt (jailbreaks, edge cases).

### 4. Synchronous SQLAlchemy
Used sync SQLAlchemy instead of async (`asyncpg`) for clarity and readability.

**Tradeoff**: Under high concurrency, async would perform better. But for a prototype/MVP, the simpler code is more important. Adding async is a straightforward migration.

### 5. UUID Primary Keys
All IDs are UUIDs (strings), not auto-increment integers.

**Why**: Safe to expose in URLs (no sequential guessing), works across distributed systems, and matches production standards.

### 6. Separation: Routes vs Services
Route handlers are intentionally thin — they just validate input and call the service layer. All business logic lives in `ConversationService` and `SafetyService`.

**Why**: Easier to test (services don't need an HTTP client), easier to reason about.

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

A single `send_message` request involves multiple operations. Here's the latency breakdown:

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

**The AI call is 95%+ of total latency.** Database operations are ~10-15ms combined — noise compared to the LLM round-trip.

### Why PostgreSQL Is the Right Choice

I considered in-memory storage (Python dicts) to reduce complexity. Here's why I kept Postgres:

| Concern | In-Memory | PostgreSQL |
|---------|-----------|------------|
| **Moderation queries** | Would need custom indexing logic for "list flagged conversations" | `WHERE is_flagged = TRUE` with index — instant |
| **Conversation history** | Lost on restart — multi-turn AI conversations break | Persistent across restarts and deploys |
| **Data integrity** | No FK constraints, no cascade deletes | Referential integrity enforced by the engine |
| **DevOps demonstration** | Single container, no orchestration to show | Health checks, volume mounts, service dependencies, connection pooling |
| **Production path** | Would need to be entirely rewritten | Swap Docker Postgres for RDS — zero code change |

For an assignment focused on DevOps, a real database dependency demonstrates infrastructure thinking that in-memory storage does not.

### What to Optimize (If Performance Were Critical)

1. **Eager-load conversation history** — The `messages` relationship uses lazy loading (default), which triggers a separate `SELECT` when building AI context. Adding `lazy="selectin"` would batch this into the initial conversation query.

2. **Cap history sent to AI** — Currently all messages are sent. A 20-message sliding window would bound the AI payload size and reduce token cost without affecting conversation quality.

3. **Async SQLAlchemy** — Under high concurrency (100+ simultaneous learners), sync DB calls block the event loop. Migrating to `asyncpg` + `AsyncSession` would let FastAPI handle more concurrent requests on the same hardware.

4. **Connection pooling tuning** — Current config: `pool_size=5, max_overflow=10`. For production with HPA scaling to N pods, each pod opens up to 15 connections. At 10 pods = 150 connections → requires PgBouncer or RDS Proxy to multiplex.

5. **Response streaming (SSE)** — The learner waits 1-3 seconds for the full AI response. Streaming via Server-Sent Events would show tokens as they arrive, improving perceived performance dramatically even though actual latency is the same.

### What NOT to Optimize

- **DB writes for every message** — At ~2ms per INSERT, this is not a bottleneck. The persistence is worth it for moderation, audit, and multi-turn context. Removing writes would save <5ms on a 500-3000ms request.
- **Safety check performance** — Keyword matching runs in microseconds. Even the regex patterns (phone, email, address) are sub-millisecond. This is already as fast as it can be.

---

## What I Intentionally Did Not Build

| Feature | Reason omitted |
|---------|---------------|
| **Authentication / JWT** | Out of scope for the prototype; noted as top production priority |
| **Rate limiting** | No framework for it in the MVP; would use slowapi or API Gateway |
| **Streaming responses** | Would use Server-Sent Events (SSE); adds complexity without changing the core design |
| **Alembic migrations** | Tables are created via `create_all()` at startup; Alembic is set up and ready but migrations weren't the focus |
| **Frontend UI** | Assignment says "API-only is acceptable if README and demo instructions are clear" |
| **Real-time notifications** | Teachers don't get push alerts for new flags; they poll the moderation endpoint |

---

## Evolving to Production

### Compute
| Now | Production |
|-----|-----------|
| `docker compose up` | EKS (Kubernetes) — I've managed 40+ clusters at GFT Group |
| No scaling | HPA on API pods; Karpenter for node autoscaling (achieved 30% EC2 cost reduction) |

### Database
| Now | Production |
|-----|-----------|
| Postgres in Docker | Amazon RDS PostgreSQL (Multi-AZ for HA) |
| No connection pooling tuning | PgBouncer sidecar or RDS Proxy |

### Secrets
| Now | Production |
|-----|-----------|
| `.env` file | AWS Secrets Manager + External Secrets Operator (syncs to K8s Secrets) |

### CI/CD
| Now | Production |
|-----|-----------|
| GHA → Docker build | GHA → ECR push → ArgoCD sync → EKS rolling deploy |
| No image promotion | Image promotion: dev → staging → prod with approval gate |
| No rollback mechanism | ArgoCD one-click rollback to previous Git commit |

### AI / Model Access
| Now | Production |
|-----|-----------|
| Bedrock called over internet | Bedrock via VPC endpoint (no traffic leaves AWS network) |
| Model hardcoded in env | Model config stored in AWS AppConfig (hot-reload without restart) |

### Observability
| Now | Production |
|-----|-----------|
| Python `logging` to stdout | Structured JSON logs → CloudWatch Logs |
| No metrics | Prometheus metrics endpoint → Grafana dashboards |
| No tracing | AWS X-Ray or OpenTelemetry for request tracing |
| No alerting | CloudWatch Alarms → SNS → Slack (`#infra-alerts`) |

### Security
| Enhancement | Why |
|-------------|-----|
| WAF in front of ALB | Blocks common web attacks and bot traffic |
| JWT authentication | Each learner and teacher has an authenticated session |
| Audit log table | Immutable record of all safety decisions for compliance |
| Secrets rotation | Automatic rotation of DB credentials and API keys |

### Why Kubernetes (EKS) Over Simpler Alternatives

| Option | Why Not |
|--------|---------|
| **AWS App Runner** | Great for simple stateless APIs, but no fine-grained networking control, no sidecar pattern (needed for PgBouncer, log shippers), limited egress control for Bedrock VPC endpoints |
| **AWS ECS (Fargate)** | Lower ops burden than EKS, but weaker ecosystem — no ArgoCD-native GitOps, no Karpenter for smart node provisioning, harder to run operator-based tooling (External Secrets Operator, KEDA) |
| **AWS Lambda** | Attractive for cost at low traffic, but cold starts add 500–2000ms to an AI response that is already slow. SQLAlchemy connection pooling also breaks under Lambda's ephemeral execution model |
| **EKS (chosen)** | Full control over networking, scheduling, and sidecars. ArgoCD GitOps gives one-click rollback. Karpenter cuts node cost. Horizontal Pod Autoscaler handles traffic spikes. Proven at scale — I've run 40+ EKS clusters across production environments |

**Honest tradeoffs of choosing EKS:**
- Higher operational complexity (control plane upgrades, node group management, IAM for service accounts)
- Steeper learning curve for a small team with no prior K8s experience
- Overkill for the prototype stage — ECS Fargate would be the right call until the team has 3+ engineers and stable traffic patterns

**When I would switch from ECS to EKS:** when the team needs multi-tenant workload isolation, GPU nodes for fine-tuning safety models, or more than ~5 distinct services that need independent scaling policies.

