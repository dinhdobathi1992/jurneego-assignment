# Code Walkthrough — JurneeGo Safe AI Learning Assistant

A detailed explanation of every Python file, function, and design choice in this project. Written so you can understand and defend every line in a live review.

---

## Table of Contents

1. [How the App Starts](#1-how-the-app-starts)
2. [Configuration](#2-configuration---appconfigpy)
3. [Authentication](#3-authentication---appauthpy)
4. [Database Layer](#4-database-layer---appdatabasepy)
5. [ORM Models](#5-orm-models---appmodels)
6. [The Core Flow — Sending a Message](#6-the-core-flow---sending-a-message)
7. [Safety Service](#7-safety-service---appservicessafety_servicepy)
8. [AI Service](#8-ai-service---appservicesai_servicepy)
9. [API Route Handlers](#9-api-route-handlers---appapi)
10. [Pydantic Schemas](#10-pydantic-schemas---appschemas)
11. [Tests](#11-tests)
12. [Infrastructure](#12-infrastructure)

---

## 1. How the App Starts

**File: `app/main.py`**

This is the entry point. When you run `uvicorn app.main:app`, Python imports this file and uvicorn picks up the `app` object.

### The `lifespan` function (lines 30-49)

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    Base.metadata.create_all(bind=get_engine())
    yield
    # Shutdown
```

**What it does:** FastAPI uses this as a startup/shutdown hook. When the app starts, it calls `create_all()` which looks at all your SQLAlchemy model classes (Conversation, Message, Flag) and creates their tables in the database if they don't already exist. The `yield` is where the app runs. After `yield`, shutdown code would go (we just log).

**Why `create_all()` instead of Alembic migrations:** For a prototype, the schema was still changing. Running migration scripts while iterating on the data model would have been overhead without value. In production, you'd replace this line with `alembic upgrade head` run before the app starts (e.g., in a Kubernetes init container or CI step).

**Why `@asynccontextmanager`:** FastAPI's lifespan protocol requires an async context manager. Even though our DB operations are synchronous, the lifespan hook itself must be async.

### The `app` object (lines 53-67)

```python
app = FastAPI(
    title="JurneeGo Safe AI Learning Assistant",
    description="...",
    version="0.1.0",
    lifespan=lifespan,
)
```

**What it does:** Creates the FastAPI application. The `title`, `description`, and `version` are used to auto-generate the Swagger UI at `/docs`. You pass `lifespan` so FastAPI knows to run your startup/shutdown code.

### CORS middleware

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "https://jurnee-ai.dinhdobathi.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**What it does:** Allows browser-based frontends to call this API. Without CORS, a browser blocks cross-origin requests.

**Why these specific origins:** Localhost ports cover the two most common frontend dev servers (Next.js / Vite). The production domain is explicitly listed. In a larger deployment you'd load allowed origins from an env var.

### Router registration

```python
_auth = [Depends(verify_api_key)]
app.include_router(conversations_router, dependencies=_auth)
app.include_router(messages_router, dependencies=_auth)
app.include_router(moderation_router, dependencies=_auth)
```

**What it does:** Attaches the three groups of endpoints to the app and applies the `verify_api_key` dependency to every route inside them. FastAPI calls the dependency before every handler — if the key is missing or invalid, it returns 401 and the handler never runs.

**Why apply auth at `include_router`, not inside each handler:** Single point of control. Adding it to each individual route would be easy to forget. Applying it at registration means every future route added to these routers is automatically protected.

**Why `/health` and `/` are not in this list:** They are defined directly on `app`, not via a router, so they don't inherit the dependency. Health checks must remain public for uptime monitors and load balancer probes.

### Health check (lines 88-102)

```python
@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "jurnee-safe-ai", ...}
```

**What it does:** Returns a simple JSON response. Used by Docker's `HEALTHCHECK`, load balancers, and Kubernetes readiness probes to know if the service is alive.

**Why it doesn't check the database:** A basic health check should be fast and always work. If you add a DB query here and the DB is slow, your health check fails, your orchestrator restarts the pod, which creates more load on the DB — a cascading failure. If you need a deeper check, add a separate `/health/ready` endpoint.

---

## 2. Configuration — `app/config.py`

```python
class Settings(BaseSettings):
    database_url: str = "postgresql://jurnee:jurnee_secret@db:5432/jurnee_ai"
    api_keys: str = "jurnee-demo-key-change-me"
    ai_provider: str = "mock"
    safety_enabled: bool = True
    # ... more fields

    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()
```

**What it does:** Uses `pydantic-settings` to load configuration from environment variables (or a `.env` file). Every field has a type and a default value. If an environment variable `DATABASE_URL` exists, it overrides the default. If you pass `DATABASE_URL=garbage`, Pydantic raises a validation error at import time — the app won't even start.

**Why a single global `settings = Settings()`:** This object is created once when Python first imports `config.py`. Every other file imports this same instance. No repeated `.env` file reads, no scattered `os.getenv()` calls.

**Why `case_sensitive = False`:** Environment variables are traditionally UPPERCASE (`DATABASE_URL`), but Pydantic fields are lowercase (`database_url`). This setting lets them match regardless of case.

**Why `api_keys` is a `str` and not `list[str]`:** `pydantic-settings` tries to JSON-parse list fields from env vars. A comma-separated string like `key1,key2` is not valid JSON, so it would raise a parse error at startup. Storing as a plain string and splitting in `auth.py` avoids this limitation.

**Key fields to understand:**

| Field | What it controls |
|-------|-----------------|
| `api_keys` | Comma-separated valid API keys. Parsed and checked in `auth.py`. |
| `ai_provider` | Which LLM backend to use: `"mock"` (no API needed), `"bedrock"` (AWS), or `"litellm"` (proxy) |
| `safety_enabled` | Master kill switch for all safety checks. Set to `false` to disable. |
| `safety_llm_check` | Enables the optional second layer (LLM-based classification). Off by default to avoid cost. |
| `app_env` | `"development"` enables SQL echo logging. Anything else disables it. |

---

## 3. Authentication — `app/auth.py`

```python
from fastapi.security.api_key import APIKeyHeader
from app.config import settings

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

def verify_api_key(api_key: str = Security(_api_key_header)) -> str:
    valid = {k.strip() for k in settings.api_keys.split(",") if k.strip()}
    if api_key and api_key in valid:
        return api_key
    raise HTTPException(status_code=401, detail="Invalid or missing API key")
```

**What it does:** A FastAPI dependency that reads the `X-API-Key` request header and checks it against the configured keys. If missing or invalid, raises HTTP 401. If valid, returns the key (which FastAPI discards — we only care that it didn't raise).

**Why `APIKeyHeader` with `auto_error=False`:** `auto_error=True` (the default) would return a 403 Forbidden when the header is absent. We want 401 Unauthorized instead, which is the correct HTTP status for missing credentials. Setting `auto_error=False` means FastAPI passes `None` to our function when the header is missing, and we raise 401 ourselves.

**Why a set for valid key lookup:** `in` on a set is O(1). On a list it's O(n). For key validation called on every request, this is the right choice — even if the difference is tiny at small scale.

**Why not cache the parsed key set:** `settings.api_keys` is read from env at startup and never changes while the app is running. The set is built fresh on each request, but this is a microsecond operation — not worth optimising.

---

## 4. Database Layer — `app/database.py`

### Lazy engine creation

```python
_engine = None

def get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(
            settings.database_url,
            pool_size=5,
            max_overflow=10,
            pool_pre_ping=True,
            echo=(settings.app_env == "development"),
        )
    return _engine
```

**What it does:** Creates a SQLAlchemy engine (the connection manager) only when first needed. The engine is stored in a module-level variable so it's reused for the lifetime of the process.

**Why lazy:** If we created the engine at import time, importing `database.py` would immediately try to connect to Postgres. This would fail during tests (which use SQLite) or when running linting (which imports files but doesn't start the app).

**Connection pool parameters:**
- `pool_size=5` — Keep 5 connections open and ready. When a request needs a DB connection, it grabs one from this pool instead of opening a new TCP connection (which takes ~5-10ms).
- `max_overflow=10` — If all 5 are busy, allow up to 10 extra temporary connections. These are closed when the load drops.
- `pool_pre_ping=True` — Before handing a connection to your code, send a lightweight query (`SELECT 1`) to verify the connection is still alive. This prevents "connection closed" errors when Postgres restarts or a connection sits idle too long.
- `echo=True` in dev — Prints every SQL statement to the console. Extremely useful for debugging N+1 queries or unexpected queries.

### The session dependency

```python
def get_db():
    SessionLocal = get_session_factory()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

**What it does:** This is a FastAPI "dependency" — a function that FastAPI calls automatically for each request. It opens a database session, gives it to the route handler (via `yield`), then closes it when the request is done (in `finally`).

**Why `yield` and not `return`:** The `yield` makes this a generator. FastAPI knows that everything before `yield` is setup, everything after is teardown. The `finally` block ensures the session is closed even if the route handler raises an exception. Without this, connection leaks would eventually exhaust the pool.

**Why a new session per request:** Each HTTP request gets its own database session (its own transaction). If request A writes data and request B reads at the same time, they don't see each other's uncommitted changes. This is standard practice — it prevents race conditions.

### The `Base` class

```python
class Base(DeclarativeBase):
    pass
```

**What it does:** All ORM model classes (Conversation, Message, Flag) inherit from this. SQLAlchemy uses it to track which models exist so `create_all()` knows which tables to create. It's empty because we don't need any shared columns or behavior across all models.

---

## 5. ORM Models — `app/models/`

These define the database tables as Python classes. SQLAlchemy translates them to SQL `CREATE TABLE` statements.

### `conversation.py` — The Conversation model

```python
class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    learner_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_flagged: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=..., onupdate=...)
```

**Column-by-column:**

- **`id`** — UUID string, generated by Python (not the database). `lambda: str(uuid.uuid4())` creates a new UUID each time a row is inserted. UUIDs are used instead of auto-increment integers because they're safe to expose in URLs (no one can guess the next ID) and work across distributed systems.

- **`learner_id`** — Who this conversation belongs to. Indexed because we'll query "all conversations for learner X". `String(100)` caps the length. In production this would be a JWT claim, not a user-provided string.

- **`is_flagged`** — A denormalized boolean. Technically redundant — you could check `len(conversation.flags) > 0` — but having a boolean column with an index lets you write `WHERE is_flagged = TRUE` which is instant, instead of a JOIN across conversations/flags tables.

- **`created_at` / `updated_at`** — Timestamps with timezone. `onupdate=lambda: datetime.now(UTC)` on `updated_at` means SQLAlchemy automatically refreshes it whenever any column on the row changes.

**Relationships:**

```python
messages: Mapped[list["Message"]] = relationship(
    back_populates="conversation",
    order_by="Message.created_at",
    cascade="all, delete-orphan",
)
```

- `relationship(...)` tells SQLAlchemy that a Conversation has many Messages. When you access `conversation.messages`, SQLAlchemy automatically runs a `SELECT * FROM messages WHERE conversation_id = ?`.
- `order_by="Message.created_at"` — Messages come back in chronological order (important for building AI context).
- `cascade="all, delete-orphan"` — If you delete a conversation, all its messages are automatically deleted too. "delete-orphan" means if a message is removed from the list, it gets deleted from the DB.
- `back_populates="conversation"` — The reverse direction: `message.conversation` gives you the parent conversation.

### `message.py` — The Message model

```python
class MessageRole(enum.StrEnum):
    LEARNER = "learner"
    ASSISTANT = "assistant"
    SYSTEM = "system"
```

**Why `StrEnum`:** Python 3.11+ feature. It means `MessageRole.LEARNER` is both an enum member AND a string. You can compare it with `== "learner"` directly. Used in the database as an Enum column — Postgres creates a real ENUM type, ensuring only valid values are stored.

```python
class Message(Base):
    role: Mapped[MessageRole] = mapped_column(Enum(MessageRole), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_safe: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    safety_score: Mapped[float | None] = mapped_column(Float, nullable=True)
```

- **`content`** — `Text` type (unlimited length in Postgres, unlike `String(N)`). Messages can be long.
- **`is_safe`** — `nullable=True` because a message might not have been safety-checked yet (e.g., system messages). `True` = passed safety, `False` = failed.
- **`safety_score`** — Confidence of the safety check (0.0 to 1.0). Useful for dashboards and for deciding whether to escalate to a human reviewer.

### `flag.py` — The Flag model

```python
class FlagType(enum.StrEnum):
    SELF_HARM = "self_harm"
    SEXUAL = "sexual"
    CONTACT_INFO = "contact_info"
    MANIPULATION = "manipulation"
    OTHER = "other"

class FlagSeverity(enum.StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
```

**Why separate enums:** Type safety. The database enforces that `flag_type` can only be one of these 5 values, and `severity` can only be LOW/MEDIUM/HIGH. If someone tries to insert `flag_type="invalid"`, Postgres rejects it.

```python
class Flag(Base):
    conversation_id: Mapped[str] = mapped_column(..., ForeignKey("conversations.id", ondelete="CASCADE"))
    message_id: Mapped[str] = mapped_column(..., ForeignKey("messages.id", ondelete="CASCADE"))
    reviewed: Mapped[bool] = mapped_column(Boolean, default=False)
    reviewer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

- **Two foreign keys:** Each flag points to both the conversation AND the specific message. This lets you answer both "which conversations are flagged?" and "which exact message was the problem?"
- **`ondelete="CASCADE"`** — If the parent conversation or message is deleted, the flag is automatically deleted too. Prevents orphan records.
- **`reviewed` / `reviewer_notes` / `reviewed_at`** — These are `None`/`False` when the flag is created. A teacher later fills them in via the moderation API. This is the teacher's audit trail.

---

## 6. The Core Flow — Sending a Message

**File: `app/services/conversation_service.py`**

This is the brain of the application. The `send_message` method orchestrates everything.

### Constructor — Dependency Injection

```python
class ConversationService:
    def __init__(self, db: Session, ai_provider: AIProvider, safety_service: SafetyService):
        self.db = db
        self.ai = ai_provider
        self.safety = safety_service
```

**Why pass dependencies in the constructor instead of importing them directly:** This is dependency injection. The service doesn't create its own database session or choose its own AI provider — it receives them from outside. This means:
- In tests, you can pass a test database and a mock AI provider
- In production, you can pass a real Bedrock provider
- The service itself never needs to change

### `send_message` — The main flow

```python
def send_message(self, conversation_id: str, content: str) -> tuple[Message, Message, bool, str | None]:
```

**Returns:** A tuple of `(learner_message, assistant_message, was_flagged, flag_reason)`. The route handler unpacks this into the API response.

**Step by step:**

```python
# Step 1: Look up the conversation
conversation = self.get_conversation(conversation_id)
if not conversation:
    raise ValueError(f"Conversation {conversation_id} not found")
```

Fetches the conversation from the DB. If it doesn't exist, raises `ValueError` which the route handler catches and converts to a 404 HTTP response.

```python
# Step 2: Create the learner message object
learner_message = Message(
    conversation_id=conversation_id,
    role=MessageRole.LEARNER,
    content=content,
)

# Step 3: Run safety check
safety_result = self.safety.check_message(content)
learner_message.is_safe = safety_result.is_safe
learner_message.safety_score = safety_result.confidence if not safety_result.is_safe else 1.0

self.db.add(learner_message)
self.db.flush()  # Get the ID without committing
```

**Why `flush()` instead of `commit()`:** `flush()` sends the INSERT to the database and gets back the generated UUID, but doesn't finalize the transaction. This means if something fails later (AI call errors out), we can roll back and the learner message won't be half-written. We only `commit()` at the very end when everything succeeds.

```python
# Step 4: Branch based on safety result
if not safety_result.is_safe:
    return self._handle_unsafe_message(conversation, learner_message, safety_result)
return self._handle_safe_message(conversation, learner_message)
```

The flow splits here: unsafe messages get flagged and get a deflection response. Safe messages go to the AI.

### `_handle_unsafe_message`

```python
def _handle_unsafe_message(self, conversation, learner_message, safety_result):
    # Create a flag record
    flag = Flag(
        conversation_id=conversation.id,
        message_id=learner_message.id,
        flag_type=safety_result.flag_type,
        reason=safety_result.reason,
        severity=safety_result.severity,
    )
    self.db.add(flag)

    # Mark conversation as flagged (denormalized field)
    conversation.is_flagged = True

    # Generate a safe deflection
    deflection = SafetyService.get_safe_deflection(safety_result.flag_type)
    assistant_message = Message(
        conversation_id=conversation.id,
        role=MessageRole.ASSISTANT,
        content=deflection,
        is_safe=True,
        safety_score=1.0,
    )
    self.db.add(assistant_message)
    self.db.commit()
```

**Why the deflection is marked `is_safe=True, safety_score=1.0`:** The deflection is a hardcoded, pre-approved message. It's safe by definition — it was written by us, not generated by an AI.

**Why `conversation.is_flagged = True` here:** This is the denormalized flag. We set it on the conversation object and SQLAlchemy includes it in the same `COMMIT`. Without this, listing flagged conversations would require a JOIN.

### `_handle_safe_message`

```python
def _handle_safe_message(self, conversation, learner_message):
    # Build chat history for the AI
    history = self._build_conversation_history(conversation, learner_message)

    # Call the AI
    ai_response_text = self.ai.generate_response(history)

    # Safety check the AI's response too
    ai_safety = self.safety.check_message(ai_response_text)
    if not ai_safety.is_safe:
        ai_response_text = "Let me think of a better way to answer that! ..."
```

**Why check the AI's response:** Even with a good system prompt, an LLM can be jailbroken or produce unexpected content. This is defense in depth — the same principle as checking both incoming and outgoing network traffic with a firewall.

**Why replace instead of flag:** If the AI generates unsafe content, we don't show it to the child at all. We swap it with a neutral redirect. We could also flag it (we don't currently), but the priority is never exposing the child to harmful content.

### `_build_conversation_history`

```python
def _build_conversation_history(self, conversation, current_message):
    history = []
    for msg in conversation.messages:
        history.append({"role": msg.role.value, "content": msg.content})
    history.append({"role": "learner", "content": current_message.content})
    return history
```

**What it does:** Builds the list of all previous messages to send to the AI. LLMs are stateless — they don't "remember" previous turns. You must send the entire conversation history each time.

**Why the current message is added separately:** The current message has been `flush()`ed to the DB but not `commit()`ed yet. It may not appear in `conversation.messages` (which was loaded earlier). So we append it manually.

**Performance note:** If a conversation has 200 messages, all 200 are sent to the AI. This wastes tokens and money. A production improvement would be to cap this at the last 20 messages.

### `list_conversations` and pagination

```python
def list_conversations(self, page: int = 1, page_size: int = 20):
    query = self.db.query(Conversation).order_by(Conversation.created_at.desc())
    total = query.count()
    conversations = query.offset((page - 1) * page_size).limit(page_size).all()
    return conversations, total
```

**Why offset/limit pagination:** Simple to implement, works fine for small datasets. The downside: for page 1000, the database still scans and discards the first 999 pages. For production scale, you'd use cursor-based pagination (e.g., `WHERE created_at < :last_seen_timestamp`).

### `review_flag`

```python
def review_flag(self, flag_id: str, reviewer_notes: str):
    flag = self.db.query(Flag).filter(Flag.id == flag_id).first()
    flag.reviewed = True
    flag.reviewer_notes = reviewer_notes
    flag.reviewed_at = datetime.now(UTC)
    self.db.commit()
```

**What it does:** A teacher calls this endpoint after reading a flagged conversation. They mark the flag as "reviewed" and leave notes (e.g., "False positive — student was asking about volcanoes" or "Genuine concern — contacted school counselor"). This is the audit trail.

---

## 7. Safety Service — `app/services/safety_service.py`

### The `SafetyCheckResult` dataclass

```python
@dataclass
class SafetyCheckResult:
    is_safe: bool
    flag_type: FlagType | None = None
    reason: str | None = None
    severity: FlagSeverity | None = None
    confidence: float = 1.0
```

**Why a dataclass:** It's a simple container for the check result. Using a dataclass instead of a dict gives you type safety and auto-complete in your editor. Every safety check function returns one of these.

### Keyword lists

```python
SELF_HARM_KEYWORDS = ["kill myself", "want to die", "hurt myself", "suicide", ...]
SEXUAL_KEYWORDS = ["sex", "porn", "naked", ...]
MANIPULATION_KEYWORDS = ["don't tell anyone", "our little secret", ...]
```

**Why multi-word phrases for self-harm but single words for sexual content:** Self-harm detection needs context. The word "kill" alone would flag "How do antibiotics kill bacteria?" — a legitimate question. But "kill myself" is unambiguous. Sexual keywords like "porn" or "naked" have no legitimate educational context for children aged 6-14, so single words are sufficient.

**Why hardcoded instead of a database table:** For a prototype, this is simpler. In production, you'd store these in a config file or database table so they can be updated without redeploying the app.

### Regex patterns for contact info

```python
PHONE_PATTERN = re.compile(
    r"(?:\+?\d{1,3}[-.\s]?)?"     # Optional country code
    r"(?:\(?\d{2,4}\)?[-.\s]?)"   # Area code
    r"(?:\d{3,4}[-.\s]?)"         # First part
    r"\d{3,4}",                    # Last part
)
```

**What it matches:** Phone numbers in various formats: `555-123-4567`, `+1 (555) 123-4567`, `555.123.4567`. The regex is flexible to catch common patterns without being so loose that it flags math problems.

```python
EMAIL_PATTERN = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
```

**What it matches:** Standard email addresses like `kid@example.com`. The `[a-zA-Z]{2,}` at the end requires a real TLD (at least 2 letters).

```python
ADDRESS_PATTERN = re.compile(
    r"\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln)",
    re.IGNORECASE,
)
```

**What it matches:** Physical addresses like "123 Main Street" or "456 Oak Ave". Looks for a number followed by words followed by a street-type suffix.

### The `check_message` method

```python
def check_message(self, content: str) -> SafetyCheckResult:
    if not settings.safety_enabled:
        return SafetyCheckResult(is_safe=True)

    content_lower = content.lower().strip()

    checks = [
        self._check_self_harm(content_lower),
        self._check_sexual_content(content_lower),
        self._check_manipulation(content_lower),
        self._check_contact_info(content),  # Original case for regex
    ]

    for result in checks:
        if not result.is_safe:
            return result

    return SafetyCheckResult(is_safe=True)
```

**Why check in this specific order:** Most dangerous first. Self-harm is the highest priority — if a child is expressing suicidal thoughts, that trumps everything else. The first unsafe result is returned immediately.

**Why `content_lower` for keywords but original `content` for regex:** Keyword matching is case-insensitive (we lowercase both the content and the keywords). But the regex patterns for phone numbers and addresses work on the original case because they match digits and patterns that aren't affected by case.

**Why return on first match:** A message could contain both self-harm keywords and an email address, but the response to the user (the deflection) is specific to the flag type. Returning the most severe one ensures the child gets the most appropriate response (e.g., "talk to a trusted adult" for self-harm, not "keep your info private" for contact info).

### Deflection responses

```python
@staticmethod
def get_safe_deflection(flag_type: FlagType) -> str:
    deflections = {
        FlagType.SELF_HARM: "I care about you! 💙 If you're feeling sad or upset, ...",
        FlagType.SEXUAL: "Let's talk about something more appropriate for learning! 📚 ...",
        FlagType.CONTACT_INFO: "For your safety, it's important to keep personal information private! 🔒 ...",
        FlagType.MANIPULATION: "Remember, it's always okay to talk to your parents or teachers! 🌟 ...",
    }
```

**Why different responses per type:** A child expressing self-harm needs warmth and a referral to trusted adults. A child sharing their email needs a privacy reminder. Generic "that's inappropriate" would be unhelpful and could feel punishing.

**Why `@staticmethod`:** This method doesn't use `self` — it doesn't need a SafetyService instance. It's a pure function that maps flag types to messages. Making it static makes this explicit and lets it be called without instantiating the service (e.g., in tests).

---

## 8. AI Service — `app/services/ai_service.py`

### The abstract interface

```python
class AIProvider(ABC):
    @abstractmethod
    def generate_response(self, conversation_history: list[dict], system_prompt: str | None = None) -> str:
        pass
```

**Why an abstract class:** This is the **adapter pattern**. All three AI providers (Mock, Bedrock, LiteLLM) implement this same interface. The rest of the app only calls `generate_response()` — it doesn't know or care which AI backend is behind it. If you want to add a new provider (e.g., OpenAI directly), you just create a new class that implements this interface.

### System prompt loading

```python
def _load_system_prompt() -> str:
    prompt_file = PROMPTS_DIR / "system_prompt.txt"
    if prompt_file.exists():
        return prompt_file.read_text().strip()
    return "You are a friendly, safe AI learning assistant..."
```

**Why a text file instead of a Python string:** Prompts are long and frequently edited. Keeping them in a separate `.txt` file means non-developers (e.g., a product manager or child psychologist) can edit the prompt without touching Python code. The fallback string is a safety net in case the file is missing.

### MockAIProvider

```python
class MockAIProvider(AIProvider):
    def generate_response(self, conversation_history, system_prompt=None):
        last_message = conversation_history[-1].get("content", "")
        return f"That's a great question! Let me help you understand more about '{last_message[:80]}'..."
```

**What it does:** Returns a canned response that includes a snippet of the learner's question. No external API call, no cost, always works.

**Why it exists:** Three reasons: (1) Tests run without API keys. (2) Local development works offline. (3) CI pipeline doesn't need AWS credentials. This is the default provider.

### BedrockAIProvider

```python
class BedrockAIProvider(AIProvider):
    def __init__(self):
        import boto3
        self.client = boto3.client("bedrock-runtime", region_name=settings.aws_region, ...)
```

**Why `import boto3` inside `__init__` instead of at the top of the file:** If you import boto3 at the module level, every test file that imports `ai_service.py` would need boto3 installed and configured. By importing inside the constructor, boto3 is only loaded when you actually create a `BedrockAIProvider` — which only happens when `AI_PROVIDER=bedrock`.

```python
def generate_response(self, conversation_history, system_prompt=None):
    messages = []
    for msg in conversation_history:
        role = "user" if msg["role"] == "learner" else "assistant"
        messages.append({"role": role, "content": [{"text": msg["content"]}]})

    response = self.client.converse(
        modelId=self.model_id,
        system=[{"text": prompt}],
        messages=messages,
        inferenceConfig={"maxTokens": 512, "temperature": 0.7, "topP": 0.9},
    )
```

**Why convert `"learner"` to `"user"`:** Bedrock's API expects `"user"` and `"assistant"` roles (OpenAI convention). Our internal model uses `"learner"` and `"assistant"`. This translation happens here so the rest of the app doesn't need to know about Bedrock's API format.

**Why `maxTokens: 512`:** Short responses are better for children. 512 tokens is roughly 350-400 words — enough for a clear explanation but not an overwhelming wall of text.

**Why `temperature: 0.7`:** Controls randomness. 0.0 = deterministic (same input → same output). 1.0 = very creative. 0.7 is a balance: varied enough to not feel robotic, focused enough to stay on topic.

```python
except self.client.exceptions.ThrottlingException:
    return self._fallback_response()
except Exception as e:
    return self._fallback_response()
```

**Why catch ThrottlingException separately:** AWS rate-limits Bedrock calls. A throttle is temporary and expected under load — we log it as a warning, not an error. Generic exceptions get logged as errors. Both return a friendly fallback so the child never sees a stack trace.

### LiteLLMAIProvider

```python
class LiteLLMAIProvider(AIProvider):
    def generate_response(self, conversation_history, system_prompt=None):
        import litellm
        messages = [{"role": "system", "content": prompt}]
        for msg in conversation_history:
            role = "user" if msg["role"] == "learner" else "assistant"
            messages.append({"role": role, "content": msg["content"]})

        response = litellm.completion(model=self.model, messages=messages, ...)
```

**Why LiteLLM:** It's a proxy that speaks the OpenAI API format but can route to 100+ different models (GPT-4, Claude, Llama, Mistral, etc.). You change the model by changing one env var (`LITELLM_MODEL`), not by rewriting code. It runs as a separate Docker service.

**Same `import litellm` inside method pattern** as Bedrock — avoids requiring litellm to be importable when using other providers.

### Provider factory

```python
def get_ai_provider() -> AIProvider:
    provider_map = {
        "bedrock": BedrockAIProvider,
        "litellm": LiteLLMAIProvider,
        "mock": MockAIProvider,
    }
    provider_name = settings.ai_provider.lower()
    provider_class = provider_map.get(provider_name, MockAIProvider)
    return provider_class()
```

**What it does:** Reads the `AI_PROVIDER` env var and returns the right class. If the value is unrecognized, falls back to Mock (safe default — never calls an external API by accident).

**Why a factory function instead of instantiating at import time:** The provider might need AWS credentials (Bedrock) or a running proxy (LiteLLM). Creating it at import time could fail. Creating it on demand means it only fails when actually used.

---

## 9. API Route Handlers — `app/api/`

All three route files follow the same pattern: thin handlers that validate input and delegate to `ConversationService`.

### The dependency injection pattern

```python
def _get_service(db: Session = Depends(get_db)) -> ConversationService:
    return ConversationService(
        db=db,
        ai_provider=get_ai_provider(),
        safety_service=SafetyService(),
    )
```

**What `Depends(get_db)` does:** FastAPI sees `Depends(get_db)` and calls `get_db()` automatically. This creates a database session for this request. After the route handler returns, `get_db()`'s `finally` block closes the session.

**Why create ConversationService per request:** Each request gets its own DB session. The service wraps that session. If you shared one service across requests, you'd have concurrent requests fighting over the same database connection.

### `messages.py` — The core endpoint

```python
@router.post("/{conversation_id}/messages", response_model=MessagePairResponse)
def send_message(conversation_id: str, data: MessageCreate, service = Depends(_get_service)):
    try:
        learner_msg, assistant_msg, was_flagged, flag_reason = service.send_message(
            conversation_id=conversation_id, content=data.content,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
```

**Why `try/except ValueError → 404`:** The service raises `ValueError` when the conversation doesn't exist. The handler converts this to an HTTP 404. The service doesn't know about HTTP status codes — it just says "not found". The handler translates.

**Why `response_model=MessagePairResponse`:** Tells FastAPI to validate the response against this Pydantic schema and to generate Swagger documentation for it. If the handler returns data that doesn't match the schema, FastAPI raises a 500 error — you'd catch this in testing, not in production.

### `conversations.py` — CRUD endpoints

```python
@router.post("", response_model=ConversationResponse, status_code=201)
def create_conversation(data: ConversationCreate, service = Depends(_get_service)):
    conversation = service.create_conversation(data)
    return ConversationResponse.model_validate(conversation)
```

**Why `status_code=201`:** HTTP convention — 201 means "resource created". FastAPI defaults to 200, but for POST endpoints that create something, 201 is correct.

**Why `model_validate(conversation)`:** Converts the SQLAlchemy ORM object to a Pydantic response model. Pydantic reads the ORM attributes (thanks to `from_attributes = True` in the Config) and builds a clean JSON-serializable object.

### `moderation.py` — Teacher review endpoints

```python
@router.patch("/flags/{flag_id}/review", response_model=FlagResponse)
def review_flag(flag_id: str, data: FlagReviewRequest, service = Depends(_get_service)):
    flag = service.review_flag(flag_id=flag_id, reviewer_notes=data.reviewer_notes)
    if not flag:
        raise HTTPException(status_code=404, detail="Flag not found")
```

**Why PATCH instead of PUT:** PATCH means "partial update" — you're only updating the `reviewed` and `reviewer_notes` fields, not replacing the entire flag object. PUT implies replacing the whole resource.

---

## 10. Pydantic Schemas — `app/schemas/`

These define what the API accepts (request bodies) and returns (response bodies). FastAPI uses them for three things simultaneously: validation, serialization, and documentation.

### Request schemas

```python
class MessageCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000, examples=["How do volcanoes work?"])
```

- `...` (Ellipsis) means "required" — the client must provide this field.
- `min_length=1` — Empty messages are rejected.
- `max_length=5000` — Prevents someone sending a 10MB message to overwhelm the AI or database.
- `examples=` — Appears in the Swagger UI, helping people try the API.

### Response schemas

```python
class ConversationResponse(BaseModel):
    id: str
    learner_id: str
    messages: list[MessageInConversation] = []
    flags: list[FlagInConversation] = []

    class Config:
        from_attributes = True
```

**Why `from_attributes = True`:** Pydantic normally reads from dicts. SQLAlchemy models aren't dicts — they're objects with attributes. This setting tells Pydantic to read `obj.id` instead of `obj["id"]`. Without it, `model_validate(orm_object)` would fail.

### The `MessagePairResponse`

```python
class MessagePairResponse(BaseModel):
    learner_message: MessageResponse
    assistant_message: MessageResponse
    was_flagged: bool = False
    flag_reason: str | None = None
```

**Why return both messages together:** The core endpoint (`POST /messages`) always produces a pair: the learner's message and the AI's response (or deflection). Returning them together means the client makes one request, not two.

**Why `was_flagged` and `flag_reason` at the top level:** The client needs to know quickly if something was flagged without parsing the nested message objects. This is a convenience for frontend developers.

### `ConversationSummary` vs `ConversationResponse`

```python
class ConversationSummary(BaseModel):
    # No messages, no flags — just metadata + message_count
    message_count: int = 0

class ConversationResponse(BaseModel):
    # Full detail — includes messages and flags lists
    messages: list[MessageInConversation] = []
    flags: list[FlagInConversation] = []
```

**Why two schemas for the same model:** List views (`GET /conversations`) don't need all messages — that would be too much data. They use `ConversationSummary` with just a count. Detail views (`GET /conversations/{id}`) return everything using `ConversationResponse`.

---

## 11. Tests

### Unit tests — `tests/unit/`

#### `test_safety_service.py`

```python
@pytest.fixture
def safety():
    return SafetyService()
```

**What this does:** Creates a fresh SafetyService for each test. `@pytest.fixture` means pytest automatically passes this as a parameter to any test that asks for it.

```python
class TestSelfHarmDetection:
    def test_detects_explicit_self_harm(self, safety):
        result = safety.check_message("I want to hurt myself")
        assert result.is_safe is False
        assert result.flag_type == FlagType.SELF_HARM
```

**Test structure:** Each safety category has its own test class. Tests are in pairs: one that should be caught (unsafe) and one that should pass (safe). For example, "How do volcanoes erupt?" mentions "erupt" which could sound violent — the test proves it passes correctly.

```python
class TestSafeContent:
    @pytest.mark.parametrize("message", [
        "How do volcanoes work?",
        "What is the speed of light?",
        "Tell me about dinosaurs!",
        ...
    ])
    def test_educational_messages_are_safe(self, safety, message):
        result = safety.check_message(message)
        assert result.is_safe is True
```

**Why `@pytest.mark.parametrize`:** Runs the same test with 7 different inputs. Each appears as a separate test in the output, so you can see exactly which message failed if one does. Without parametrize, you'd need 7 nearly-identical test functions.

#### `test_ai_service.py`

```python
def test_unknown_provider_falls_back_to_mock(self, monkeypatch):
    monkeypatch.setattr("app.services.ai_service.settings.ai_provider", "nonexistent")
    provider = get_ai_provider()
    assert isinstance(provider, MockAIProvider)
```

**What `monkeypatch` does:** Temporarily overrides a value for the duration of one test. Here it sets `ai_provider` to `"nonexistent"` to verify the factory falls back to Mock. After the test, the original value is restored automatically.

### Integration tests — `tests/integration/test_api.py`

#### The test database setup

```python
test_engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

app.dependency_overrides[get_db] = override_get_db
```

**What this does:** Replaces the real Postgres database with an in-memory SQLite database for tests. `dependency_overrides` is FastAPI's mechanism for swapping dependencies — every time a route handler asks for `get_db`, it gets the test database instead.

**Why in-memory SQLite:**
- No Postgres needed to run tests
- Tests run in ~0.4 seconds (vs 2-5 seconds with a real DB)
- Each test gets fresh tables (created/dropped in the fixture)
- CI pipeline doesn't need a database service for tests to pass

**Why `check_same_thread=False`:** SQLite normally only allows access from the thread that created the connection. FastAPI may handle different parts of a request on different threads. This flag disables that safety check. It's fine in tests (single-user) but would be dangerous in production (which is why we use Postgres there).

**Why `StaticPool`:** Keeps one connection alive for all tests. Without this, SQLite's in-memory database would disappear when the connection closes.

```python
@pytest.fixture(autouse=True)
def setup_database():
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)
```

**Why `autouse=True`:** Runs this fixture for every test automatically, without needing to include it as a parameter. Each test starts with fresh tables and ends by dropping them — complete isolation between tests.

#### The full-flow test

```python
def test_send_safe_message_gets_ai_response(self, client):
    # Create conversation
    conv = client.post("/api/conversations", json={"learner_id": "student-1"}).json()
    # Send a safe message
    response = client.post(f"/api/conversations/{conv['id']}/messages", json={"content": "How do volcanoes work?"})
    data = response.json()
    # Verify
    assert data["learner_message"]["role"] == "learner"
    assert data["assistant_message"]["role"] == "assistant"
    assert data["was_flagged"] is False
```

**Why this test is important:** It exercises the entire stack — HTTP request → FastAPI routing → Pydantic validation → ConversationService → SafetyService → MockAIProvider → database → Pydantic serialization → HTTP response. If any layer is broken, this test fails.

---

## 12. Infrastructure

### Dockerfile

```dockerfile
FROM python:3.12-slim AS base
RUN useradd --create-home --shell /bin/bash appuser
```

**Why `python:3.12-slim`:** The `slim` variant (~120MB) omits build tools and documentation that `python:3.12` includes (~900MB). Smaller images = faster deploys and smaller attack surface.

**Why non-root user:** If an attacker exploits the app, they'd have limited permissions. Running as root would give them access to the entire container filesystem. This is a baseline security practice.

```dockerfile
RUN apt-get install -y --no-install-recommends libpq-dev curl && rm -rf /var/lib/apt/lists/*
```

**Why `libpq-dev`:** The `psycopg2-binary` Python package needs the PostgreSQL C library to connect to Postgres. Without it, `pip install` fails.

**Why `curl`:** Used by the HEALTHCHECK command. Without it, Docker can't check if the app is healthy.

**Why `rm -rf /var/lib/apt/lists/*`:** Deletes the apt cache after installing. Saves ~30MB in the final image.

```dockerfile
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
```

**Why copy requirements.txt first:** Docker caches each layer. If you change a Python file, Docker rebuilds from the `COPY . .` layer. But if `requirements.txt` hasn't changed, the `pip install` layer is cached — saving 30-60 seconds of reinstalling dependencies. This is called layer caching optimization.

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1
```

**What each flag means:**
- `interval=30s` — Check every 30 seconds
- `timeout=5s` — If the check takes more than 5 seconds, count it as failed
- `start-period=10s` — Wait 10 seconds after container start before first check (gives the app time to boot)
- `retries=3` — Three consecutive failures before Docker marks the container as unhealthy

### docker-compose.yml

```yaml
services:
  api:
    depends_on:
      db:
        condition: service_healthy
```

**Why `service_healthy` instead of just `depends_on: db`:** `depends_on` alone only waits for the container to start. Postgres takes 2-3 seconds after starting to actually accept connections. `service_healthy` waits for the healthcheck (`pg_isready`) to pass, so the API doesn't crash on startup trying to connect to a not-yet-ready database.

```yaml
  db:
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U jurnee -d jurnee_ai"]
      interval: 5s
```

**What `pg_isready` does:** A built-in Postgres utility that returns 0 (success) when the database is ready to accept connections. It's the official way to health-check Postgres.

```yaml
  litellm:
    profiles:
      - litellm
```

**Why a Docker Compose profile:** LiteLLM is only needed when `AI_PROVIDER=litellm`. With a profile, `docker compose up` starts only the API and DB. You explicitly opt in to LiteLLM with `docker compose --profile litellm up`. This keeps the default experience simple.

### GitHub Actions CI — `.github/workflows/ci.yml`

```yaml
jobs:
  lint:
    steps:
      - run: ruff check app/ tests/
      - run: ruff format --check app/ tests/

  test:
    needs: lint
    services:
      postgres: ...
    steps:
      - run: pytest tests/ -v --tb=short

  docker-build:
    needs: lint
    steps:
      - run: docker build -t jurnee-safe-ai:test .
      - run: |
          docker run -d ... -e DATABASE_URL=sqlite:///test.db ...
          curl -f http://localhost:8000/health || exit 1
```

**Pipeline flow:** Lint first (fast, catches formatting issues in ~5 seconds). If lint passes, tests and Docker build run in parallel (`needs: lint` for both, not `needs: test`). This gives faster feedback — a Docker build failure doesn't wait for tests to finish.

**Why Postgres service for tests but SQLite for Docker build:** The integration tests use SQLite in-memory (they override the database dependency). The Postgres service is there for any future tests that need real Postgres. The Docker health check uses SQLite because there's no Postgres container in the Docker build job.

---

## Summary: How Everything Connects

```
Request arrives at FastAPI
  ↓
Route handler (app/api/) validates input with Pydantic schemas
  ↓
Dependency injection creates ConversationService with:
  - A database session (from get_db)
  - An AI provider (from get_ai_provider)
  - A safety service (from SafetyService)
  ↓
ConversationService.send_message() orchestrates:
  1. Save learner message (SQLAlchemy → Postgres)
  2. SafetyService.check_message() (keyword/regex, no DB)
  3. If unsafe → create Flag, return deflection
  4. If safe → AIProvider.generate_response() (Bedrock/LiteLLM/Mock)
  5. SafetyService.check_message() on AI output
  6. Save AI response → commit → return
  ↓
Route handler converts ORM objects to Pydantic response
  ↓
FastAPI serializes to JSON and sends HTTP response
```

The key design principle: each layer only knows about the layer directly below it. Route handlers don't know about databases. Services don't know about HTTP. AI providers don't know about safety. This makes testing easy and changes contained.
