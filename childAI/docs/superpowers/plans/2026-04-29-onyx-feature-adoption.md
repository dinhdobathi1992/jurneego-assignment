# Onyx → ChildAI: Feature Adoption Plan

> **Scope:** This is a comparison + adoption roadmap, not a single-feature implementation
> plan. It catalogs Onyx's feature surface (~140 features), compares it against ChildAI's
> current feature set, and recommends which Onyx features to adopt — prioritized by
> child-safety alignment, effort, and value. Each "Top pick" includes enough detail to
> kick off a follow-up TDD plan via `superpowers:writing-plans` if/when greenlit.

**Source clone:** `/Users/thi/Devops/JurneeGo_Assignment/childAI/onyx-reference/` (gitignored, shallow `--depth 1` clone of `https://github.com/onyx-dot-app/onyx`)

**ChildAI snapshot point:** commit `6d23d89` on branch `feature/onyx-frontend-integration` (post-Onyx-revert), plus uncommitted UI work (auto-title, timestamps, sessionStorage persistence).

---

## 1. Executive summary

Onyx is an **enterprise knowledge-assistant platform** — heavy on RAG, connectors, and team workflows. ChildAI is a **child-safety-first single-purpose tutor**. The overlap is narrow but high-value: chat-UX polish, agent variety, and a small subset of knowledge/RAG features make sense. Most of Onyx's surface area (50+ generic connectors, code interpreter, web search, multi-tenancy, SAML/SCIM, knowledge graph) is **wrong-audience** for kids and should be ignored.

**Recommendation:** Pick **5 quick wins** and **3 medium investments**, ship in two phases over ~2 weeks. Skip the long tail.

| Phase | Features | Estimated effort |
|-------|----------|------------------|
| Phase 1 — UX polish | Regenerate, Stop generation, Edit message, Bookmarks, Export chat | ~3 days |
| Phase 2 — Variety & curation | Personas (Bubbli modes), Standard answers, Curated knowledge sets | ~5–7 days |
| Phase 3 — Optional | TTS read-aloud, Image upload (homework photos), Subject folders | ~5 days |

**Out of scope (deliberately):** web search, code interpreter, generic connectors, API keys for learners, knowledge graph, SAML/SCIM, multi-tenancy, MCP servers, federated search.

---

## 2. Side-by-side comparison

### Chat & messaging

| Feature | Onyx | ChildAI | Action |
|---------|:----:|:-------:|--------|
| Multi-turn sessions | ✅ | ✅ | — |
| SSE streaming | ✅ | ✅ | — |
| Auto-title from first message | ✅ | ✅ (just added) | — |
| Timestamps on messages | ✅ | ✅ (just added) | — |
| **Regenerate response** | ✅ | ❌ | **Adopt** (P1) |
| **Stop / abort generation** | ✅ | ❌ (frontend) | **Adopt** (P1) |
| **Edit a sent message** | ✅ | ❌ | **Adopt** (P1) |
| Branching (alternate replies) | ✅ | ❌ | Skip — adds complexity, not core for kids |
| Multi-LLM parallel compare | ✅ | ❌ | Skip |
| Suggestion chips on welcome | ✅ | ✅ | — |
| **Suggestion chips between turns** | ✅ | ❌ | Adopt (P1, small) |
| **Search across all chats** | ✅ (semantic) | ⚠️ (title-only) | **Adopt** (P2) — keyword first, semantic later |
| **Pin / favorite chat** | ✅ | ❌ | Adopt (P3) |
| **Export chat (PDF/markdown)** | ✅ | ❌ | **Adopt** (P1) — important for parent/teacher review |
| Anonymous chat links | ✅ | ❌ | Skip — not safe for unauthed kids |
| Shared session (read-only) | ✅ | ✅ (parent/teacher view) | — |

### Personas / Agents

| Feature | Onyx | ChildAI | Action |
|---------|:----:|:-------:|--------|
| **Multiple agents/personas** | ✅ | ❌ (single Bubbli) | **Adopt** (P2) — Math/Story/Science Bubbli |
| Per-agent system prompt | ✅ | ⚠️ (one global) | **Adopt** (P2, with personas) |
| Per-agent LLM model | ✅ | ❌ | Defer — not needed for one school |
| Agent visibility (public/private) | ✅ | ❌ | Defer |
| Agent labels / categories | ✅ | ❌ | Adopt (P2, small) — by school subject |
| Featured / pinned agents | ✅ | ❌ | Adopt (P3) |

