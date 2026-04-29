# Onyx vs custom childAI frontend — A/B comparison

Both frontends point at the same Fastify backend (`localhost:8001`). Use this
doc to capture observations side-by-side.

## How to run both

```bash
# Terminal 1 — backend (Fastify)
cd nodejs-app && npm run dev

# Terminal 2 — Onyx UI on port 3002 (port 3001 is occupied by the user's
# existing python -m http.server 3001 that serves the custom frontend)
cd onyx-web && npm run dev -- -p 3002

# Then open the existing custom frontend (typically localhost:3001/frontend/dashboard-chatter.html)
# and click "Try Onyx UI (beta)" in the sidebar to flip into Onyx.
```

The launcher page (`frontend/onyx-launcher.html`) copies the JWT from
`sessionStorage` into a cookie that the Onyx Next.js proxy reads, then
redirects to `localhost:3002/app`. The proxy's auth-bridge patch (see
`onyx-integration/patches/01-auth-bridge.patch`) translates that cookie
into an `Authorization: Bearer <jwt>` header on the upstream call to
Fastify.

## Architecture diagram

```
Browser
  │
  ├── localhost:3001/frontend/dashboard-chatter.html   ← custom UI
  │       │
  │       └── direct fetch → localhost:8001/api/...    (existing endpoints)
  │
  └── localhost:3002/app                                ← Onyx UI
          │
          └── /api/* (relative)
                 │
                 └── Onyx Next.js catch-all proxy
                        │   reads `app_token` cookie
                        │   adds Authorization: Bearer <jwt>
                        ▼
                 localhost:8001/api/...
                        │
                        └── Fastify
                               ├── existing routes (conversations, messages, …)
                               └── onyxCompatRoutes plugin
                                       ├── /api/auth/type, /api/me, /api/settings, …
                                       ├── /api/persona, /api/llm/provider, …
                                       ├── /api/chat/get-user-chat-sessions
                                       ├── /api/chat/get-chat-session/:id
                                       ├── /api/chat/create-chat-session
                                       └── /api/chat/send-chat-message  (NDJSON)
```

## Comparison framework

Fill these in during Task 13's smoke test.

| Dimension                | childAI custom        | Onyx                  | Notes |
|--------------------------|-----------------------|-----------------------|-------|
| First paint              |                       |                       |       |
| Time-to-message-sent     |                       |                       |       |
| Streaming feel (latency) |                       |                       |       |
| Conversation list UX     |                       |                       |       |
| Search                   |                       |                       |       |
| Markdown rendering       |                       |                       |       |
| Mobile layout            |                       |                       |       |
| Accessibility (kbd nav)  |                       |                       |       |
| Visual polish            |                       |                       |       |
| Bundle size              |                       |                       |       |
| Code we own/maintain     | ~1.5k LOC             | 0 (vendored upstream) |       |
| Theming flexibility      |                       |                       |       |

## What the integration covers

**Working in chat-only mode (this plan):**
- Login on the custom frontend, then transparent SSO to Onyx via the cookie bridge
- View existing conversations in Onyx's date-grouped sidebar
- Open a conversation, see messages in order
- Send a new message, see streaming reply (NDJSON Packets)
- Safety flags carry through as a `is_safe` field on messages (Onyx ignores it for now, but the data is present)

**Stubbed empty for the demo:**
- Personas / Agents — single hardcoded "Bubbli" persona
- Document sets / Connectors / Federated search — empty arrays
- LLM provider picker — single canned provider
- Projects — empty
- Notifications — empty
- Onyx admin pages — not exercised

**Silently no-op:**
- Rename chat session — Onyx UI accepts; backend doesn't persist (we have no rename endpoint)
- Delete chat session — Onyx UI accepts; backend doesn't actually delete

## Known limitations

- Search across conversations: client-side title filter only, both UIs
- Onyx's `/api/me` returns a synthesized `<sub>@bubbli.local` email rather than the real one (JWT payload doesn't carry email; lookup would require a DB call per request)
- The `parent_message_id` Onyx sends is discarded server-side; our backend manages the message tree internally
- Heartbeat on the streaming endpoint is a bare newline (Onyx parser skips empty lines, so this is safe but unconventional)
- Onyx's frontend warns about a parent `package-lock.json` shadowing the workspace root — cosmetic, doesn't affect compilation

## Open questions

