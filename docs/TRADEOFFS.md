# Tradeoffs — JurneeGo Safe AI Learning Assistant

## Remaining Risks

**No authentication**
`learner_id` is a free string passed by any client. Anyone can impersonate any learner or read another learner's conversation history. This is the most critical gap before any real deployment.

**Keyword safety misses nuance**
A determined user can rephrase harmful requests to bypass keyword lists. The second safety layer (LLM-based classification) exists but is off by default. For a product targeting children, this is the highest-stakes gap in the current design.

**No rate limiting**
A single client can send unlimited messages per minute, exhausting AI provider quotas or flooding the database. `slowapi` middleware would add this in a few lines.

**AI provider is a single point of failure**
If Bedrock or LiteLLM is unavailable, all message requests fail. There's no automatic fallover to a secondary provider.

**Secrets in `.env`**
Fine for local development, but not acceptable in production. AWS Secrets Manager + External Secrets Operator is the target.

**No audit trail**
Safety decisions are stored in the `flags` table, but there's no immutable log of who reviewed what and when. For a product dealing with child safety this is a compliance risk.

**SQLite in tests vs Postgres in production**
Tests use in-memory SQLite. Some Postgres-specific behaviors (enum handling, JSON columns, full-text search) won't be caught until production.

---

## Intentional Shortcuts

**`create_all()` instead of Alembic migrations**
The schema was evolving during development. Alembic is installed and configured, but the app currently creates tables at startup. This needs to be replaced with a proper migration chain before any deployment with real data.

**No JWT / session management**
The API accepts `learner_id` as a plain string. Real auth would require a login flow, token issuance, and validation on every request — that's a full integration with an external IdP (Cognito, Auth0), not something worth building as a toy for this prototype.

**No response streaming**
The API returns the complete AI response in a single HTTP response. Server-Sent Events would improve perceived performance, but adds meaningful complexity to both the backend and the client. The core design doesn't change.

**LLM-based safety check disabled by default**
`SAFETY_LLM_CHECK=false`. The second safety layer is implemented but off. Enabling it doubles the cost per message and adds latency — for a demo with mock AI it adds no value. The architecture supports enabling it when it matters.

---

## Next Engineering Priorities

1. JWT authentication — `learner_id` needs to come from a verified token, not a free-form string
2. Rate limiting — per-learner message limits to prevent quota exhaustion
3. Alembic migrations — replace `create_all()` with a proper migration chain
4. Secrets management — move credentials to AWS Secrets Manager
5. Structured logging — replace `logging.basicConfig` with JSON-formatted logs for CloudWatch
6. SSE streaming — `StreamingResponse` so the learner sees tokens as they arrive
7. Enhanced safety layer — AWS Comprehend or a fine-tuned classifier as a second-layer check with confidence scores
8. EKS deployment — Helm charts, HPA, ArgoCD GitOps, Karpenter
9. Observability — Prometheus metrics, Grafana dashboards, CloudWatch alarms on safety flag rate spikes