### Tools

| Feature | Onyx | ChildAI | Action |
|---------|:----:|:-------:|--------|
| Web search | ✅ | ❌ | **Skip** — internet for kids needs heavy moderation we don't have |
| Code execution sandbox | ✅ | ❌ | **Skip** — high risk, niche |
| Image generation (DALL·E) | ✅ | ❌ | Skip — content-safety hard |
| **File reader (PDF, DOCX)** | ✅ | ❌ | **Adopt** (P3) — kid uploads homework |
| Custom OpenAPI tools | ✅ | ❌ | Skip — attack surface |
| MCP servers | ✅ | ❌ | Skip — complexity |
| Knowledge-base search (RAG) | ✅ | ❌ | **Adopt** (P2) — curated only |
| **Calculator / dictionary tool** | ❌ in Onyx, but trivial | ❌ | Optional (P3) — kid-friendly utility tools |

### RAG / Knowledge

| Feature | Onyx | ChildAI | Action |
|---------|:----:|:-------:|--------|
| 50+ data connectors | ✅ | ❌ | **Skip** — Slack/Confluence/etc. wrong audience |
| **Document sets** (curated content) | ✅ | ❌ | **Adopt** (P2) — pre-vetted textbooks/articles |
| Hybrid (vector + keyword) search | ✅ | ❌ | Adopt simpler version (P2) |
| Citations on responses | ✅ | ❌ | **Adopt** (P2, with RAG) |
| Embedding model selection | ✅ | ❌ | Defer — pick one (e.g. `text-embedding-3-small`) |
| Knowledge graph | ✅ [EE] | ❌ | Skip |
| User file uploads | ✅ | ❌ | Adopt with image upload (P3) |

### Sharing & collaboration

| Feature | Onyx | ChildAI | Action |
|---------|:----:|:-------:|--------|
| Share chat with link | ✅ | ✅ (kid → parent/teacher) | — |
| Team projects / folders | ✅ [EE] | ❌ | Adopt simpler (P3) — chats grouped by subject |
| Public agents | ✅ | ❌ | Defer |
| Invite workflow | ✅ | ⚠️ (admin invites only) | — |

### Auth & permissions

| Feature | Onyx | ChildAI | Action |
|---------|:----:|:-------:|--------|
| Email/password | ✅ | ❌ | Defer — Google OAuth is enough |
| Google OAuth | ✅ | ✅ | — |
| OIDC / SAML SSO | ✅ [EE] | ❌ | Skip — overkill |
| Role-based access | ✅ [EE] | ✅ (learner / parent / teacher / admin) | — |
| User groups / classrooms | ✅ [EE] | ✅ | — |
| API keys / PATs | ✅ | ❌ | Skip for learners; consider for teachers (P3) |
| Document permissions | ✅ [EE] | ❌ | N/A — see RAG |
| Impersonation (admin) | ✅ [EE] | ❌ | Defer |

### Admin / settings

| Feature | Onyx | ChildAI | Action |
|---------|:----:|:-------:|--------|
| Workspace settings | ✅ | ⚠️ (env-only) | Defer |
| Custom branding | ✅ [EE] | ⚠️ (single brand: Bubbli) | — |
| LLM provider mgmt UI | ✅ | ❌ (env-only) | Defer — config through env is fine |
| **Standard answers** (canned responses) | ✅ | ❌ | **Adopt** (P2) — pre-vetted answers for common kid questions |
| Webhooks / hooks | ✅ [EE] | ❌ | Skip |
| Feature flags | ✅ [EE] | ❌ | Defer |
| Audit log | ⚠️ (Q&A history) | ✅ (full audit_events table) | We're ahead |

### Notifications & feedback

| Feature | Onyx | ChildAI | Action |
|---------|:----:|:-------:|--------|
| **Notification bell** | ✅ | ❌ | **Adopt** (P2) — parent notes, flag alerts |
| Thumbs up/down on messages | ✅ | ❌ | **Adopt** (P1, small) — feedback signal for moderation |
| Email notifications | ✅ [EE] | ❌ | Defer |
| Release-notes notifications | ✅ | ❌ | Skip |

### Files & attachments

| Feature | Onyx | ChildAI | Action |
|---------|:----:|:-------:|--------|
| Image paste/drop | ✅ | ❌ | Adopt with upload (P3) |
| **PDF/Doc file upload** | ✅ | ❌ | Adopt (P3) — homework help |
| Image safety scan | ❌ (out of scope for them) | ❌ | **Required if we adopt upload** |
| Drag-and-drop | ✅ | ❌ | Adopt with upload (P3) |

