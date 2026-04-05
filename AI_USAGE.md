# AI Usage — JurneeGo Safe AI Learning Assistant

## Tools Used

| Tool | What I used it for |
|------|--------------------|
| **Claude (Sonnet / Opus)** | Scaffolding, brainstorming architecture, reviewing code structure |
| **Cursor (AI code editor)** | Inline code completion, docstring generation, test case suggestions |

---

## Where AI Helped

### ✅ Useful contributions

**1. Project skeleton scaffolding**
AI rapidly generated the folder structure, `Makefile`, `.gitignore`, and `requirements.txt`. This saved 30–45 minutes of boilerplate setup. I reviewed every file and adjusted versions, added missing entries (e.g. `.agents/` to `.gitignore`), and restructured the Makefile to match how I actually work.

**2. Regex patterns for contact info detection**
AI suggested the regex patterns for detecting phone numbers, email addresses, and street addresses in `safety_service.py`. I tested each pattern manually with edge cases and adjusted the phone number pattern, which was initially too broad (matching short number sequences in normal sentences like "I have 2 cats aged 3 and 4").

**3. Pydantic schema structure**
AI generated the initial Pydantic schema classes. Useful as a starting point, but I had to restructure the response models — AI initially combined the learner message and AI response into a single flat object, which made the API unclear. I separated them into `learner_message` and `assistant_message` under a `MessagePairResponse` wrapper.

**4. Test case brainstorming**
AI suggested test cases I hadn't considered, such as testing that a safe biology question ("How do plants reproduce?") passes the sexual content filter. I added several of these edge cases to `test_safety_service.py`.

---

## Where AI Output Was Wrong, Weak, or Unsuitable

### ❌ Example 1 — Permissive CORS configuration

AI initially generated this CORS middleware configuration:

```python
# What AI generated — INSECURE
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # ← allows ANY origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Problem:** `allow_origins=["*"]` with `allow_credentials=True` is a security misconfiguration. In production this would allow any website to make authenticated requests on behalf of the user. Browsers actually block this combination — but it shows the AI wasn't thinking about production security.

**What I did:** Restricted origins to only known frontend URLs (`localhost:3000`, `localhost:5173`) plus the production domain (`jurnee-ai.dinhdobathi.com`). In a larger deployment I would load the allowed origins from an environment variable rather than hardcoding them.

---

### ❌ Example 2 — Wrong database design for flags

AI initially suggested a single `is_flagged` boolean column on the `messages` table with a `flag_reason` text field:

```python
# What AI generated — too simple
class Message(Base):
    is_flagged: bool = False
    flag_reason: str | None = None
    flag_type: str | None = None
```

**Problem:** This approach:
- Can only store one flag per message (what if two violations are detected?)
- Loses the severity and reviewer information
- Makes it hard to query "all unreviewed flags sorted by severity"
- Mixes safety metadata into the message model (violates single responsibility)

**What I did:** Created a separate `flags` table as a proper one-to-many relationship. Each flag is its own record with `flag_type`, `reason`, `severity`, `reviewed`, `reviewer_notes`, and `reviewed_at`. This is the correct relational design and supports future features like bulk review, severity-based prioritization, and audit trails.

---

### ❌ Example 3 — AI suggested SQLite for simplicity

When I asked about database choices, AI suggested:

> "For a prototype, you could use SQLite — it requires no setup and works out of the box with SQLAlchemy."

**Why I rejected this:** The assignment explicitly asks about "production readiness" and how to "evolve this from local Docker Compose into a staging or production environment." Starting with SQLite would mean a migration to Postgres later — a non-trivial change that touches connection strings, data types, and possibly query syntax. I chose Postgres from day one (with Docker Compose making local setup just as easy as SQLite) because it removes an entire class of "this works locally but breaks in production" bugs.

I did use SQLite for the integration test database (in-memory) because that's a legitimate pattern — tests should be fast and isolated, not depend on a running Postgres server.

---

## One Example Where I Explicitly Rejected an AI Suggestion

**The suggestion:** When designing the safety layer, AI suggested using a single large list of banned keywords with a simple `any(word in content for word in BANNED_WORDS)` check:

```python
BANNED_WORDS = [
    "kill", "die", "hurt", "gun", "bomb", "sex", "naked",
    "phone", "address", "email", ...
]

def is_safe(content: str) -> bool:
    return not any(word in content.lower() for word in BANNED_WORDS)
```

**Why I rejected it:**
1. **Too many false positives.** The word "kill" appears in "kill two birds with one stone." The word "die" appears in "How do stars die?" (a perfectly valid astronomy question). A learner asking "Why did the dinosaurs die out?" would be blocked.
2. **No context or category.** Treating all unsafe content identically means you can't give a category-specific deflection ("I care about you" for self-harm vs. "keep your info private" for contact info).
3. **No severity.** "die" and "I want to die" are very different — you can't assign severity with a flat keyword list.

**What I built instead:** Separate check functions per category (`_check_self_harm`, `_check_sexual_content`, etc.) with specific multi-word phrases and patterns that reduce false positives. Each function returns a typed `SafetyCheckResult` with `flag_type`, `reason`, and `severity`. The function checks for multi-word phrases like "hurt myself" or "kill myself" rather than single words like "hurt" or "kill."

---

## Honest Assessment

AI was most useful as a **speed multiplier for boilerplate** — the kind of code that's necessary but doesn't require deep thought (imports, model field definitions, route signatures, test fixtures). It saved roughly 2–3 hours of setup work.

AI was least useful for **design decisions** — it tends toward the simplest, most "tutorial-friendly" answer rather than the production-appropriate one. Every significant architectural decision in this codebase (the provider abstraction, the separate flags table, the two-layer safety approach, the Postgres-from-day-one choice) required me to override or ignore the AI's first suggestion.

The most important habit I maintained: **I read every line of generated code.** Nothing was copy-pasted without understanding it and testing it.
