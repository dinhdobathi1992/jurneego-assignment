# JurneeGo — Safe AI Learning Assistant

A child-safe AI learning assistant API. Learners chat with an AI, every message is safety-checked in both directions, and flagged conversations are reviewable by teachers or admins.

**Live demo:** https://jurnee-ai.dinhdobathi.com/docs
**API base:** `https://jurnee-ai.dinhdobathi.com`
**Demo API key:** `jurnee-demo-key-2024`

---

## Quick Start (2 minutes)

```bash
# 1. Clone & enter the project
git clone https://github.com/dinhdobathi1992/jurneego-assignment.git
cd jurneego-assignment

# 2. Copy the env file
cp .env.example .env

# 3. Start everything (API + PostgreSQL)
docker compose up --build

# 4. Open the auto-generated API docs
open http://localhost:8000/docs
```

The Swagger UI lets you call every endpoint interactively.

---

## Authentication

All `/api/*` endpoints require an `X-API-Key` header. The `/health` endpoint is public.

```bash
# Without key → 401
curl https://jurnee-ai.dinhdobathi.com/api/conversations

# With key → 200
curl https://jurnee-ai.dinhdobathi.com/api/conversations \
  -H "X-API-Key: jurnee-demo-key-2024"
```

Configure valid keys via the `API_KEYS` env var (comma-separated):

```
API_KEYS=key-one,key-two,key-three
```

---

## API Endpoints

The live API is at `https://jurnee-ai.dinhdobathi.com`. Replace with `http://localhost:8000` for local dev. All requests must include `-H "X-API-Key: <your-key>"`.

### Core Flow

```bash
# 1. Create a conversation
curl -X POST https://jurnee-ai.dinhdobathi.com/api/conversations \
  -H "Content-Type: application/json" \
  -H "X-API-Key: jurnee-demo-key-2024" \
  -d '{"learner_id": "student-alice", "title": "Math Help"}'

# Capture the id from the response
CONV_ID="<id from response>"

# 2. Send a safe message — get a real AI response
curl -X POST "https://jurnee-ai.dinhdobathi.com/api/conversations/$CONV_ID/messages" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: jurnee-demo-key-2024" \
  -d '{"content": "Can you explain what a fraction is?"}'
# → was_flagged: false, AI responds in a child-friendly way

# 3. Send an unsafe message — flagged, safe deflection returned (no AI call made)
curl -X POST "https://jurnee-ai.dinhdobathi.com/api/conversations/$CONV_ID/messages" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: jurnee-demo-key-2024" \
  -d '{"content": "I want to hurt myself"}'
# → was_flagged: true, flag_reason: "Self-harm related content detected"
#   child-friendly deflection message returned instead of an AI response
```

### Moderation (Teacher / Admin)

```bash
# List all flagged conversations
curl https://jurnee-ai.dinhdobathi.com/api/moderation/flagged \
  -H "X-API-Key: jurnee-demo-key-2024"

# Get a flagged conversation with flag details
curl "https://jurnee-ai.dinhdobathi.com/api/moderation/flagged/$CONV_ID" \
  -H "X-API-Key: jurnee-demo-key-2024"

# Mark a flag as reviewed
curl -X PATCH "https://jurnee-ai.dinhdobathi.com/api/moderation/flags/$FLAG_ID/review" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: jurnee-demo-key-2024" \
  -d '{"reviewer_notes": "Reviewed — student was upset, counselor notified."}'
```

### Other

```bash
# Health check (no auth required)
curl https://jurnee-ai.dinhdobathi.com/health

# List all conversations (paginated)
curl "https://jurnee-ai.dinhdobathi.com/api/conversations?page=1&page_size=20" \
  -H "X-API-Key: jurnee-demo-key-2024"
```

---

## AI Providers

Switch the AI backend by changing `AI_PROVIDER` in `.env`:

| Value | Description | When to use |
|-------|-------------|-------------|
| `mock` | Returns canned responses | Local dev, CI, no API key needed |
| `bedrock` | AWS Bedrock (Claude Haiku) | Real AI, requires AWS credentials |
| `litellm` | LiteLLM proxy | Flexible, supports 100+ models |

```bash
# Start with LiteLLM proxy included
docker compose --profile litellm up --build
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://jurnee:jurnee_secret@db:5432/jurnee_ai` | PostgreSQL connection string |
| `API_KEYS` | `jurnee-demo-key-change-me` | Comma-separated list of valid API keys |
| `AI_PROVIDER` | `mock` | `mock`, `bedrock`, or `litellm` |
| `AWS_REGION` | `us-east-1` | AWS region for Bedrock |
| `AWS_ACCESS_KEY_ID` | — | AWS credentials (Bedrock) |
| `AWS_SECRET_ACCESS_KEY` | — | AWS credentials (Bedrock) |
| `BEDROCK_MODEL_ID` | `anthropic.claude-3-haiku-20240307-v1:0` | Bedrock model |
| `LITELLM_API_BASE` | `http://litellm:4000` | LiteLLM proxy URL |
| `LITELLM_MODEL` | `gpt-4o-mini` | LiteLLM model name |
| `LITELLM_API_KEY` | — | LiteLLM API key |
| `SAFETY_ENABLED` | `true` | Enable/disable safety checks |
| `APP_ENV` | `development` | `development` or `production` |

---

## Running Tests

```bash
# Run all tests (45 tests, ~0.4s)
make test

# Unit tests only
make test-unit

# Integration tests only
make test-integration

# Lint check
make lint

# Auto-format
make format
```

---

## Local Development (without Docker)

```bash
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env

# Start just the DB via Docker
docker compose up db -d

# Run API with hot-reload
make dev
# → http://localhost:8000/docs
```

---

## Project Structure

```
app/
├── main.py              # FastAPI app, router registration, CORS
├── auth.py              # API key authentication dependency
├── config.py            # All env var settings (pydantic-settings)
├── database.py          # SQLAlchemy engine + session
├── models/              # ORM models (conversations, messages, flags)
├── schemas/             # Pydantic request/response validation
├── api/                 # Route handlers (thin — validate & call service)
├── services/
│   ├── ai_service.py         # AI provider abstraction (Mock/Bedrock/LiteLLM)
│   ├── safety_service.py     # Content moderation (keyword + regex)
│   └── conversation_service.py  # Core business logic / orchestration
└── prompts/
    └── system_prompt.txt     # Child-safe AI system prompt
tests/
├── unit/               # Safety service + AI service unit tests
└── integration/        # Full API flow tests (in-memory SQLite)
```

---

## Makefile Commands

```bash
make dev          # Run local API server (hot reload)
make test         # Run all tests
make lint         # Check code style
make format       # Auto-format code
make docker-up    # Start Docker Compose (API + DB)
make docker-down  # Stop and remove containers
make help         # Show all commands
```

---

## Assumptions Made

1. **API key auth** — simple shared-secret header. In production this would be per-user JWTs; learner_id would come from the token claim, not a free-form field.
2. **Synchronous DB** — sync SQLAlchemy for readability. Async is straightforward to add with `asyncpg`.
3. **Rule-based safety only** — LLM-based classification is implemented but off by default (`SAFETY_LLM_CHECK=false`) to keep costs zero in dev.
4. **SQLite for integration tests** — no real Postgres needed to run tests, keeps CI fast.
5. **Mock AI provider default** — works out of the box without any API keys.