### UX polish

| Feature | Onyx | ChildAI | Action |
|---------|:----:|:-------:|--------|
| Command palette (`Cmd+K`) | ✅ | ❌ | Adopt (P3, small) |
| Keyboard shortcuts | ✅ | ⚠️ (Enter-to-send only) | Adopt incrementally |
| Dark mode | ✅ | ❌ | Defer — kids on tablets, prefer light |
| Mobile-responsive | ✅ | ⚠️ (mostly) | Audit + polish (ongoing) |
| Hover tooltips | ✅ | ⚠️ (some) | Polish |
| Toast notifications | ✅ | ✅ | — |
| **Read-aloud (TTS)** | ❌ in Onyx | ❌ | **Adopt** (P3) — accessibility for non-readers |

### Operational / infra

| Feature | Onyx | ChildAI | Action |
|---------|:----:|:-------:|--------|
| Token rate limiting | ✅ | ✅ (daily message budget) | — |
| Token budgets | ✅ | ✅ | — |
| Background workers (Celery) | ✅ | ❌ | Adopt as needed (e.g., RAG indexing) |
| Vector DB | ✅ (Vespa) | ❌ | Adopt with RAG (P2) — pgvector is enough |
| Multi-tenancy | ✅ [EE] | ❌ | Skip |
| Multi-LLM provider router | ⚠️ (manual) | ✅ (mock/bedrock/litellm/9router with circuit breaker) | We're ahead |
| Multi-layer safety | ❌ | ✅ (keyword + LLM) | We're ahead |

### What ChildAI has that Onyx doesn't

These are **moats** worth keeping and pitching:
- **Multi-layer safety pipeline** (`safety/safetyService.ts`) — keyword/regex + LLM-based, with kid-friendly deflections per flag type
- **Daily message budget per learner** (`rateLimit/limiter.ts`)
- **Adult guidance** (parent/teacher leaves notes the kid sees) — no Onyx equivalent
- **Learning objectives** linked to conversations
- **Per-message translation** (`translationRepository.ts`)
- **Session analytics** (`session_analytics` table) — kid-engagement signal, not enterprise BI
- **Classroom-aware role model** (teacher ↔ students, parent ↔ child) — Onyx has groups but not the family/school context

---

## 3. Top picks — Phase 1 (UX wins, ~3 days)

These are small, high-impact additions that make ChildAI feel as polished as Onyx without changing the safety story.

### 3.1 Regenerate response

**Why:** Kid asks "what's photosynthesis?" — first answer is too dense. They want a simpler one. Today they have to retype.

**Sketch:**
- **Backend:** new endpoint `POST /api/conversations/:id/messages/:messageId/regenerate` — re-runs the AI with the same input, replacing the stored assistant message. Re-runs safety check.
- **Frontend:** add a "↻ Regenerate" button in the AI message hover-actions row (next to the existing copy button).
- **Edge cases:** can only regenerate the LATEST AI message (avoid breaking thread integrity). Increment a `regeneration_count` on the message for audit.
- **Files:** `messageRoutes.ts` (new route), `messageService.ts` (refactor send to share regen path), `chatter.js` (button + handler).

### 3.2 Stop generation

**Why:** Kid hits send, sees the answer is going off-topic, wants to cut it.

**Sketch:**
- **Backend:** Already supports `AbortSignal` in streamMessageService. Just need a way for the client to signal abort. EventSource doesn't support body, so use the existing `streamCtrl` from `chatter.js` — call `.abort()` on it.
- **Frontend:** While streaming, swap the send button for a "Stop" button. On click, call `streamCtrl.abort()`, persist the partial message.
- **Files:** `chatter.js` only (UI change). Maybe one fix in streamMessageService to mark partial messages as `status: 'aborted'`.

### 3.3 Edit a sent message

**Why:** Kid mistypes, wants to fix without starting over.

**Sketch:**
- **Backend:** new endpoint `PATCH /api/messages/:id` — only allowed on learner's own latest message AND only if no AI reply yet (or with explicit "regenerate after edit").
- **Frontend:** pencil icon on hover on user bubble → inline edit textarea → save → calls PATCH → re-renders bubble.
- **Files:** `messageRoutes.ts`, `messageRepository.ts` (`updateMessageContent`), `chatter.js`.

### 3.4 Thumbs up/down on AI messages

