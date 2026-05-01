# Async vs Sync — What It Means for Your Backend

## The Core Idea: A Restaurant Kitchen

Imagine your backend is a **restaurant**. Each incoming HTTP request is a **customer order**.

### Synchronous (what your code does now)

You have **1 waiter**. The waiter takes order #1, walks to the kitchen, and **stands there watching the chef cook** for 2 minutes. While waiting, no other orders are taken.

Customer #2 arrives — they wait.
Customer #3 arrives — they wait.
Customer #4 arrives — they wait.

```
Waiter takes Order #1
    ↓
[standing... waiting... 2000ms for AI response]
    ↓
Returns food to Customer #1
    ↓
NOW takes Order #2  ← everyone waited
```

This is exactly what happens in your code at `conversation_service.py` line 158:

```python
ai_response_text = self.ai.generate_response(history)
# ↑ this line blocks for 1-3 seconds
# ↑ while it's running, this worker does NOTHING ELSE
```

---

### Asynchronous (what you want)

The waiter takes order #1, **puts the ticket on the kitchen counter**, then immediately goes to take order #2, #3, #4. When the kitchen rings the bell (AI is done), the waiter picks up the food and delivers it.

```
Waiter takes Order #1 → puts ticket in kitchen → immediately takes Order #2
                                               → immediately takes Order #3
Kitchen finishes #1 → waiter delivers it
Kitchen finishes #3 → waiter delivers it
```

Many customers are being served at the same time — with **1 waiter**.

---

## Why Python Has Both Modes

Python runs your code in a single thread by default. "Thread" = one worker doing one thing at a time.

**Sync code:**
```python
def send_message():
    result = call_bedrock_ai()   # stops here, waits 2000ms
    save_to_db(result)           # then does this
    return result
```

**Async code:**
```python
async def send_message():
    result = await call_bedrock_ai()   # "await" = pause THIS task, let others run
    await save_to_db(result)           # resume when AI is done
    return result
```

The keyword `await` is the waiter putting the ticket on the counter and walking away. Python's **event loop** is the restaurant floor — it keeps track of all pending tasks and resumes them when they're ready.

---

## What "Holding a Thread" Actually Means

FastAPI runs on **uvicorn**, which uses an event loop (ASGI). By default, uvicorn gives you a limited number of threads — typically **40 worker threads** in the thread pool.

When your code does this:

```python
# synchronous DB call
db.query(Conversation).filter(...).first()

# synchronous AI call
self.ai.generate_response(history)   # 2000ms
```

Each of those calls **blocks a thread** for its entire duration. The thread is just sitting idle waiting for a network response.

At 10,000 users:
- 10,000 requests arrive
- Each request needs a thread for ~2 seconds (waiting for AI)
- You only have 40 threads
- **39,960 requests queue up and time out**

---

## The Three Things That Are Sync in Your Code

### 1. The DB Session (`database.py` line 35)

```python
# Current code — synchronous
from sqlalchemy.orm import Session, sessionmaker

_engine = create_engine(...)          # sync engine
_SessionLocal = sessionmaker(...)     # sync sessions
```

Every `db.query(...)` call opens a real TCP connection to Postgres and **waits** for the response. The thread is blocked.

**What it would look like async:**
```python
# Async version
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

_engine = create_async_engine(...)
# db queries use "await"
result = await db.execute(select(Conversation).filter(...))
```

---

### 2. The AI Call (`ai_service.py` line 137)

```python
# Current — synchronous Bedrock call
response = self.client.converse(
    modelId=self.model_id,
    messages=messages,
    ...
)
# ↑ thread blocked here for 500-3000ms. Network call. Just waiting.
```

The AI is sitting in a data center somewhere. Your server sends a request and **waits for the network response**. During this wait, the thread does nothing.

This is the **worst offender** — it accounts for 95% of your total request time.

---

### 3. The Safety Service (`conversation_service.py` line 91)

```python
safety_result = self.safety.check_message(content)
```

