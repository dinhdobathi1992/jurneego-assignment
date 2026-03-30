# 🎓 JurneeGo — Safe AI Learning Assistant

A child-safe AI learning assistant service. Learners chat with an AI, every message is safety-checked, and flagged conversations are reviewable by teachers or admins.

---

## ⚡ Quick Start (2 minutes)

```bash
# 1. Clone & enter the project
git clone <your-repo-url>
cd jurnee-safe-ai

# 2. Copy the env file
cp .env.example .env

# 3. Start everything (API + PostgreSQL)
docker compose up --build

# 4. Open the auto-generated API docs
open http://localhost:8000/docs
```

That's it. The Swagger UI lets you call every endpoint interactively.

---

## 🤖 AI Providers

Switch the AI backend by changing `AI_PROVIDER` in `.env`:

| Value | Description | When to use |
|-------|-------------|-------------|
| `mock` | Returns canned responses | Local dev, CI, no API key needed |
| `bedrock` | AWS Bedrock (Claude Haiku) | Real AI, requires AWS credentials |
| `litellm` | LiteLLM proxy | Flexible, supports 100+ models |

### Running with LiteLLM proxy

```bash
# Start API + PostgreSQL + LiteLLM proxy
docker compose --profile litellm up --build
```

---

## 🛠️ Local Development (without Docker)

```bash
# 1. Python 3.12 virtual environment
python3.12 -m venv venv
source venv/bin/activate       # mac/linux
# venv\Scripts\activate        # windows

# 2. Install dependencies
pip install -r requirements.txt

# 3. Copy and configure env
cp .env.example .env
# Edit .env: set AI_PROVIDER=mock for local dev without a DB

# 4. Start a local PostgreSQL (or use Docker just for DB)
docker compose up db -d

# 5. Run the API with hot-reload
make dev
# → http://localhost:8000/docs
```

---

## 🔑 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://jurnee:jurnee_secret@db:5432/jurnee_ai` | PostgreSQL connection string |
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

## 🧪 Running Tests

```bash
# Run all tests (44 tests, ~0.4s)
make test

# Run only unit tests
make test-unit

# Run only integration tests
make test-integration

# Run with coverage report
make test-cov

# Lint check
make lint

# Auto-format code
make format
```

---

## 📡 API Endpoints

### Core Flow

```bash
# 1. Create a conversation for a learner
curl -X POST http://localhost:8000/api/conversations \
  -H "Content-Type: application/json" \
  -d '{"learner_id": "student-alice", "title": "Space exploration"}'

# Response includes an "id" — use it below
CONV_ID="<id from above>"

# 2. Send a safe message — get AI response
curl -X POST http://localhost:8000/api/conversations/$CONV_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"content": "How do black holes form?"}'

# 3. Send an unsafe message — gets flagged + safe deflection returned
curl -X POST http://localhost:8000/api/conversations/$CONV_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"content": "I want to hurt myself"}'
# → was_flagged: true, returns a child-friendly deflection message
```

### Moderation (Teacher / Admin)

```bash
# List all flagged conversations
curl http://localhost:8000/api/moderation/flagged

# Get full details of a flagged conversation (with flag reasons)
curl http://localhost:8000/api/moderation/flagged/$CONV_ID

# Mark a flag as reviewed
curl -X PATCH http://localhost:8000/api/moderation/flags/$FLAG_ID/review \
  -H "Content-Type: application/json" \
  -d '{"reviewer_notes": "Reviewed — student was upset, counselor notified."}'
```

### Other

```bash
# Health check
curl http://localhost:8000/health

# List all conversations (paginated)
curl "http://localhost:8000/api/conversations?page=1&page_size=20"
```

---

## 🗂️ Project Structure

```
app/
├── main.py              # FastAPI app entry point
├── config.py            # All env var settings (pydantic-settings)
├── database.py          # SQLAlchemy engine + session
├── models/             # ORM models (conversations, messages, flags)
├── schemas/            # Pydantic request/response validation
├── api/                # Route handlers (thin layer — just validate & call service)
├── services/
│   ├── ai_service.py   # AI provider abstraction (Mock / Bedrock / LiteLLM)
│   ├── safety_service.py  # Content moderation
│   └── conversation_service.py  # Core business logic / orchestration
└── prompts/
    └── system_prompt.txt  # Child-safe AI system prompt
tests/
├── unit/               # Safety service + AI service unit tests
└── integration/        # Full API flow tests (in-memory SQLite)
```

---

## 🧹 Makefile Commands

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

1. **No authentication** — learner_id is a plain string passed by the client. In production this would be a JWT claim.
2. **Synchronous DB** — used sync SQLAlchemy for simplicity and readability. Async is straightforward to add with `asyncpg`.
3. **Rule-based safety only** — LLM-based safety classification is implemented but disabled by default (`SAFETY_LLM_CHECK=false`) to keep costs zero in dev.
4. **SQLite for integration tests** — no real Postgres needed to run tests, makes CI fast and simple.
5. **Mock AI provider default** — the service works out of the box without any API keys.