**Why:** Free moderation signal; helps teachers spot bad responses without manual review.

**Sketch:**
- **Migration:** add `feedback_score` (smallint: -1, 0, +1) and `feedback_at` to `messages` table.
- **Backend:** `POST /api/messages/:id/feedback` body `{ score: -1 | 1 }`. Idempotent — overwrites previous score for that message+user.
- **Frontend:** small thumbs up/down buttons in the AI hover-actions row. Visual state: filled if rated.
- **Teacher dashboard:** new tab "Low-rated responses" sorted by `feedback_score = -1`.
- **Files:** new migration `015_*`, `messageRoutes.ts`, `messageRepository.ts`, `chatter.js`, `dashboard-teacher.html` + `teacher.js`.

### 3.5 Export chat (markdown / PDF)

**Why:** Parents/teachers want offline copies. Compliance value too.

**Sketch:**
- **Backend:** `GET /api/conversations/:id/export?format=md` — returns a markdown file. Format: `# Title\n\n**You** (timestamp): ...\n\n**Bubbli** (timestamp): ...`.
- **PDF:** use a render service or just rely on browser print-to-PDF from the markdown view (skip for v1).
- **Frontend:** "Export" item in the chat-options menu (need to add the menu first — see 3.6).
- **Files:** `conversationRoutes.ts`, `chatter.js`.

### 3.6 Suggestion chips between turns + chat options menu

**Why:** Two small wins bundled. Suggestion chips after Bubbli replies keep the conversation flowing. Chat options menu (rename, export, delete) is a hygiene piece.

**Sketch:**
- After AI reply, generate 2–3 short follow-up prompts via the existing AI provider, render as chips below the message.
- Three-dot menu on the active chat header → Rename / Export / Delete.
- **Files:** `chatter.js`, `dashboard-chatter.html`.

---

## 4. Top picks — Phase 2 (variety + curation, ~5–7 days)

### 4.1 Personas (Bubbli modes)

**Why:** Different "personalities" for different subjects keeps engagement up and lets us tune system prompts per subject (math = step-by-step; reading = empathetic; science = curiosity-driven).

**Sketch:**
- **Migration:** new `personas` table — `id`, `name`, `slug`, `description`, `system_prompt`, `icon`, `subject`, `is_default`, `created_at`. Seed with 4-5: Bubbli (default, generalist), Math Bubbli, Story Bubbli, Science Bubbli, Spanish Bubbli.
- **Backend:** add `persona_id` to `conversations`. New routes: `GET /api/personas`, `POST /api/conversations` accepts `{ persona_id }`.
- **AI service:** `loadSystemPrompt()` becomes `loadSystemPrompt(persona)`.
- **Frontend:** persona picker on the welcome screen (icon grid). Show persona name + icon on the chat header. Conversation title generation passes the persona context.
- **Files:** new migration, `personaRepository.ts` (new), `personaRoutes.ts` (new), `messageService.ts` (pass persona to AI), `streamMessageService.ts`, `chatter.js`, `dashboard-chatter.html`.

### 4.2 Standard answers (pre-vetted canned responses)

**Why:** For sensitive/recurring questions ("am I safe?", "what's a period?", "my parents are fighting"), have a curator-vetted response that runs INSTEAD of the LLM. Removes risk on highest-stakes topics.

**Sketch:**
- **Migration:** `standard_answers` — `id`, `match_keywords` (text[] or JSONB), `match_pattern` (regex), `response_text`, `is_active`, `created_by`.
- **Backend:** before calling AI, run `findStandardAnswer(input)` — if it matches, return the canned response (still safety-checked) and skip the LLM. Audit-log the match.
- **Teacher UI:** simple admin page to author and review standard answers.
- **Files:** new migration, `standardAnswerRepository.ts`, hook into `messageService.ts`/`streamMessageService.ts` BEFORE the safety call.

### 4.3 Curated knowledge sets (mini-RAG)