- Do we want to invest in real translations for personas / document sets / projects?
- If we adopted Onyx wholesale, what would we lose from our custom UI? (Bubbli branding, child-friendly suggestion chips, the safety-flag inline UX, the parent/teacher dashboards which live alongside the chat)
- Does the additional complexity of running a Next.js front-end (build tooling, deploy pipeline, two services to host) justify the visual/feature delta?
- Is Onyx's date-grouped sidebar materially better than our custom version (which also groups by date now)?

## Smoke-test status

Backend smoke test, run 2026-04-29 after all 13 tasks:

```
──────── Direct Fastify (8001) — public endpoints ────────
  200  /api/health, /api/auth/type, /api/me, /api/settings,
        /api/enterprise-settings, /api/persona, /api/llm/provider,
        /api/notifications, /api/version

──────── Auth-gated (no token, expect 401) ────────
  401  GET /api/chat/get-user-chat-sessions
  401  POST /api/chat/create-chat-session
  401  POST /api/chat/send-chat-message

──────── Through Onyx proxy (3002 → 8001) ────────
  200  /api/health, /api/auth/type, /api/me, /api/persona, /api/llm/provider

──────── Onyx UI ────────
  200  GET /
```

Unit tests: 24 vitest assertions across `onyxCompatRoutes.test.ts` and
`onyxStreamAdapter.test.ts`, all passing. (43 across all unit tests in the project.)

Browser walk-through is the next step — the wire surface is verified, the
visual A/B is for a human to do.

## Browser walk-through (manual)

1. Confirm both servers running:
   ```bash
   ps aux | grep -E 'tsx watch|next dev' | grep -v grep
   ```
   Expect a Fastify (`tsx watch src/server.ts`) and a Next.js (`next dev -p 3002`).
2. Sign in to the existing custom UI at `localhost:3001/frontend/index.html`
   (or wherever the python http.server is serving it).
3. Open `dashboard-chatter.html`, send a message, verify it streams.
4. Click **"Try Onyx UI (beta)"** in the sidebar.
5. Should land on `localhost:3002/app` authenticated as the same user.
6. Verify the Onyx sidebar shows your previous conversations.
7. Open one, verify the messages render in order.
8. Send a new message in Onyx, verify streaming works.
9. Capture screenshots side-by-side.

## Capture screenshots here

Save side-by-side screenshots of identical chats to
`docs/screenshots/onyx-vs-custom/` and reference them below.

| Scenario               | Custom              | Onyx                |
|------------------------|---------------------|---------------------|
| Welcome / empty state  |                     |                     |
| Active conversation    |                     |                     |
| Streaming reply        |                     |                     |
| Flagged conversation   |                     |                     |
| Mobile breakpoint      |                     |                     |

## Files added by this integration

| Path                                                              | Purpose |
|-------------------------------------------------------------------|---------|
| `onyx-web/`                                                        | Sparse clone of upstream Onyx web/ (gitignored) |
| `onyx-web/.env.local`                                              | Points INTERNAL_URL at our Fastify, basic auth |
| `onyx-web/UPSTREAM_COMMIT.txt`                                     | Pinned upstream SHA for reproducibility |
| `nodejs-app/src/routes/onyxCompatRoutes.ts`                        | Compat shim plugin (~470 LOC) |
| `nodejs-app/src/services/onyxShapes.ts`                            | TypeScript types matching Onyx contracts |
| `nodejs-app/src/services/onyxStreamAdapter.ts`                     | Onyx Packet builders + NDJSON encoder |
| `nodejs-app/tests/unit/onyxCompatRoutes.test.ts`                   | 18 vitest assertions for stubs + converters |
| `nodejs-app/tests/unit/onyxStreamAdapter.test.ts`                  | 6 vitest assertions for packet shapes |
| `onyx-integration/patches/01-auth-bridge.patch`                    | Onyx proxy patch capturing the cookie→header bridge |
| `onyx-integration/patches/README.md`                               | How to re-apply patches if onyx-web/ is re-cloned |
| `frontend/onyx-launcher.html`                                      | One-shot page that drops the JWT cookie + redirects |
| `frontend/dashboard-chatter.html`                                  | +1 link in sidebar for the launcher |

## Files NOT modified

The existing custom frontend, custom routes (conversations, messages, parent, teacher, moderation), services, tests, and infrastructure are untouched by this integration.
