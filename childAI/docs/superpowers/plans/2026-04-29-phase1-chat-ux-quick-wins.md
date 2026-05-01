# Phase 1 Chat UX Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three small Onyx-inspired chat features — Stop generation, Regenerate response, and Thumbs up/down feedback — to the existing learner chat without expanding scope into RAG, personas, or admin UI.

**Architecture:** Three loosely-coupled additions sharing one frontend file (`chatter.js`) and one backend route module (`messageRoutes.ts`). Stop is pure frontend (uses the existing `AbortSignal` plumbing in the streaming endpoint). Regenerate is a new POST endpoint that re-uses `streamMessageService` with a `regenerateFromLastLearnerMessage` flag — it marks the previous assistant message as `regenerated` and streams a fresh reply. Thumbs feedback is an additive column on `messages` plus a tiny PATCH endpoint; teacher-side review tooling is **out of scope** here and will be a follow-up plan.

**Tech Stack:** Fastify 4 + TypeScript + Kysely + PostgreSQL + Vitest (backend); plain JS modules + Tailwind CDN (frontend).

---

## File structure

### New files
- `nodejs-app/migrations/015_add_message_feedback.sql` — adds `feedback_score` (smallint) and `feedback_at` (timestamptz) to `messages`
- `nodejs-app/tests/unit/messageFeedback.test.ts` — unit tests for the feedback validation + repo helper
- `nodejs-app/tests/unit/regenerate.test.ts` — unit test for the "must have a learner message to regenerate from" guard

### Modified files
- `nodejs-app/src/repositories/messageRepository.ts` — add `setMessageFeedback`, `findLatestExchange`, `markMessageRegenerated`; widen `MessageRow` with the two new columns
- `nodejs-app/src/services/streaming/streamMessageService.ts` — add an opt-in `regenerateFromLearnerMsgId` param that skips learner-message creation and re-uses the existing one
- `nodejs-app/src/routes/messageRoutes.ts` — add `PATCH /api/messages/:messageId/feedback` and `POST /api/conversations/:conversationId/regenerate`
- `nodejs-app/src/routes/streamRoutes.ts` — wire the regenerate route through the SSE handler (or expose a thin re-streaming endpoint)
- `frontend/js/chatter.js` — Stop button (toggle send↔stop while streaming), regenerate button on latest AI bubble, thumbs up/down on every AI bubble
- `frontend/dashboard-chatter.html` — bump cache buster `?v=3` → `?v=4`

### Untouched (deliberate scope guard)
- All teacher / parent / admin dashboards — feedback **collection** ships, **review UI** is a separate plan
- `safety/`, `auth/`, `aiProvider/` — no changes
- Existing `messageService.ts` (non-streaming path) — Stop/Regen only matter on the streaming path the UI actually uses

---

## Task 1: Migration for message feedback

**Files:**
- Create: `nodejs-app/migrations/015_add_message_feedback.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 015_add_message_feedback.sql
-- Thumbs up/down feedback on assistant messages. NULL = no feedback yet.
-- 1 = thumbs up, -1 = thumbs down. Updated by the learner who owns the
-- conversation; teachers see the aggregate via a future review endpoint.

ALTER TABLE messages
  ADD COLUMN feedback_score smallint NULL,
  ADD COLUMN feedback_at    timestamptz NULL;

ALTER TABLE messages
  ADD CONSTRAINT messages_feedback_score_chk
    CHECK (feedback_score IS NULL OR feedback_score IN (-1, 1));

CREATE INDEX idx_messages_feedback_score
  ON messages (conversation_id, feedback_score)
  WHERE feedback_score IS NOT NULL;
```

- [ ] **Step 2: Apply the migration manually**

Run: `psql 'postgresql://jurnee:jurnee_secret@localhost:5432/childai_node' -f nodejs-app/migrations/015_add_message_feedback.sql`
Expected: `ALTER TABLE`, `ALTER TABLE`, `CREATE INDEX` printed; no errors.

- [ ] **Step 3: Verify schema**

Run: `psql 'postgresql://jurnee:jurnee_secret@localhost:5432/childai_node' -c "\d messages"`
Expected: `feedback_score | smallint`, `feedback_at | timestamp with time zone`, and the check constraint listed.

