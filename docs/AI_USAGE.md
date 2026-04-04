# AI Usage — JurneeGo Safe AI Learning Assistant

## Tools Used

| Tool | Purpose |
|------|---------|
| **Claude (Sonnet / Opus)** | Scaffolding, architecture brainstorming, code review |
| **Cursor** | Inline code completion, test case suggestions |

---

## Where AI Helped

**Project skeleton**
AI generated the initial folder structure, `Makefile`, `.gitignore`, and `requirements.txt`. I reviewed every file, adjusted package versions, added missing entries (`.agents/` to `.gitignore`), and restructured the Makefile to match how I actually run things.

**Regex patterns for contact info detection**
AI suggested the initial regex patterns for phone numbers, email addresses, and street addresses in `safety_service.py`. I tested each with edge cases and tightened the phone number pattern — the original matched short digit sequences in normal sentences.

**Pydantic schema structure**
AI generated the initial schema classes. I restructured the response models — AI had combined the learner message and AI response into a flat object, which made the API response unclear. I split them into `learner_message` and `assistant_message` under `MessagePairResponse`.

**Test case ideas**
AI suggested edge cases I hadn't considered, like testing that "How do plants reproduce?" passes the sexual content filter. I added several of these to `test_safety_service.py`.

---

## Where AI Output Was Wrong or Unsuitable

**Permissive CORS configuration**

AI generated this:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

`allow_origins=["*"]` with `allow_credentials=True` is a security misconfiguration — browsers actually reject this combination, but it shows the AI wasn't thinking about production. I restricted origins to known local URLs and added a note that production should load them from an environment variable.

---

**Wrong database design for flags**

AI suggested a single `is_flagged` boolean and `flag_reason` text column on the `messages` table:

```python
class Message(Base):
    is_flagged: bool = False
    flag_reason: str | None = None
    flag_type: str | None = None
```

This can only store one flag per message, loses severity and reviewer information, and mixes safety metadata into the message model. I built a separate `flags` table with `flag_type`, `reason`, `severity`, `reviewed`, `reviewer_notes`, and `reviewed_at` — proper relational design that supports future features like bulk review and severity-based prioritization.

---

**Suggested SQLite for simplicity**

When I asked about database choices, AI suggested SQLite because it "requires no setup." The assignment asks how to evolve this to production — starting with SQLite means migrating to Postgres later, which touches connection strings, data types, and query syntax. I chose Postgres from the start. Docker Compose makes local setup just as easy, and the production path becomes a connection string change rather than a data migration.

I did use in-memory SQLite for the integration test database, which is a legitimate pattern — tests should be fast and isolated.

---

## Where I Explicitly Rejected an AI Suggestion

When designing the safety layer, AI suggested a single flat keyword list:

```python
BANNED_WORDS = ["kill", "die", "hurt", "gun", "sex", "naked", "phone", ...]

def is_safe(content: str) -> bool:
    return not any(word in content.lower() for word in BANNED_WORDS)
```

The problems:

1. Too many false positives. "How do stars die?" is a valid astronomy question. "kill two birds with one stone" is an idiom. A flat list can't distinguish these.
2. No categorization. You can't give a category-appropriate deflection ("I care about you" for self-harm vs. "keep your info private" for PII) if all violations are treated the same.
3. No severity. "die" and "I want to die" are very different signals.

Instead I built separate check functions per category (`_check_self_harm`, `_check_sexual_content`, etc.) using multi-word phrases and patterns. Each returns a typed `SafetyCheckResult` with `flag_type`, `reason`, and `severity`. "hurt myself" gets flagged — "hurt" alone does not.

---

## Overall Assessment

AI was most useful for boilerplate — the code that's necessary but not where the design decisions live. Every significant architectural choice (provider abstraction, separate flags table, two-layer safety, Postgres from day one) required overriding or ignoring the AI's first suggestion.

I read every line of generated code before accepting it.