This one is mostly fine — it's regex and keyword matching (CPU work, fast). But if `SAFETY_LLM_CHECK=true`, it makes another AI call, which has the same blocking problem.

---

## The Fix: Three Layers

### Layer 1 — Make DB calls async

Switch to the `asyncpg` driver with SQLAlchemy's async extension. Your DB queries become:

```python
result = await db.execute(...)   # thread is free while waiting for Postgres
```

Libraries needed:
```
sqlalchemy[asyncio]
asyncpg
```

---

### Layer 2 — Make AI calls async

Option A — quick win, wrap the blocking call so it runs in a background thread without blocking the event loop:

```python
ai_response = await asyncio.to_thread(self.ai.generate_response, history)
```

Option B — use native async libraries:
```
aioboto3    # async AWS Bedrock client
httpx       # async HTTP client for LiteLLM
```

---

### Layer 3 — Decouple AI from the HTTP request (biggest impact)

Don't make the user wait at all. Return immediately and do the AI work in the background.

**How it works:**

```
User sends message
    ↓
API saves message, returns job_id immediately (fast, under 50ms)
    ↓
Background worker (Celery) picks up the job
    ↓
Background worker calls AI (takes 2000ms — user is NOT waiting)
    ↓
Result stored in DB
    ↓
User polls  GET /messages/{job_id}
       or receives a push via WebSocket
```

This is how every production chat app works — ChatGPT, Slack AI, Google Gemini. The response comes back via a separate channel, not the same HTTP request.

Libraries needed:
```
celery    # task queue
redis     # message broker (passes jobs from API to workers)
```

---

## Visual Summary

```
SYNC (current):

Request 1  ──[■■■■■■■■■■ 2000ms ]──▶ done
Request 2          ──[■■■■■■■■■■ 2000ms ]──▶ done
Request 3                  ──[■■■■■■■■■■ 2000ms ]──▶ done

■ = thread is blocked (just waiting, doing nothing useful)
Total time to serve 3 users: 6000ms


ASYNC (goal):

Request 1  ──[░░░░░░░░░░]──▶ done
Request 2  ──[░░░░░░░░░░]──▶ done
Request 3  ──[░░░░░░░░░░]──▶ done

░ = thread is free to handle other requests while waiting
Total time to serve 3 users: ~2000ms (all overlap)
```

---

## Full Architecture at Scale

```
[ 10,000 users ]
       │
       ▼
[ Load Balancer: Nginx / AWS ALB ]
       │
       ├──▶ [ API Replica 1 ] ─┐
       ├──▶ [ API Replica 2 ] ─┤──▶ [ PgBouncer ] ──▶ [ Postgres Primary ]
       └──▶ [ API Replica N ] ─┘                  └──▶ [ Read Replica ]
                    │
                    ├──▶ [ Redis ]  (rate limiting, caching, job queue)
                    │
                    └──▶ [ Celery Workers ] ──▶ [ Bedrock / LiteLLM ]
                              (AI calls happen here, not in HTTP thread)
```

---

## What You Need to Learn Next (in order)

| Step | Topic | Why |
|------|-------|-----|
| 1 | `async`/`await` syntax in Python | Understand the basics before changing anything |
| 2 | Python event loop (`asyncio`) | Know how Python manages concurrent tasks |
| 3 | `asyncpg` + SQLAlchemy async | Make DB calls non-blocking |
| 4 | `asyncio.to_thread()` | Quickest way to fix any blocking call |
| 5 | Celery + Redis | Background jobs — biggest scalability win |
| 6 | Gunicorn with multiple workers | Use all CPU cores, not just one |

---

## Key Takeaway

> FastAPI is built for async — it uses the ASGI standard which supports an event loop. But if the code *inside* your route handlers calls sync functions (like `db.query()` or `boto3.client.converse()`), the event loop is blocked anyway. The framework being async means nothing if the business logic inside it is sync.
>
> The goal: every operation that waits on a network (database, AI, external API) should use `await` so the thread is free to serve other requests during that wait.