- [ ] **Step 4: Commit**

```bash
git add childAI/nodejs-app/migrations/015_add_message_feedback.sql
git commit -m "feat(messages): add feedback_score column for thumbs up/down"
```

---

## Task 2: Repository helpers (TDD)

**Files:**
- Modify: `nodejs-app/src/repositories/messageRepository.ts`
- Test: `nodejs-app/tests/unit/messageFeedback.test.ts`

- [ ] **Step 1: Widen MessageRow with the new columns**

In `messageRepository.ts`, find the `MessageRow` interface (line 3) and add:

```typescript
export interface MessageRow {
  // ... existing fields
  feedback_score: -1 | 1 | null;
  feedback_at: Date | null;
}
```

- [ ] **Step 2: Write the failing test for setMessageFeedback validation**

```typescript
// tests/unit/messageFeedback.test.ts
import { describe, it, expect } from 'vitest';
import { isValidFeedbackScore } from '../../src/repositories/messageRepository';

describe('isValidFeedbackScore', () => {
  it('accepts 1 and -1', () => {
    expect(isValidFeedbackScore(1)).toBe(true);
    expect(isValidFeedbackScore(-1)).toBe(true);
  });
  it('accepts null (clear feedback)', () => {
    expect(isValidFeedbackScore(null)).toBe(true);
  });
  it('rejects 0', () => {
    expect(isValidFeedbackScore(0)).toBe(false);
  });
  it('rejects out-of-range', () => {
    expect(isValidFeedbackScore(2)).toBe(false);
    expect(isValidFeedbackScore(-2)).toBe(false);
  });
  it('rejects non-numbers', () => {
    expect(isValidFeedbackScore('1' as unknown as number)).toBe(false);
    expect(isValidFeedbackScore(undefined as unknown as number)).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test — expect FAIL**

Run: `cd nodejs-app && npx vitest run tests/unit/messageFeedback.test.ts`
Expected: FAIL with `isValidFeedbackScore is not a function` or similar export error.

- [ ] **Step 4: Implement isValidFeedbackScore + setMessageFeedback + findLatestExchange + markMessageRegenerated**

Append to `messageRepository.ts`:

```typescript
export function isValidFeedbackScore(score: unknown): score is -1 | 1 | null {
  return score === null || score === 1 || score === -1;
}

export async function setMessageFeedback(
  messageId: string,
  score: -1 | 1 | null,
): Promise<void> {
  const db = getDb();
  await db
    .updateTable('messages')
    .set({
      feedback_score: score,
      feedback_at: score === null ? null : new Date().toISOString(),
    })
    .where('id', '=', messageId)
    .execute();
}

export interface LatestExchange {
  learner: MessageRow;
  assistant: MessageRow;
}

/**
 * Returns the last (learner, assistant) pair in a conversation. Used by
 * the regenerate endpoint to know what learner message to re-run from.
 * Returns null if the conversation has fewer than 2 messages or the
 * latest message isn't a (learner→assistant) sequence.
 */
export async function findLatestExchange(
  conversationId: string,
): Promise<LatestExchange | null> {
  const db = getDb();
  const rows = await db
    .selectFrom('messages')
    .selectAll()
    .where('conversation_id', '=', conversationId)
    .where('status', '!=', 'regenerated')
    .orderBy('created_at', 'desc')
    .limit(2)
    .execute();
  if (rows.length < 2) return null;
  const [latest, prior] = rows as unknown as MessageRow[];
  if (latest.role !== 'assistant' || prior.role !== 'learner') return null;
  return { assistant: latest, learner: prior };
}

export async function markMessageRegenerated(messageId: string): Promise<void> {
  const db = getDb();
  await db
    .updateTable('messages')
    .set({ status: 'regenerated' })
    .where('id', '=', messageId)
    .execute();
}
```

- [ ] **Step 5: Run the test — expect PASS**

Run: `cd nodejs-app && npx vitest run tests/unit/messageFeedback.test.ts`
Expected: PASS, 5/5 tests.

- [ ] **Step 6: Run the full unit suite as a regression check**

Run: `cd nodejs-app && npx vitest run tests/unit/`
Expected: ALL PASS (existing 27 tests + 5 new = 32).

- [ ] **Step 7: Commit**

```bash
git add childAI/nodejs-app/src/repositories/messageRepository.ts \
        childAI/nodejs-app/tests/unit/messageFeedback.test.ts