**Why:** Teachers upload classroom material (this week's reading, math worksheet); learners can ask Bubbli about it. Keeps it scoped — no internet — and gives Bubbli sources to cite.

**Sketch:**
- **Migration:** `document_sets`, `documents`, `document_chunks` (with pgvector). Use Postgres `pgvector` extension — no separate vector DB, simpler.
- **Backend:** Teacher routes for upload + ingestion (chunk, embed). Learner side: optional retrieval pre-pended to system prompt with cited chunks.
- **Embedding:** OpenAI `text-embedding-3-small` (cheap, good enough). Background ingestion via simple job queue (or sync for v1).
- **Frontend:** Teacher dashboard gets a "Resources" tab. Learner chat header shows the active document set.
- **Files:** new migrations, `documentSetRepository.ts`, `documentRepository.ts`, `embeddingService.ts`, `ragService.ts`, teacher routes, hook in messageService.

### 4.4 Notification bell

**Why:** Two-way — kids see when parent/teacher leaves a note; parents/teachers see flagged messages without polling.

**Sketch:**
- **Migration:** `notifications` — `id`, `user_id`, `type`, `payload`, `read_at`, `created_at`.
- **Backend:** `GET /api/notifications`, `PATCH /api/notifications/:id/read`. Hooks into existing flag/guidance creation paths to write notifications.
- **Frontend:** bell icon in header with unread count, dropdown showing recent notifications.
- **Files:** new migration, `notificationRepository.ts`, `notificationRoutes.ts`, hook in `flagRepository.ts` and `guidanceRepository.ts`, header partial in three dashboards.

---

## 5. Top picks — Phase 3 (optional polish, ~5 days)

- **TTS read-aloud:** Browser SpeechSynthesis API is free and good enough for English. Single button on AI messages. ~2 hours.
- **Image upload (homework photos):** big in value but needs image-safety scan (e.g., AWS Rekognition or open-source NSFW classifier) on the upload path before storing. ~2 days.
- **Subject folders / chat groups:** simple `folder_id` on conversations + sidebar grouping. ~1 day.
- **Pin / favorite chat:** boolean on conversations + sticky to top in sidebar. ~half day.
- **Command palette (Cmd+K):** searchable list of chats + actions. ~1 day.

---

## 6. Explicit non-goals (skip)

These are Onyx features that would distract from the child-safety mission or add disproportionate complexity:

- **Web search tool** — open internet is the opposite of curated/safe.
- **Code interpreter / Python sandbox** — niche for K-8, high risk.
- **Image generation (DALL·E)** — content-safety on generated images is hard; no clear kid-tutor use case.
- **50+ generic connectors** (Slack, Confluence, Jira, Salesforce, Notion, etc.) — wrong audience.
- **MCP servers** — adds attack surface, no kid-tutor justification.
- **Custom OpenAPI tools** — same.
- **API keys / PATs for learners** — kids shouldn't have programmatic access.
- **Multi-tenancy** — single school deployment is the assumed shape.
- **SAML / SCIM / LDAP** — Google OAuth covers schools that need SSO.
- **Knowledge graph extraction** — heavy infra, marginal kid-tutor value.
- **Custom webhooks** — security/complexity tradeoff bad.
- **Federated search** — overkill.
- **Branched conversations / alternate replies** — adds UX cognitive load for kids.
- **Multi-LLM parallel response compare** — power-user feature.
- **Anonymous chat links** — unauthed kid traffic is a non-starter.

---

## 7. What ChildAI has that Onyx doesn't (keep & invest)

These are differentiators worth doubling down on rather than copying Onyx:

| Feature | Where it lives | Why it matters |
|---------|----------------|----------------|
| Multi-layer safety (keyword + LLM) | `services/safety/` | Onyx assumes adult enterprise users; we can't |
| Daily message budget | `services/rateLimit/limiter.ts` | Healthy use limits for kids |
| Adult guidance | `repositories/guidanceRepository.ts` | Parent/teacher leaves contextual notes for the kid |
| Learning objectives | `repositories/learningObjectiveRepository.ts` | Tied to curriculum, not enterprise OKRs |
| Per-message translation | `services/translationService.ts` | Multilingual learner support |
| Multi-provider router with circuit breaker | `services/ai/providerRouter.ts` | Resilience Onyx doesn't have out of the box |
| Classroom-aware roles | `repositories/{relationship,classroom}Repository.ts` | Family/school graph beats generic "groups" |
| Kid-friendly deflection messages | `services/safety/safetyService.ts` | Tone Onyx has no equivalent of |

---

## 8. Recommended next step

1. **Pick one Phase 1 item** to start with (suggest **Regenerate** + **Stop** + **Thumbs feedback** as a single small PR).
2. Generate a TDD implementation plan via `/superpowers:writing-plans` using the sketch in §3 as the spec.
3. Defer the larger items (Personas, RAG, Notifications) until the small wins ship and the user is happy.

If you want, say "go for §3.1" and I'll spin up the writing-plans skill with that as the input spec.
