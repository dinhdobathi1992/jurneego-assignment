# Tradeoffs — JurneeGo Safe AI Learning Assistant

## Remaining Risks

### 🔴 High Priority

| Risk | Description | Impact |
|------|-------------|--------|
| **Shared API key, not per-user auth** | All callers share the same `X-API-Key`. `learner_id` is still a free string — any valid key holder can read or write any conversation. | A malicious actor with a valid key could impersonate any learner. Mitigated for now (unauthenticated access is blocked); full fix requires JWT with per-user claims. |
| **Keyword safety misses nuance** | A determined user can rephrase harmful requests to bypass keyword lists. | Safety failures in the highest-stakes scenario (child safety). |
| **No rate limiting** | No limit on how many messages a learner can send per minute. | A single client could exhaust AI provider quotas or overwhelm the database. |
| **AI provider single point of failure** | If Bedrock or LiteLLM is down, all conversations fail (returns fallback text only). | Poor user experience; no automatic failover to a secondary provider. |

### 🟡 Medium Priority

| Risk | Description | Impact |
|------|-------------|--------|
| **Secrets in `.env` file** | In production, `.env` files on disk are a credential exposure risk. | Should be replaced with AWS Secrets Manager before any real deployment. |
| **No audit logging** | Safety decisions are stored in the `flags` table, but there's no immutable audit trail for compliance (e.g., "who reviewed flag X and when?"). | Compliance and legal risk for a product targeting children. |
| **SQLite in tests ≠ Postgres in prod** | Tests use in-memory SQLite; some Postgres-specific behaviours (JSON columns, full-text search, enum handling) won't be caught by tests. | Bugs that only surface in production. |
| **No input length validation at the DB layer** | Pydantic enforces `max_length=5000` on message content, but there's no DB-level constraint. | If Pydantic is bypassed, very long messages could be written to the DB. |

### 🟢 Low Priority / Known Limitations

| Risk | Description |
|------|-------------|
| **No conversation title auto-generation** | Title is optional and free-text. A nice feature would be to auto-generate a title from the first message using the AI. |
| **No pagination cursor** | Pagination uses offset/limit which is fine for small datasets but slow for large ones. Cursor-based pagination would be needed at scale. |
| **Static keyword lists** | Safety keyword lists are hardcoded in `safety_service.py`. In production these should be in a database or config file and updatable without a code deployment. |

---

## Intentional Shortcuts

### ✂️ What I skipped and why

**1. Alembic migrations not wired end-to-end**
`alembic.ini` is set up and the library is installed, but the app currently runs `Base.metadata.create_all()` at startup instead of running migration scripts. This is fine for a prototype where schema is still evolving, but must be replaced before production.

*Why I skipped it:* The schema was changing rapidly during development, and maintaining a chain of migration files while iterating would have slowed me down without adding value to the demo.

**2. API key auth, not per-user JWT**
The API requires an `X-API-Key` header — unauthenticated access is blocked. However, all callers share the same key; `learner_id` is still a plain string. Real per-user auth would require a login flow, JWT issuance, and token validation on every request.

*Why I stopped here:* Per-user JWT authentication is a separate system (AWS Cognito or Auth0). Building a toy auth system would be thrown away when integrated with a real IdP. The API key provides a meaningful security boundary for the demo and keeps the API from being publicly open.

**3. No response streaming**
The API returns the complete AI response in a single HTTP response. Production should use Server-Sent Events (SSE) or WebSockets so the learner sees words appear as the AI generates them.

*Why I skipped it:* SSE adds significant complexity to both the backend (generator functions, connection management) and the client. The assignment is API-focused and doesn't require a frontend.

**4. LLM-based safety check disabled by default**
`SAFETY_LLM_CHECK=false` — the second safety layer (sending the message to an LLM for classification) is implemented but off.

*Why I skipped it:* It doubles the cost per message and adds latency. For a demo with mock AI, enabling it would just add a second mock API call. The architecture is there to enable it in production where it matters.

---

## Next Engineering Priorities

If this moves forward, I'd tackle these in order:

### Week 1
1. **JWT authentication via AWS Cognito** — API key auth is in; replace shared key with per-user JWTs from Cognito user pools, extract `learner_id` from token claims
2. **Rate limiting** — add `slowapi` middleware, 10 messages/minute per learner, 100/minute per IP

### Week 2
3. **Alembic migrations** — replace `create_all()` with proper migration chain, add CI step to run migrations against a test database
4. **Proper secrets management** — move all credentials to AWS Secrets Manager, use External Secrets Operator in K8s to sync to pod environment
5. **Structured JSON logging** — replace `logging.basicConfig` with `structlog` or a JSON formatter so logs are queryable in CloudWatch

### Week 3
6. **SSE streaming** — refactor `send_message` endpoint to use `StreamingResponse` with Server-Sent Events
7. **Enhanced safety model** — add AWS Comprehend or a fine-tuned classifier as a second-layer check (beyond keyword lists), with confidence scores
8. **Teacher dashboard UI** — minimal Next.js app for reviewing flagged conversations (the API is already ready for it)

### Week 4 (Production Hardening)
9. **EKS deployment** — Helm charts, HPA, Karpenter node autoscaling, and ArgoCD GitOps
10. **Observability** — Prometheus metrics (`/metrics` endpoint), Grafana dashboard, CloudWatch alarms for safety flag rate spikes
11. **Load testing** — Locust or k6 tests to validate the service under 100+ concurrent learners