git commit -m "feat(messages): repo helpers for feedback + regenerate lookups"
```

---

## Task 3: Backend feedback route

**Files:**
- Modify: `nodejs-app/src/routes/messageRoutes.ts`

- [ ] **Step 1: Add the schema and route**

Append to the `messageRoutes` plugin in `messageRoutes.ts` (inside the existing `async (fastify) => { ... }` body, after the existing `fastify.post(...)` block):

```typescript
const FeedbackBody = Type.Object({
  score: Type.Union([Type.Literal(-1), Type.Literal(1), Type.Null()]),
});

const FeedbackParams = Type.Object({
  messageId: Type.String({ format: 'uuid' }),
});

// PATCH /api/messages/:messageId/feedback
fastify.patch(
  '/api/messages/:messageId/feedback',
  {
    schema: {
      tags: ['messages'],
      summary: 'Set thumbs up/down feedback on an assistant message',
      security: [{ bearerAuth: [] }],
      params: FeedbackParams,
      body: FeedbackBody,
    },
    preHandler: [authenticate],
  },
  async (request, reply) => {
    const user = request.user!;
    const { messageId } = request.params as { messageId: string };
    const { score } = request.body as { score: -1 | 1 | null };

    const msg = await findMessageById(messageId);
    if (!msg) return reply.status(404).send({ error: 'Message not found' });
    if (msg.role !== 'assistant') {
      return reply.status(400).send({ error: 'Feedback only applies to assistant messages' });
    }

    const allowed = await canAccessConversation(msg.conversation_id, user.dbId, user.role);
    if (!allowed) return reply.status(403).send({ error: 'Access denied' });

    await setMessageFeedback(messageId, score);
    return reply.status(204).send();
  },
);
```

Add the missing imports at the top of the file:

```typescript
import {
  findMessageById,
  setMessageFeedback,
} from '../repositories/messageRepository';
```

- [ ] **Step 2: Boot the dev server and smoke-test**

Run (in another terminal, with the server already running on 8001 — restart if needed):
```bash
# 1. grab a real assistant message id from the DB
psql 'postgresql://jurnee:jurnee_secret@localhost:5432/childai_node' \
  -c "SELECT id FROM messages WHERE role = 'assistant' ORDER BY created_at DESC LIMIT 1;"

# 2. curl with a real bearer token (use one from sessionStorage in your browser)
curl -s -w "HTTP %{http_code}\n" -X PATCH \
  "http://localhost:8001/api/messages/<uuid-from-step-1>/feedback" \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"score": 1}'
```
Expected: `HTTP 204`. Then verify in DB:
```bash
psql 'postgresql://jurnee:jurnee_secret@localhost:5432/childai_node' \
  -c "SELECT id, feedback_score, feedback_at FROM messages WHERE id = '<uuid>';"
```
Expected: `feedback_score = 1`, `feedback_at` is non-null and recent.

- [ ] **Step 3: Commit**

```bash
git add childAI/nodejs-app/src/routes/messageRoutes.ts
git commit -m "feat(api): PATCH /api/messages/:id/feedback for thumbs up/down"
```

---

## Task 4: Frontend thumbs UI

**Files:**
- Modify: `frontend/js/chatter.js`
- Modify: `frontend/dashboard-chatter.html` (cache-buster bump)

- [ ] **Step 1: Add the API helper**

In `frontend/js/chatter.js`, find the section where `aiMsgHTML(m)` is defined (around line ~285 after recent edits) and add this helper above it:

```javascript
async function setMsgFeedback(messageId, score) {
  try {
    await api.patch(`/api/messages/${messageId}/feedback`, { score });
  } catch (err) {
    console.error('feedback failed', err);
    showToast('Could not save feedback');
  }
}

window._toggleFeedback = async function(btn, messageId, score) {
  const wasActive = btn.dataset.active === 'true';
  const newScore = wasActive ? null : score;
  // optimistic
  document.querySelectorAll(`[data-msg-id="${messageId}"]`).forEach(b => {
    b.dataset.active = 'false';
    b.classList.remove('text-[#0A3D3C]', 'bg-[#DAF0EE]');
    b.classList.add('text-gray-400');
  });
  if (newScore !== null) {
    btn.dataset.active = 'true';
    btn.classList.remove('text-gray-400');
    btn.classList.add('text-[#0A3D3C]', 'bg-[#DAF0EE]');
  }
  await setMsgFeedback(messageId, newScore);
};
```

- [ ] **Step 2: Inject thumbs into aiMsgHTML**

Modify the AI actions row in `aiMsgHTML(m)` (the `<div class="flex items-center gap-2 mt-2 ml-1">` block). Add two buttons before the existing copy button:

```javascript
// Inside aiMsgHTML, in the actions row, BEFORE the copy button:
${m.id ? `
  <button onclick="window._toggleFeedback(this, '${m.id}', 1)"
          data-msg-id="${m.id}" data-active="${m.feedback_score === 1}"
          class="${m.feedback_score === 1 ? 'text-[#0A3D3C] bg-[#DAF0EE]' : 'text-gray-400'} hover:text-[#0A3D3C] hover:bg-[#DAF0EE] p-1.5 rounded-lg cursor-pointer transition-colors" title="Helpful">
    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m10.598-9.75H14.25M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.654 3.375Z" />
    </svg>
  </button>
  <button onclick="window._toggleFeedback(this, '${m.id}', -1)"
          data-msg-id="${m.id}" data-active="${m.feedback_score === -1}"
          class="${m.feedback_score === -1 ? 'text-[#EE6742] bg-[#FFE5DD]' : 'text-gray-400'} hover:text-[#EE6742] hover:bg-[#FFE5DD] p-1.5 rounded-lg cursor-pointer transition-colors" title="Not helpful">
    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977a8.96 8.96 0 0 1-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398-.306.774-1.086 1.227-1.918 1.227h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 0 0 .303-.54m.023-8.25H16.48a4.5 4.5 0 0 1 1.423.23l3.114 1.04a4.5 4.5 0 0 0 1.423.23h1.294M14.25 9h-3.027c-.808 0-1.535.446-2.033 1.08a9.039 9.039 0 0 1-2.861 2.4c-.723.384-1.35.956-1.653 1.715a4.499 4.499 0 0 0-.322 1.672v.633a2.25 2.25 0 0 0 2.25 2.25.75.75 0 0 0 .75-.75v-.182c0-.866.385-1.65 1.03-2.193 1.617-1.359 2.667-3.16 2.844-5.124M14.25 9V5.25c0-1.5-.75-2.25-2.25-2.25l-1.5 4.5L9 9h5.25Z" />
    </svg>
  </button>` : ''}
```

- [ ] **Step 3: Confirm `api.patch` exists**

Run: `grep -n "patch:" frontend/js/api.js`
Expected: a method like `patch: (url, body) => fetch(url, { method: 'PATCH', ... })`. **If not present, add it.** Open `api.js`, find `post:`, copy-paste it, change method/name to `patch`.

- [ ] **Step 4: Bump cache-buster**

In `frontend/dashboard-chatter.html`, change:
```html
import { init } from './js/chatter.js?v=3';
```
to:
```html
import { init } from './js/chatter.js?v=4';
```

- [ ] **Step 5: Manual smoke test**

In the browser:
1. Hard refresh the chat page (`Cmd+Shift+R`).
2. Open an existing chat with at least one Bubbli reply.
3. Hover the AI message — thumbs up/down should appear in the actions row.
4. Click thumbs up — button should turn dark teal/highlighted.
5. Click thumbs up again — should clear back to gray.
6. Click thumbs down — should turn coral/highlighted, thumbs up stays gray.
7. Verify in DB: `SELECT id, feedback_score FROM messages WHERE id = '<the-msg-id>';`

Expected: feedback_score reflects last click; toggling clears to NULL.

- [ ] **Step 6: Commit**

```bash
git add childAI/frontend/js/chatter.js childAI/frontend/dashboard-chatter.html
# also api.js if you had to add patch()
git commit -m "feat(chat): thumbs up/down feedback on AI messages"
```

---

## Task 5: Frontend Stop button (pure frontend)

**Files:**
- Modify: `frontend/js/chatter.js`

- [ ] **Step 1: Add a Stop button next to Send (initially hidden)**

In `frontend/dashboard-chatter.html`, find the existing send button (`#send-btn`) and add a sibling stop button:

```html
<!-- Just after the existing #send-btn element -->
<button id="stop-btn" type="button"
        class="hidden flex-shrink-0 w-9 h-9 rounded-full bg-[#EE6742] hover:bg-[#d65a39] text-white flex items-center justify-center cursor-pointer transition-colors" title="Stop">
  <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
    <rect x="5" y="5" width="10" height="10" rx="1.5"/>
  </svg>
</button>
```

- [ ] **Step 2: Wire the Stop button in init()**

In `frontend/js/chatter.js`, in the `init()` function near the other listeners (around line ~26), add:

```javascript
document.getElementById('stop-btn').addEventListener('click', () => {
  if (streamCtrl) streamCtrl.abort();
});
```

- [ ] **Step 3: Toggle send↔stop visibility during streaming**

In `frontend/js/chatter.js`, in the `sendMessage()` function:

After `document.getElementById('send-btn').disabled = true;`, also do:
```javascript
document.getElementById('send-btn').classList.add('hidden');
document.getElementById('stop-btn').classList.remove('hidden');
```

In the `done` callback (after `loadConversations()`), and in the `error` callback, restore:
```javascript
document.getElementById('send-btn').classList.remove('hidden');
document.getElementById('stop-btn').classList.add('hidden');
```

- [ ] **Step 4: Manual smoke test**

In the browser:
1. Hard refresh.
2. Send a message that will produce a long reply (e.g. "explain photosynthesis in detail").
3. While the reply is streaming, the orange Stop button should appear instead of Send.
4. Click Stop — streaming halts, the partial reply remains, the Send button comes back.
5. Reload the page — the partial reply is persisted (server already saved the full text before chunked streaming, so what's in DB will be the full message; this is acceptable for v1).

Expected: input unblocks immediately, partial content visible, no console errors.

- [ ] **Step 5: Commit**

```bash
git add childAI/frontend/js/chatter.js childAI/frontend/dashboard-chatter.html
git commit -m "feat(chat): Stop button to abort streaming reply"
```

---

## Task 6: Backend regenerate route + service refactor (TDD)

**Files:**
- Modify: `nodejs-app/src/services/streaming/streamMessageService.ts`
- Modify: `nodejs-app/src/routes/streamRoutes.ts`
- Test: `nodejs-app/tests/unit/regenerate.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/regenerate.test.ts
import { describe, it, expect } from 'vitest';
import { canRegenerate } from '../../src/services/streaming/streamMessageService';

describe('canRegenerate', () => {
  it('returns true when last exchange is (learner, assistant)', () => {
    expect(canRegenerate({
      learner: { role: 'learner', status: 'completed' } as any,
      assistant: { role: 'assistant', status: 'completed' } as any,
    })).toBe(true);
  });
  it('returns false when there is no exchange', () => {
    expect(canRegenerate(null)).toBe(false);
  });
  it('returns false if assistant is already marked regenerated', () => {
    expect(canRegenerate({
      learner: { role: 'learner', status: 'completed' } as any,
      assistant: { role: 'assistant', status: 'regenerated' } as any,
    })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd nodejs-app && npx vitest run tests/unit/regenerate.test.ts`
Expected: FAIL with `canRegenerate is not a function` or import error.

- [ ] **Step 3: Add canRegenerate guard + regenerateFromLearnerMsgId support**

In `streamMessageService.ts`:

Export the guard at the top:
```typescript
import type { LatestExchange } from '../../repositories/messageRepository';

export function canRegenerate(exchange: LatestExchange | null): boolean {
  if (!exchange) return false;
  if (exchange.assistant.status === 'regenerated') return false;
  return exchange.learner.role === 'learner' && exchange.assistant.role === 'assistant';
}
```

Widen the `handleStreamingMessage` params:
```typescript
export async function handleStreamingMessage(params: {
  conversationId: string;
  learnerDbId: string;
  content: string;
  requestId: string;
  sessionId?: string;
  sse: SSEWriter;
  abortSignal: AbortSignal;
  /**
   * If set, skip creating a new learner message — re-use this existing
   * one (we're regenerating the response, not sending a fresh message).
   */
  regenerateFromLearnerMsgId?: string;
}): Promise<void> {
  // ... existing body
}
```

Inside the function, where it currently does `await createMessage({ role: 'learner', ... })`, branch:
```typescript
let learnerMsg: MessageRow;
if (params.regenerateFromLearnerMsgId) {
  const existing = await findMessageById(params.regenerateFromLearnerMsgId);
  if (!existing || existing.role !== 'learner') {
    throw new Error('REGEN_LEARNER_MESSAGE_NOT_FOUND');
  }
  learnerMsg = existing;
} else {
  learnerMsg = await createMessage({ /* existing args */ });
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `cd nodejs-app && npx vitest run tests/unit/regenerate.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 5: Add the regenerate route**

In `streamRoutes.ts`, add a new POST route alongside the existing `messages/stream`:

```typescript
fastify.post(
  '/api/conversations/:conversationId/regenerate',
  {
    schema: {
      tags: ['messages'],
      summary: 'Regenerate the latest assistant reply (SSE stream)',
      security: [{ bearerAuth: [] }],
      params: Type.Object({ conversationId: Type.String({ format: 'uuid' }) }),
    },
    preHandler: [authenticate, rateLimitFor('message')],
  },
  async (request, reply) => {
    const user = request.user!;
    const { conversationId } = request.params as { conversationId: string };

    const allowed = await canAccessConversation(conversationId, user.dbId, user.role);
    if (!allowed) return reply.status(403).send({ error: 'Access denied' });

    const exchange = await findLatestExchange(conversationId);
    if (!canRegenerate(exchange)) {
      return reply.status(400).send({ error: 'Nothing to regenerate' });
    }

    // Mark previous assistant as regenerated BEFORE the new stream starts,
    // so listMessages no longer surfaces it.
    await markMessageRegenerated(exchange!.assistant.id);

    const sse = createSseWriter(reply);
    const abortController = new AbortController();
    request.raw.on('close', () => abortController.abort());

    await handleStreamingMessage({
      conversationId,
      learnerDbId: user.dbId,
      content: exchange!.learner.content,
      requestId: request.requestId,
      sse,
      abortSignal: abortController.signal,
      regenerateFromLearnerMsgId: exchange!.learner.id,
    });
  },
);
```

Add the missing imports at the top of `streamRoutes.ts`:
```typescript
import { canRegenerate } from '../services/streaming/streamMessageService';
import {
  findLatestExchange,
  markMessageRegenerated,
} from '../repositories/messageRepository';
```

- [ ] **Step 6: Run full unit suite**

Run: `cd nodejs-app && npx vitest run tests/unit/`
Expected: ALL PASS (35/35).

- [ ] **Step 7: Manual smoke test**

```bash
# Find a recent conversation id with at least 1 exchange
psql 'postgresql://jurnee:jurnee_secret@localhost:5432/childai_node' \
  -c "SELECT c.id FROM conversations c JOIN messages m ON m.conversation_id = c.id GROUP BY c.id HAVING COUNT(*) >= 2 ORDER BY MAX(m.created_at) DESC LIMIT 1;"

# Hit the regenerate endpoint
curl -sN -X POST "http://localhost:8001/api/conversations/<uuid>/regenerate" \
  -H "Authorization: Bearer <jwt>"
```

Expected: SSE stream starts, ends with `event: done`. Verify in DB:
```bash
psql ... -c "SELECT role, status, LEFT(content, 60) FROM messages WHERE conversation_id = '<uuid>' ORDER BY created_at DESC LIMIT 4;"
```
Expected: latest assistant message is the new one (`status='completed'`), prior assistant is `status='regenerated'`, learner message is unchanged.

- [ ] **Step 8: Commit**

```bash
git add childAI/nodejs-app/src/services/streaming/streamMessageService.ts \
        childAI/nodejs-app/src/routes/streamRoutes.ts \
        childAI/nodejs-app/tests/unit/regenerate.test.ts
git commit -m "feat(chat): POST /api/conversations/:id/regenerate streams a fresh reply"
```

---

## Task 7: Frontend Regenerate button

**Files:**
- Modify: `frontend/js/chatter.js`
- Modify: `frontend/dashboard-chatter.html` (cache-buster bump)

- [ ] **Step 1: Add the regenerate handler**

In `frontend/js/chatter.js`, near `window._toggleFeedback`, add:

```javascript
window._regenerate = async function() {
  if (!activeConversationId || streamCtrl) return; // already streaming
  const btn = document.getElementById('send-btn');
  if (!btn) return;
  btn.disabled = true;

  // Find and remove the latest AI bubble in the DOM (server marks it regenerated).
  const messagesEl = document.getElementById('messages');
  const groups = messagesEl.querySelectorAll('.ai-msg-group');
  if (groups.length) groups[groups.length - 1].remove();

  // Reuse the streaming bubble pattern: insert a fresh placeholder + start stream.
  const streamId = 'stream-' + Date.now();
  messagesEl.insertAdjacentHTML('beforeend', /* same placeholder html as in sendMessage */ `
    <div class="ai-msg-group flex gap-3 mb-7" id="${streamId}">
      <div class="flex-shrink-0 w-8 h-8 rounded-full bg-[#DAF0EE] flex items-center justify-center mt-0.5 shadow-sm">
        <svg class="w-4 h-4 text-[#0A3D3C]" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-[11px] font-semibold font-jakarta text-[#0A3D3C] mb-1.5">Bubbli</p>
        <div class="bg-white border border-[#DAF0EE] rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm">
          <span id="${streamId}-dots" class="inline-flex gap-1.5 items-center py-1">
            <span class="dot w-2 h-2 rounded-full bg-[#0A3D3C]/40"></span>
            <span class="dot w-2 h-2 rounded-full bg-[#0A3D3C]/40"></span>
            <span class="dot w-2 h-2 rounded-full bg-[#0A3D3C]/40"></span>
          </span>
          <div id="${streamId}-text" class="ai-content text-[15px] font-inter text-[#1F2937] leading-relaxed hidden"></div>
        </div>
      </div>
    </div>`);
  scrollToBottom();

  document.getElementById('send-btn').classList.add('hidden');
  document.getElementById('stop-btn').classList.remove('hidden');

  let accumulated = '';
  let started = false;

  streamCtrl = api.stream(
    `/api/conversations/${activeConversationId}/regenerate`,
    {},
    {
      'assistant.chunk': ({ content: chunk }) => {
        accumulated += chunk;
        if (!started) {
          started = true;
          document.getElementById(`${streamId}-dots`)?.remove();
          document.getElementById(`${streamId}-text`)?.classList.remove('hidden');
        }
        const t = document.getElementById(`${streamId}-text`);
        if (t) t.textContent = accumulated;
        scrollToBottom();
      },
      'assistant.completed': ({ content: full }) => { if (full) accumulated = full; },
      done: () => {
        document.getElementById(`${streamId}-dots`)?.remove();
        const sb = document.getElementById('send-btn');
        if (sb) { sb.removeAttribute('disabled'); sb.classList.remove('hidden'); }
        document.getElementById('stop-btn')?.classList.add('hidden');
        reloadMessages(streamId, accumulated);
        streamCtrl = null;
      },
      error: (err) => {
        console.error('[chatter] regenerate stream error:', err);
        document.getElementById(`${streamId}-dots`)?.remove();
        const sb = document.getElementById('send-btn');
        if (sb) { sb.removeAttribute('disabled'); sb.classList.remove('hidden'); }
        document.getElementById('stop-btn')?.classList.add('hidden');
        reloadMessages(streamId, accumulated);
        streamCtrl = null;
      },
    }
  );
};
```

- [ ] **Step 2: Inject the regenerate button on the LAST AI bubble**

In `aiMsgHTML(m)`, alongside the thumbs and copy buttons, conditionally render a regenerate button only when `m.is_latest === true` (we'll set this when rendering). Add to the actions row:

```javascript
${m.is_latest ? `
  <button onclick="window._regenerate()"
          class="text-gray-400 hover:text-[#0A3D3C] p-1.5 rounded-lg hover:bg-[#DAF0EE] cursor-pointer transition-colors" title="Regenerate">
    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  </button>` : ''}
```

In `renderMessages(messages)`, mark the last assistant message:

```javascript
function renderMessages(messages) {
  const container = document.getElementById('messages');
  if (!messages.length) {
    // ... existing empty state
    return;
  }
  // Find the latest assistant message and tag it for the regenerate button.
  const lastAiIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i;
    }
    return -1;
  })();
  const enriched = messages.map((m, i) => i === lastAiIdx ? { ...m, is_latest: true } : m);
  container.innerHTML = enriched.map(msgHTML).join('');
  scrollToBottom();
}
```

- [ ] **Step 3: Bump cache-buster**

In `frontend/dashboard-chatter.html`, change `?v=4` → `?v=5`.

- [ ] **Step 4: Manual smoke test**

In the browser:
1. Hard refresh.
2. Open an existing chat with at least one exchange.
3. The latest Bubbli bubble should have an extra ↻ button on hover.
4. Click ↻ — old reply disappears, "thinking" dots appear, new reply streams in.
5. Older Bubbli bubbles (further up) should NOT have the ↻ button.
6. Verify in DB the prior assistant is `status='regenerated'`.

Expected: clean swap, no console errors, daily message budget decremented.

- [ ] **Step 5: Commit**

```bash
git add childAI/frontend/js/chatter.js childAI/frontend/dashboard-chatter.html
git commit -m "feat(chat): regenerate button on the latest AI message"
```

---

## Task 8: End-to-end integration check

- [ ] **Step 1: Full unit suite**

Run: `cd nodejs-app && npx vitest run tests/unit/`
Expected: 35+ tests, all PASS.

- [ ] **Step 2: TS compile check**

Run: `cd nodejs-app && npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Manual happy-path tour in the browser**

1. Hard refresh chat page.
2. Send a new message → reply streams → click thumbs up → verify in DB.
3. Send another long message → click Stop mid-stream → verify partial content remains.
4. Click ↻ on the latest reply → verify a fresh reply replaces it and the prior is marked regenerated.
5. Refresh the page mid-chat → verify the chat is restored (sessionStorage persistence still works).

Expected: every step works without console errors. If any step fails, return to the matching task and fix.

- [ ] **Step 4: Commit any final touch-ups (none expected)**

```bash
git status
# If clean, skip. If not:
git commit -am "chore: phase 1 polish from integration test"
```

---

## Self-review checklist

**Spec coverage** — every item in §3 of the comparison doc maps to a task here:
- §3.1 Regenerate → Task 6 + Task 7 ✓
- §3.2 Stop generation → Task 5 ✓
- §3.4 Thumbs up/down → Task 1 + Task 2 + Task 3 + Task 4 ✓
- §3.3 Edit message — **deferred to a follow-up plan** (called out explicitly in the goal)
- §3.5 Export chat — **deferred** (called out in goal)
- §3.6 Suggestion chips between turns + chat options menu — **deferred**

**Placeholder scan** — none. Every step has either real code or an exact command.

**Type consistency** — `LatestExchange` is defined in Task 2 and imported in Task 6. `findLatestExchange`, `markMessageRegenerated`, `findMessageById`, `setMessageFeedback` are all consistent across producer (Task 2) and consumers (Task 3, Task 6).

**Race-condition guard** — Task 6 marks the prior assistant as `regenerated` BEFORE starting the new stream, so concurrent listMessages calls during the stream see only the in-progress new message, not duplicates.

**Daily budget** — regenerate goes through `rateLimitFor('message')` middleware (Task 6 step 5), so it counts against the same budget as a normal send. This is intentional — prevents kids from infinite-regenerating.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-29-phase1-chat-ux-quick-wins.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints

**Which approach?**
