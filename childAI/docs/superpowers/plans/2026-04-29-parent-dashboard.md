# Parent Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a parent dashboard that lets parents monitor their child's AI conversations, view teacher sessions, and see safety alerts — with full field-name validation before any frontend code is written.

**Architecture:** Backend enrichment first (children endpoint JOINs users table for names, admin bypass mirrors teacher virtual-classroom pattern), then HTML/JS built against confirmed API shapes. Three tabs: Conversations (split-pane reader + translate), Sessions (teacher session cards), Safety (flagged conversations only). Privacy modal gates every conversation open.

**Tech Stack:** Fastify + Kysely (backend), Tailwind CSS CDN + Vanilla ES modules (frontend), Vitest (backend tests), curl (API verification)

---

## Verified API Field Names (confirmed from live dev DB — do not guess)

```
GET /api/parent/children → { children: [{ id, name, display_name, primary_role }] }
GET /api/parent/children/:childId/conversations → { conversations: [{ id, title, is_flagged, status, created_at, updated_at, shared_session_id }] }
GET /api/parent/conversations/:convId/messages → { messages: [{ id, role, content, language, is_safe, created_at }] }
  role values: "learner" | "assistant" | "system"
  is_safe: true | false | null
GET /api/parent/children/:childId/sessions → { sessions: [{ id, title, mode, visibility, status, created_at }] }
POST /api/parent/messages/:msgId/translate body: { target_language: "vi" } → { translation: { translated_content, source_language, target_language } }
```

---

## Lessons Applied From Teacher Page (bugs we will NOT repeat)

| Past bug | What we do instead |
|---|---|
| Students showed "User" — no JOIN | Backend returns `name` pre-computed before task 2 |
| `c.grade` vs `c.grade_level` field mismatch | All field names verified above from live API |
| `switchTab` only handled 2 tabs with if/else | Use the loop pattern from the start |
| TDZ crash — `viewBtn` used `learnerName` before declaration | Declare ALL variables before first template literal |
| Double DELETE fetch from leftover conditional | Raw `fetch()` only for DELETE; all others use `api.get/post/patch` |
| Stale tab data — side effects only ran once | Every tab activation reloads its data |
| Admin saw empty classrooms — no admin bypass | Admin bypass added to backend before frontend is built |

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `nodejs-app/src/repositories/relationshipRepository.ts` | Modify | Add `listChildrenWithDetails()` — JOINs users, returns names |
| `nodejs-app/src/services/parentViewService.ts` | Modify | Use `listChildrenWithDetails`, return shaped objects |
| `nodejs-app/src/routes/parentRoutes.ts` | Modify | Admin bypass on `GET /api/parent/children` |
| `frontend/dashboard-parent.html` | Create | Full parent UI — header, child sidebar, 3 tabs, 3 modals |
| `frontend/js/parent.js` | Create | All dashboard logic — data fetching, rendering, tab switching |

---

## Task 1: Backend — Enrich children list and add admin bypass

**Files:**
- Modify: `nodejs-app/src/repositories/relationshipRepository.ts`
- Modify: `nodejs-app/src/services/parentViewService.ts`
- Modify: `nodejs-app/src/routes/parentRoutes.ts`

- [ ] **Step 1.1: Add `listChildrenWithDetails` to repository**

Replace the end of `nodejs-app/src/repositories/relationshipRepository.ts` (after the existing functions, before the final line) with:

```typescript
export async function listChildrenWithDetails(
  parentUserId: string
): Promise<Array<{ id: string; name: string; display_name: string | null; primary_role: string; relationship_type: string }>> {
  const db = getDb();
  const rows = await db
    .selectFrom('parent_child_links as l')
    .innerJoin('users as u', 'u.id', 'l.child_user_id')
    .select(['l.child_user_id', 'u.display_name', 'u.external_subject', 'u.primary_role', 'l.relationship_type'])
    .where('l.parent_user_id', '=', parentUserId)
    .where('l.status', '=', 'active')
    .orderBy('u.display_name', 'asc')
    .execute();
  return (rows as any[]).map(r => ({
    id: r.child_user_id,
    name: r.display_name || (r.external_subject ? String(r.external_subject).slice(0, 16) : null) || 'Child',
    display_name: r.display_name,
    primary_role: r.primary_role,
    relationship_type: r.relationship_type,
  }));
}
```

- [ ] **Step 1.2: Update parentViewService to use enriched query**

In `nodejs-app/src/services/parentViewService.ts`, change the import line and `getChildrenForParent`:

```typescript
// Change import line from:
import { listChildrenForParent } from '../repositories/relationshipRepository';
// To:
import { listChildrenWithDetails } from '../repositories/relationshipRepository';

// Change function from:
export async function getChildrenForParent(parentDbId: string) {
  adultViewRequestsTotal.inc({ role: 'parent', endpoint: 'list_children' });
  return listChildrenForParent(parentDbId);
}
// To:
export async function getChildrenForParent(parentDbId: string) {
  adultViewRequestsTotal.inc({ role: 'parent', endpoint: 'list_children' });
  return listChildrenWithDetails(parentDbId);
}
```

- [ ] **Step 1.3: Add admin bypass to `GET /api/parent/children`**

In `nodejs-app/src/routes/parentRoutes.ts`, replace the handler body of the first route:

```typescript
async (request, reply) => {
  const user = request.user!;
  // Admin sees all users who have at least one conversation (mirrors teacher virtual classroom)
  if (user.role === 'admin') {
    const { getDb } = await import('../db/kysely');
    const db = getDb();
    const rows = await db
      .selectFrom('users as u')
      .innerJoin('conversations as c', 'c.learner_user_id', 'u.id')
      .select(['u.id', 'u.display_name', 'u.external_subject', 'u.primary_role'])
      .groupBy(['u.id', 'u.display_name', 'u.external_subject', 'u.primary_role'])
      .orderBy('u.display_name', 'asc')
      .execute();
    return reply.send({
      children: (rows as any[]).map(r => ({
        id: r.id,
        name: r.display_name || (r.external_subject ? String(r.external_subject).slice(0, 16) : null) || 'Learner',
        display_name: r.display_name,
        primary_role: r.primary_role,
        relationship_type: 'admin_view',
      })),
    });
  }
  const children = await getChildrenForParent(request.user!.dbId);
  return reply.send({ children });
},
```

- [ ] **Step 1.4: Verify TypeScript compiles**

Run from `nodejs-app/`:
```bash
npx tsc --noEmit
```
Expected: no errors (or only pre-existing errors unrelated to our changes)

- [ ] **Step 1.5: Restart backend and test admin bypass**

```bash
# Kill existing process and restart
kill $(lsof -i :8001 -t 2>/dev/null) 2>/dev/null
sleep 1
npm run dev > /tmp/nodejs-dev.log 2>&1 &
sleep 5

# Generate admin JWT (DEV_JWT_SECRET = dev-local-jwt-secret-change-me-32chars!!)
ADMIN_TOKEN=$(node --input-type=module -e "
import { SignJWT } from 'jose';
const s = new TextEncoder().encode('dev-local-jwt-secret-change-me-32chars!!');
const t = await new SignJWT({ sub: 'dev-admin', role: 'admin', email: 'test@test.com' })
  .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setIssuer('bubbli').setExpirationTime('2h').sign(s);
console.log(t);
")

curl -s -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:8001/api/parent/children
```

Expected: `{"children":[{"id":"...","name":"Đình Đỗ Bá Thi","display_name":"...","primary_role":"admin","relationship_type":"admin_view"},...]}`

NOT: `{"children":[]}`

- [ ] **Step 1.6: Test conversations endpoint (confirm field names match spec)**

```bash
CHILD_ID=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:8001/api/parent/children \
  | node --input-type=module -e "import {createInterface} from 'readline'; let d=''; createInterface({input:process.stdin}).on('line',l=>d+=l).on('close',()=>{ const r=JSON.parse(d); console.log(r.children[0]?.id||''); })")

curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:8001/api/parent/children/$CHILD_ID/conversations?limit=3"
```

Expected response shape (verify these exact keys exist):
```json
{"conversations":[{"id":"...","title":null,"is_flagged":true,"status":"active","created_at":"..."}]}
```

- [ ] **Step 1.7: Test messages endpoint**

```bash
CONV_ID="<paste id from step 1.6>"
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:8001/api/parent/conversations/$CONV_ID/messages"
```

Expected shape (verify `role` is `"learner"` or `"assistant"`, not `"user"`):
```json
{"messages":[{"id":"...","role":"learner","content":"who are you","language":"en","is_safe":null},{"role":"assistant","is_safe":true,...}]}
```

- [ ] **Step 1.8: Commit backend**

```bash
cd nodejs-app
git add src/repositories/relationshipRepository.ts \
        src/services/parentViewService.ts \
        src/routes/parentRoutes.ts
git commit -m "feat: enrich parent children endpoint with display names and admin bypass"
```

---

## Task 2: Parent Dashboard HTML

**Files:**
- Create: `frontend/dashboard-parent.html`

Design tokens (consistent with teacher page brand + warm parent palette):
- Background: `#FFFDF5` (warmer than teacher's `#F2FBF9`)
- Primary: `#0A3D3C`, Mint: `#DAF0EE`
- Child avatar: `#7C3AED` (violet — distinct from teacher's blue students)
- Sessions badge: `#3B82F6` (blue = learning/school)
- Safe: `#10B981` (green), Alert: `#EE6742`

- [ ] **Step 2.1: Create `frontend/dashboard-parent.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bubbli — Parent Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            jakarta: ['"Plus Jakarta Sans"', 'sans-serif'],
            inter:   ['Inter', 'sans-serif'],
          },
        },
      },
    };
  </script>
  <style>
    body { font-family: 'Inter', sans-serif; }
    h1, h2, h3, button { font-family: 'Plus Jakarta Sans', sans-serif; }
    #children-list, #parent-conv-list, #parent-thread { scrollbar-width: thin; scrollbar-color: #DAF0EE transparent; }
    #sessions-container, #safety-container { scrollbar-width: thin; scrollbar-color: #DAF0EE transparent; }
  </style>
</head>
<body class="h-screen bg-[#FFFDF5] flex flex-col overflow-hidden">

  <!-- ── Header ── -->
  <header class="bg-[#0A3D3C] px-4 md:px-6 py-3 flex items-center justify-between flex-shrink-0 shadow-md">
    <div class="flex items-center gap-3">
      <img src="./assets/logo.png" alt="Bubbli" class="h-8 object-contain rounded-lg" />
    </div>
    <div class="flex items-center gap-3">
      <span class="hidden md:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold font-jakarta bg-[#EDE9FE] text-[#7C3AED]">
        Parent
      </span>
      <div class="hidden md:flex items-center gap-2">
        <div class="w-7 h-7 rounded-full bg-[#EE6742] flex items-center justify-center text-white text-xs font-bold font-jakarta">
          <span id="user-avatar">P</span>
        </div>
        <span id="user-name" class="text-[#DAF0EE] text-sm font-medium font-inter"></span>
      </div>
      <button id="logout-btn"
        class="text-xs font-semibold font-jakarta text-[#DAF0EE] border border-[#DAF0EE]/40 hover:bg-[#DAF0EE]/10 rounded-full px-3 py-1.5 cursor-pointer transition-colors duration-150">
        Sign out
      </button>
    </div>
  </header>

  <!-- ── Main layout ── -->
  <div class="flex flex-1 overflow-hidden">

    <!-- ── Left: Child Selector ── -->
    <aside class="w-72 bg-white border-r border-[#DAF0EE] flex flex-col flex-shrink-0">
      <div class="px-4 py-3 border-b border-[#DAF0EE]">
        <p class="text-[10px] font-semibold text-gray-400 tracking-widest uppercase font-inter">My Children</p>
      </div>
      <div id="children-list" class="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        <p class="text-xs text-gray-400 px-3 py-2">Loading…</p>
      </div>
    </aside>

    <!-- ── Right: Tabs + Content ── -->
    <main class="flex-1 flex flex-col overflow-hidden">

      <!-- Tab bar -->
      <nav class="bg-white border-b border-[#DAF0EE] px-6 flex items-center gap-1 flex-shrink-0">
        <button id="tab-conversations"
          class="text-sm font-semibold font-jakarta px-1 py-3.5 mr-4 border-b-2 border-[#0A3D3C] text-[#0A3D3C] transition-colors duration-150 cursor-pointer">
          Conversations
        </button>
        <button id="tab-sessions"
          class="text-sm font-semibold font-jakarta px-1 py-3.5 mr-4 border-b-2 border-transparent text-gray-500 hover:text-[#0A3D3C] transition-colors duration-150 cursor-pointer">
          Sessions
        </button>
        <button id="tab-safety"
          class="text-sm font-semibold font-jakarta px-1 py-3.5 border-b-2 border-transparent text-gray-500 hover:text-[#0A3D3C] transition-colors duration-150 cursor-pointer flex items-center gap-2">
          Safety
          <span id="safety-badge"
            class="hidden inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-[#EE6742] text-white">0</span>
        </button>
        <!-- Selected child name pill -->
        <div class="ml-auto">
          <span id="selected-child-pill" class="hidden items-center gap-1.5 px-3 py-1 bg-[#EDE9FE] rounded-full">
            <div class="w-4 h-4 rounded-full bg-[#7C3AED] flex items-center justify-center text-white text-[9px] font-bold" id="child-pill-avatar"></div>
            <span id="selected-child-name" class="text-xs font-semibold text-[#7C3AED] font-jakarta"></span>
          </span>
        </div>
      </nav>

      <!-- ── Tab: Conversations ── -->
      <div id="view-conversations" class="flex-1 flex overflow-hidden">
        <!-- Conversation list -->
        <div class="w-64 border-r border-[#DAF0EE] flex flex-col flex-shrink-0">
          <div id="parent-conv-list" class="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
            <div class="flex flex-col items-center justify-center h-40 text-center px-4">
              <p class="text-sm text-gray-400 font-inter">Select a child to view conversations</p>
            </div>
          </div>
        </div>
        <!-- Message thread -->
        <div class="flex-1 flex flex-col overflow-hidden">
          <div id="parent-empty" class="flex flex-col items-center justify-center h-full text-center px-8 select-none">
            <div class="w-16 h-16 rounded-2xl bg-[#EDE9FE] flex items-center justify-center mb-4">
              <svg class="w-8 h-8 text-[#7C3AED]" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
              </svg>
            </div>
            <p class="text-[#0A3D3C] font-jakarta font-semibold text-sm">Select a conversation</p>
            <p class="text-gray-400 text-xs mt-1 font-inter">Choose from the list to read messages</p>
          </div>
          <div id="parent-thread-wrapper" class="hidden flex-1 flex flex-col overflow-hidden">
            <div class="px-6 py-3 border-b border-[#DAF0EE] flex items-center justify-between flex-shrink-0 bg-white">
              <p id="thread-title" class="text-sm font-semibold font-jakarta text-[#0A3D3C]"></p>
              <span id="thread-flagged-badge" class="hidden inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-[#EE6742]">
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd"/></svg>
                Flagged
              </span>
            </div>
            <div id="parent-thread" class="flex-1 overflow-y-auto px-4 py-4 space-y-1"></div>
          </div>
        </div>
      </div>

      <!-- ── Tab: Sessions ── -->
      <div id="view-sessions" class="hidden flex-1 overflow-y-auto p-6">
        <div id="sessions-container">
          <div class="flex flex-col items-center justify-center py-16 text-center">
            <p class="text-sm text-gray-400">Select a child to view sessions</p>
          </div>
        </div>
      </div>

      <!-- ── Tab: Safety ── -->
      <div id="view-safety" class="hidden flex-1 overflow-y-auto p-6">
        <div id="safety-container">
          <div class="flex flex-col items-center justify-center py-16 text-center">
            <p class="text-sm text-gray-400">Select a child to view safety alerts</p>
          </div>
        </div>
      </div>

    </main>
  </div>

  <!-- ── Privacy Modal ── -->
  <div id="privacy-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
    <div class="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
      <div class="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center mb-4">
        <svg class="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      </div>
      <h3 class="text-base font-bold font-jakarta text-[#0A3D3C] mb-2">Privacy reminder</h3>
      <p class="text-sm font-inter text-gray-600 leading-relaxed mb-6">
        You're about to view your child's conversation with Bubbli. This is private content — please use it for guidance and support only. Do not share or publish these messages, as that would violate your child's privacy.
      </p>
      <div class="flex gap-3">
        <button onclick="window._closePrivacyModal()"
          class="flex-1 border border-[#DAF0EE] text-[#0A3D3C] text-sm font-semibold font-jakarta rounded-xl py-2.5 hover:bg-[#F2FBF9] cursor-pointer transition-colors duration-150">
          Cancel
        </button>
        <button id="privacy-confirm-btn"
          class="flex-1 bg-[#0A3D3C] text-white text-sm font-semibold font-jakarta rounded-xl py-2.5 hover:bg-[#072e2d] cursor-pointer transition-colors duration-150">
          I understand, view conversation
        </button>
      </div>
    </div>
  </div>

  <!-- ── Translate Modal ── -->
  <div id="translate-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" onclick="window._closeTranslateModal()"></div>
    <div class="relative bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
      <h3 class="text-base font-bold font-jakarta text-[#0A3D3C] mb-4">Translate message</h3>
      <label class="block text-xs font-semibold font-inter text-gray-500 mb-1.5">Translate to</label>
      <select id="translate-lang" class="w-full border border-[#DAF0EE] rounded-xl px-3 py-2.5 text-sm font-inter text-[#1A1A1A] focus:outline-none focus:border-[#0A3D3C] mb-4">
        <option value="vi">Vietnamese</option>
        <option value="zh">Chinese (Simplified)</option>
        <option value="es">Spanish</option>
        <option value="fr">French</option>
        <option value="ar">Arabic</option>
        <option value="ko">Korean</option>
        <option value="ja">Japanese</option>
        <option value="th">Thai</option>
        <option value="pt">Portuguese</option>
        <option value="de">German</option>
      </select>
      <div id="translate-result" class="hidden bg-[#F2FBF9] rounded-xl p-3 mb-4 text-sm font-inter text-[#1A1A1A] leading-relaxed"></div>
      <div class="flex gap-3">
        <button onclick="window._closeTranslateModal()"
          class="flex-1 border border-[#DAF0EE] text-[#0A3D3C] text-sm font-semibold font-jakarta rounded-xl py-2.5 hover:bg-[#F2FBF9] cursor-pointer transition-colors duration-150">
          Close
        </button>
        <button id="translate-btn"
          class="flex-1 bg-[#0A3D3C] text-white text-sm font-semibold font-jakarta rounded-xl py-2.5 hover:bg-[#072e2d] cursor-pointer transition-colors duration-150">
          Translate
        </button>
      </div>
    </div>
  </div>

  <script type="module">
    import { init } from './js/parent.js';
    init();
  </script>
</body>
</html>
```

- [ ] **Step 2.2: Verify HTML renders (open in browser)**

Open `http://localhost:3001/frontend/dashboard-parent.html` (no token — should redirect or show blank since JS handles auth).

Expected: page loads without console HTML parse errors. JS module errors are expected at this stage.

- [ ] **Step 2.3: Commit HTML**

```bash
git add frontend/dashboard-parent.html
git commit -m "feat: add parent dashboard HTML shell with child sidebar, 3 tabs, privacy + translate modals"
```

---

## Task 3: Parent Dashboard JS

**Files:**
- Create: `frontend/js/parent.js`

- [ ] **Step 3.1: Create `frontend/js/parent.js`**

```javascript
// parent.js — Parent dashboard logic
import { api } from './api.js';
import { clearTokens } from './auth.js';

let selectedChildId   = null;
let selectedChildName = null;
let allConversations  = [];  // cache for safety tab filtering
let _pendingMsgId     = null; // for translate modal

// ─── Bootstrap ────────────────────────────────────────────────────────────────

export async function init() {
  const displayName = sessionStorage.getItem('display_name') ?? 'Parent';
  document.getElementById('user-name').textContent = displayName;
  const avatar = document.getElementById('user-avatar');
  if (avatar && displayName) avatar.textContent = displayName[0].toUpperCase();

  document.getElementById('logout-btn').addEventListener('click', () => {
    clearTokens();
    location.href = '/frontend/index.html';
  });

  document.getElementById('tab-conversations').addEventListener('click', () => switchTab('conversations'));
  document.getElementById('tab-sessions').addEventListener('click', () => switchTab('sessions'));
  document.getElementById('tab-safety').addEventListener('click', () => switchTab('safety'));

  await loadChildren();
}

// ─── Children ─────────────────────────────────────────────────────────────────

async function loadChildren() {
  const list = document.getElementById('children-list');
  list.innerHTML = '<p class="text-xs text-gray-400 px-3 py-2">Loading…</p>';

  try {
    const data     = await api.get('/api/parent/children');
    const children = data?.children ?? [];

    if (!children.length) {
      list.innerHTML = `
        <div class="flex flex-col items-center justify-center py-12 px-4 text-center">
          <p class="text-sm text-gray-500 font-inter">No children linked.</p>
          <p class="text-xs text-gray-400 mt-1 font-inter">Ask your administrator to link your account.</p>
        </div>`;
      return;
    }

    list.innerHTML = children.map(c => {
      const name    = c.name ?? c.display_name ?? 'Child';
      const initial = name[0].toUpperCase();
      return `
        <button
          data-child-id="${escHtml(String(c.id))}"
          class="child-btn w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left hover:bg-[#F3F0FF] transition-colors duration-150 cursor-pointer border border-transparent"
          onclick="window._selectChild('${escHtml(String(c.id))}', '${escHtml(name)}', this)">
          <div class="flex-shrink-0 w-10 h-10 rounded-full bg-[#EDE9FE] flex items-center justify-center text-[#7C3AED] font-bold font-jakarta text-sm">
            ${escHtml(initial)}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold font-jakarta text-[#0A3D3C] truncate">${escHtml(name)}</p>
            <p class="text-xs text-gray-400 mt-0.5 font-inter truncate" id="child-status-${escHtml(String(c.id))}">—</p>
          </div>
        </button>`;
    }).join('');

    // Auto-select first child
    const firstChild = children[0];
    const firstBtn   = list.querySelector('.child-btn');
    if (firstChild && firstBtn) {
      window._selectChild(String(firstChild.id), firstChild.name ?? firstChild.display_name ?? 'Child', firstBtn);
    }
  } catch (err) {
    list.innerHTML = '<p class="text-xs text-[#EE6742] px-3 py-2">Failed to load children</p>';
    console.error(err);
  }
}

window._selectChild = async function(childId, name, btn) {
  selectedChildId   = childId;
  selectedChildName = name;

  // Highlight selected child
  document.querySelectorAll('.child-btn').forEach(b => {
    b.classList.remove('bg-[#F3F0FF]', 'border-[#DDD6FE]', 'font-semibold');
    b.classList.add('border-transparent');
  });
  btn.classList.add('bg-[#F3F0FF]', 'border-[#DDD6FE]', 'font-semibold');
  btn.classList.remove('border-transparent');

  // Update header pill
  const pill = document.getElementById('selected-child-pill');
  const pillAvatar = document.getElementById('child-pill-avatar');
  const pillName   = document.getElementById('selected-child-name');
  if (pill && pillAvatar && pillName) {
    pillAvatar.textContent = name[0].toUpperCase();
    pillName.textContent   = name;
    pill.classList.remove('hidden');
    pill.classList.add('flex');
  }

  // Reset conversation pane
  document.getElementById('parent-empty').classList.remove('hidden');
  document.getElementById('parent-thread-wrapper').classList.add('hidden');
  document.getElementById('parent-conv-list').innerHTML =
    '<p class="text-xs text-gray-400 px-3 py-2">Loading…</p>';

  // Load data for current active tab
  const activeTab = document.querySelector('[data-active="true"]')?.dataset?.tab ?? 'conversations';
  await loadTabData(activeTab, childId);
  await updateSafetyBadge(childId);
};

// ─── Tab switching ─────────────────────────────────────────────────────────────

export function switchTab(tab) {
  ['conversations', 'sessions', 'safety'].forEach(t => {
    const btn  = document.getElementById(`tab-${t}`);
    const view = document.getElementById(`view-${t}`);
    if (btn) {
      btn.classList.remove('border-[#0A3D3C]', 'text-[#0A3D3C]', 'font-semibold');
      btn.classList.add('border-transparent', 'text-gray-500');
      btn.dataset.active = 'false';
      btn.dataset.tab    = t;
    }
    if (view) view.classList.add('hidden');
  });

  const activeBtn  = document.getElementById(`tab-${tab}`);
  const activeView = document.getElementById(`view-${tab}`);
  if (activeBtn) {
    activeBtn.classList.add('border-[#0A3D3C]', 'text-[#0A3D3C]', 'font-semibold');
    activeBtn.classList.remove('border-transparent', 'text-gray-500');
    activeBtn.dataset.active = 'true';
  }
  if (activeView) activeView.classList.remove('hidden');

  if (selectedChildId) loadTabData(tab, selectedChildId);
}

async function loadTabData(tab, childId) {
  if (tab === 'conversations') await loadConversations(childId);
  else if (tab === 'sessions')  await loadSessions(childId);
  else if (tab === 'safety')    await loadSafety();
}

// ─── Conversations ─────────────────────────────────────────────────────────────

async function loadConversations(childId) {
  const list = document.getElementById('parent-conv-list');
  list.innerHTML = '<p class="text-xs text-gray-400 px-3 py-2">Loading…</p>';

  try {
    const data  = await api.get(`/api/parent/children/${childId}/conversations?limit=30`);
    const convs = data?.conversations ?? [];

    // Cache for safety tab
    allConversations = convs;

    // Update child status line
    const flaggedCount = convs.filter(c => c.is_flagged).length;
    const statusEl = document.getElementById(`child-status-${CSS.escape(childId)}`);
    if (statusEl) {
      statusEl.textContent = flaggedCount > 0
        ? `${convs.length} chats · ${flaggedCount} flagged`
        : `${convs.length} chat${convs.length !== 1 ? 's' : ''}`;
    }

    if (!convs.length) {
      list.innerHTML = '<p class="text-xs text-gray-400 px-3 py-2 text-center">No conversations yet</p>';
      return;
    }

    list.innerHTML = convs.map(c => {
      const title   = c.title ?? ('Chat ' + String(c.id).slice(0, 6));
      const dateStr = new Date(c.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' });
      return `
        <button
          data-conv-id="${escHtml(String(c.id))}"
          class="conv-btn w-full text-left px-3 py-2.5 rounded-xl hover:bg-[#F2FBF9] transition-colors duration-150 cursor-pointer ${c.is_flagged ? 'border-l-2 border-[#EE6742] pl-2.5' : ''}"
          onclick="window._openConvViewer('${escHtml(String(c.id))}', '${escHtml(title)}', ${c.is_flagged})">
          <p class="text-sm font-inter text-[#0A3D3C] truncate">${escHtml(title)}</p>
          <div class="flex items-center gap-2 mt-0.5">
            <p class="text-[11px] text-gray-400 font-inter">${escHtml(dateStr)}</p>
            ${c.is_flagged ? '<span class="text-[10px] text-[#EE6742] font-semibold font-inter">Flagged</span>' : ''}
          </div>
        </button>`;
    }).join('');
  } catch (err) {
    list.innerHTML = '<p class="text-xs text-[#EE6742] px-3 py-2">Failed to load</p>';
    console.error(err);
  }
}

// ─── Conversation viewer (with privacy gate) ───────────────────────────────────

let _pendingConvId    = null;
let _pendingConvTitle = null;

window._openConvViewer = function(convId, title, isFlagged) {
  _pendingConvId    = convId;
  _pendingConvTitle = title;
  document.getElementById('privacy-modal').classList.remove('hidden');
  document.getElementById('privacy-confirm-btn').onclick = () => window._confirmViewConv(isFlagged);
};

window._confirmViewConv = async function(isFlagged) {
  document.getElementById('privacy-modal').classList.add('hidden');

  // Highlight selected conversation
  document.querySelectorAll('.conv-btn').forEach(b => b.classList.remove('bg-[#F2FBF9]', 'font-semibold'));
  const convBtn = document.querySelector(`[data-conv-id="${CSS.escape(_pendingConvId)}"]`);
  if (convBtn) convBtn.classList.add('bg-[#F2FBF9]', 'font-semibold');

  // Show thread pane
  document.getElementById('parent-empty').classList.add('hidden');
  document.getElementById('parent-thread-wrapper').classList.remove('hidden');
  document.getElementById('parent-thread-wrapper').classList.add('flex');

  // Update thread header
  document.getElementById('thread-title').textContent = _pendingConvTitle ?? 'Conversation';
  const flaggedBadge = document.getElementById('thread-flagged-badge');
  if (isFlagged) flaggedBadge.classList.remove('hidden');
  else flaggedBadge.classList.add('hidden');

  const thread = document.getElementById('parent-thread');
  thread.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Loading…</p>';

  try {
    const data     = await api.get(`/api/parent/conversations/${_pendingConvId}/messages`);
    const messages = data?.messages ?? [];

    if (!messages.length) {
      thread.innerHTML = '<p class="text-xs text-gray-400 text-center py-8">No messages</p>';
      return;
    }

    thread.innerHTML = messages.map(m => parentMsgHTML(m)).join('');
    thread.scrollTop = thread.scrollHeight;
  } catch (err) {
    thread.innerHTML = '<p class="text-xs text-[#EE6742] text-center py-4">Failed to load messages</p>';
    console.error(err);
  }
};

window._closePrivacyModal = function() {
  document.getElementById('privacy-modal').classList.add('hidden');
  _pendingConvId = _pendingConvTitle = null;
};

function parentMsgHTML(m) {
  const isLearner = m.role === 'learner';
  const unsafe    = m.is_safe === false;
  const msgId     = escHtml(String(m.id));
  return `
    <div class="flex ${isLearner ? 'justify-end' : 'justify-start'} mb-2 px-1 group">
      <div class="max-w-[75%]">
        <div class="${isLearner
          ? 'bg-[#0A3D3C] text-white rounded-2xl rounded-br-sm'
          : 'bg-white border border-[#DAF0EE] text-[#1A1A1A] rounded-2xl rounded-bl-sm shadow-sm'
        } px-4 py-2.5 text-sm font-inter leading-relaxed">
          ${escHtml(m.content)}
          ${unsafe ? `<p class="text-[10px] text-[#EE6742] mt-1 font-semibold flex items-center gap-1">
            <svg class="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd"/>
            </svg>
            Safety flag</p>` : ''}
        </div>
        <button
          class="mt-1 text-[10px] text-gray-400 hover:text-[#0A3D3C] font-inter opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer px-1"
          onclick="window._openTranslateModal('${msgId}')">
          Translate
        </button>
      </div>
    </div>`;
}

// ─── Translate ────────────────────────────────────────────────────────────────

window._openTranslateModal = function(msgId) {
  _pendingMsgId = msgId;
  document.getElementById('translate-result').classList.add('hidden');
  document.getElementById('translate-result').textContent = '';
  document.getElementById('translate-modal').classList.remove('hidden');
  document.getElementById('translate-btn').onclick = window._doTranslate;
};

window._doTranslate = async function() {
  if (!_pendingMsgId) return;
  const lang = document.getElementById('translate-lang').value;
  const btn  = document.getElementById('translate-btn');
  btn.disabled = true;
  btn.textContent = 'Translating…';

  const resultEl = document.getElementById('translate-result');
  try {
    const data = await api.post(`/api/parent/messages/${_pendingMsgId}/translate`, { target_language: lang });
    const text = data?.translation?.translated_content ?? 'Translation unavailable';
    resultEl.textContent = text;
    resultEl.classList.remove('hidden');
  } catch (err) {
    resultEl.textContent = 'Translation failed. Please try again.';
    resultEl.classList.remove('hidden');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Translate';
  }
};

window._closeTranslateModal = function() {
  document.getElementById('translate-modal').classList.add('hidden');
  _pendingMsgId = null;
};

// ─── Sessions ─────────────────────────────────────────────────────────────────

async function loadSessions(childId) {
  const container = document.getElementById('sessions-container');
  container.innerHTML = '<p class="text-xs text-gray-400 text-center py-8">Loading…</p>';

  try {
    const data     = await api.get(`/api/parent/children/${childId}/sessions`);
    const sessions = data?.sessions ?? [];

    if (!sessions.length) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <div class="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
            <svg class="w-7 h-7 text-[#3B82F6]" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 3.741-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
            </svg>
          </div>
          <p class="text-sm font-semibold text-[#0A3D3C] font-jakarta">No sessions yet</p>
          <p class="text-xs text-gray-400 mt-1 font-inter">Sessions are created by teachers for guided learning.</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <h2 class="text-base font-bold font-jakarta text-[#0A3D3C] mb-4">
        ${escHtml(selectedChildName ?? 'Child')}'s Learning Sessions
      </h2>
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        ${sessions.map(sessionCardHTML).join('')}
      </div>`;
  } catch (err) {
    container.innerHTML = '<p class="text-xs text-[#EE6742] text-center py-8">Failed to load sessions</p>';
    console.error(err);
  }
}

function sessionCardHTML(s) {
  const title   = s.title ?? ('Session ' + String(s.id).slice(0, 6));
  const dateStr = new Date(s.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
  const statusColor = s.status === 'active'
    ? 'bg-green-50 text-green-700'
    : s.status === 'closed'
    ? 'bg-gray-100 text-gray-500'
    : 'bg-blue-50 text-blue-700';
  const modeLabel = (s.mode ?? 'guided').replace(/_/g, ' ');

  return `
    <div class="bg-white rounded-2xl border border-[#DAF0EE] p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div class="flex items-start justify-between mb-3">
        <div class="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
          <svg class="w-5 h-5 text-[#3B82F6]" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 3.741-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
          </svg>
        </div>
        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusColor} capitalize">
          ${escHtml(s.status ?? 'active')}
        </span>
      </div>
      <h3 class="text-sm font-bold font-jakarta text-[#0A3D3C] mb-1 leading-snug">${escHtml(title)}</h3>
      <p class="text-xs text-gray-400 font-inter mb-3">${escHtml(modeLabel)} · ${escHtml(dateStr)}</p>
      <button
        class="w-full text-xs font-semibold font-jakarta text-[#0A3D3C] border border-[#DAF0EE] hover:bg-[#F2FBF9] rounded-xl py-2 cursor-pointer transition-colors duration-150"
        onclick="window._loadSessionGuidance('${escHtml(String(s.id))}', '${escHtml(title)}', this)">
        View teacher notes
      </button>
      <div id="guidance-${escHtml(String(s.id))}" class="hidden mt-3 space-y-2"></div>
    </div>`;
}

window._loadSessionGuidance = async function(sessionId, title, btn) {
  const guidanceEl = document.getElementById(`guidance-${CSS.escape(sessionId)}`);
  if (!guidanceEl) return;

  if (!guidanceEl.classList.contains('hidden')) {
    guidanceEl.classList.add('hidden');
    btn.textContent = 'View teacher notes';
    return;
  }

  btn.textContent = 'Loading…';
  btn.disabled    = true;

  try {
    const data     = await api.get(`/api/parent/sessions/${sessionId}/guidance`);
    const guidance = data?.guidance ?? [];

    if (!guidance.length) {
      guidanceEl.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">No notes for this session.</p>';
    } else {
      guidanceEl.innerHTML = guidance.map(g => `
        <div class="bg-[#F2FBF9] rounded-xl px-3 py-2.5 border border-[#DAF0EE]">
          <p class="text-xs font-semibold text-[#0A3D3C] font-jakarta mb-0.5 capitalize">
            ${escHtml((g.guidance_type ?? 'note').replace(/_/g, ' '))}
          </p>
          <p class="text-xs text-gray-600 font-inter leading-relaxed">${escHtml(g.content)}</p>
        </div>`).join('');
    }

    guidanceEl.classList.remove('hidden');
    btn.textContent = 'Hide notes';
  } catch (err) {
    guidanceEl.innerHTML = '<p class="text-xs text-[#EE6742] text-center py-2">Failed to load notes</p>';
    guidanceEl.classList.remove('hidden');
    btn.textContent = 'View teacher notes';
    console.error(err);
  } finally {
    btn.disabled = false;
  }
};

// ─── Safety ───────────────────────────────────────────────────────────────────

async function updateSafetyBadge(childId) {
  try {
    const data  = await api.get(`/api/parent/children/${childId}/conversations?limit=50`);
    const convs = data?.conversations ?? [];
    allConversations  = convs;
    const count = convs.filter(c => c.is_flagged).length;
    const badge = document.getElementById('safety-badge');
    if (count > 0) {
      badge.textContent = count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadSafety() {
  const container = document.getElementById('safety-container');
  const flagged   = allConversations.filter(c => c.is_flagged);

  if (!flagged.length) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-16 text-center">
        <div class="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mb-4">
          <svg class="w-7 h-7 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
          </svg>
        </div>
        <p class="text-sm font-semibold text-[#0A3D3C] font-jakarta">All clear</p>
        <p class="text-xs text-gray-400 mt-1 font-inter">No safety flags for ${escHtml(selectedChildName ?? 'this child')}.</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <h2 class="text-base font-bold font-jakarta text-[#0A3D3C] mb-1">Safety Alerts</h2>
    <p class="text-xs text-gray-400 font-inter mb-5">${flagged.length} flagged conversation${flagged.length !== 1 ? 's' : ''} for ${escHtml(selectedChildName ?? 'your child')}</p>
    <div class="space-y-3">
      ${flagged.map(c => {
        const title   = c.title ?? ('Chat ' + String(c.id).slice(0, 6));
        const dateStr = new Date(c.updated_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
        return `
          <div class="bg-white rounded-2xl border border-red-100 p-4 shadow-sm flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
              <svg class="w-5 h-5 text-[#EE6742]" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd"/>
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold font-jakarta text-[#0A3D3C] truncate">${escHtml(title)}</p>
              <p class="text-xs text-gray-400 font-inter mt-0.5">${escHtml(dateStr)}</p>
            </div>
            <button
              class="flex-shrink-0 text-xs font-semibold font-jakarta text-white bg-[#EE6742] hover:bg-[#d4502b] rounded-full px-4 py-2 cursor-pointer transition-colors duration-150"
              onclick="window._openConvViewer('${escHtml(String(c.id))}', '${escHtml(title)}', true)">
              Review
            </button>
          </div>`;
      }).join('')}
    </div>`;
  
  // After rendering, switch to Conversations tab after review button so thread shows there
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

- [ ] **Step 3.2: Commit JS**

```bash
git add frontend/js/parent.js
git commit -m "feat: add parent dashboard JS with child selector, conversations, sessions, safety, translate"
```

---

## Task 4: End-to-End Manual Verification

**No automated browser tests — verify each flow manually.**

- [ ] **Step 4.1: Open the parent dashboard as admin**

1. Open `http://localhost:3001/frontend/index.html`
2. Sign in with Google (admin account: dinhdobathi3@gmail.com)
3. After login, confirm you are redirected to `/frontend/dashboard-parent.html`

**If redirect goes to teacher dashboard instead:**
The `routeByRole` in `auth.js` maps `admin` → teacher page. Since we're testing parent as admin, temporarily change role in sessionStorage or test directly:
```javascript
// In browser console:
sessionStorage.setItem('user_role', 'parent');
location.reload();
```

**Expected:** Page shows "Parent" badge in header, children list populates in left sidebar.

- [ ] **Step 4.2: Verify children list shows real names (not UUIDs)**

**Expected left sidebar:** Shows "Đình Đỗ Bá Thi", "learner-alice-00", "dev-service" — NOT raw UUIDs.

**If you see empty list:** Check browser console for network errors. Verify backend is running (`curl -s http://localhost:8001/health`).

- [ ] **Step 4.3: Verify conversations tab auto-loads on child select**

Click a child. Without switching tabs:
- Left panel should show conversation list (e.g. "Chat e7e93a…" with "Flagged" label)
- Right panel should show the empty-state "Select a conversation" prompt

**Expected:** No "User" fallbacks, no raw IDs in conversation titles.

- [ ] **Step 4.4: Verify privacy modal gates conversation opening**

Click a conversation in the list.

**Expected:** Privacy reminder modal appears. Click "Cancel" → modal closes, thread stays empty. Click conversation again → modal appears. Click "I understand, view conversation" → messages load in thread pane.

- [ ] **Step 4.5: Verify message rendering**

In the thread after confirming privacy:
- Learner messages: dark teal bubble, right-aligned
- Assistant messages: white card, left-aligned
- Hover a message → "Translate" button appears below it

**Expected:** No raw `null` shown for `is_safe`. Safety flags only appear on messages where `is_safe === false`.

- [ ] **Step 4.6: Verify translate modal**

Hover a message → click "Translate". Select "Vietnamese" → click "Translate".

**Expected:** Translated text appears in the result box. If LiteLLM is unavailable, translation returns the original text (graceful fallback in the service).

- [ ] **Step 4.7: Verify Safety tab badge + content**

Click "Safety" tab.

**Expected:** Red badge shows count of flagged conversations. Safety tab content shows flagged conversations as cards with "Review" button. Clicking "Review" opens privacy modal then loads conversation in the Conversations tab thread.

- [ ] **Step 4.8: Verify Sessions tab empty state**

Click "Sessions" tab.

**Expected:** Empty state with graduation cap icon and "No sessions yet" message (since no sessions exist in dev DB). No crash, no raw error.

- [ ] **Step 4.9: Verify switching children clears previous data**

Click a second child from the sidebar.

**Expected:** Conversation list reloads for new child. Thread pane resets to empty state ("Select a conversation"). Safety badge updates. Previously selected conversation is no longer highlighted.

- [ ] **Step 4.10: Final commit if all checks pass**

```bash
git add -A
git commit -m "feat: complete parent dashboard — children, conversations, sessions, safety, translate"
```

---

## Self-Review

**Spec coverage:**
- ✅ Children list with real names (not UUIDs) — Task 1
- ✅ Admin bypass — Task 1, Step 1.3
- ✅ 3-tab layout — Task 2 HTML
- ✅ Auto-select first child — Task 3, `loadChildren()`
- ✅ Conversation list with flagged markers — Task 3, `loadConversations()`
- ✅ Privacy modal gates all conversation views — Task 3, `_openConvViewer()`
- ✅ Message thread with safety flag indicators — Task 3, `parentMsgHTML()`
- ✅ Per-message translate button (hover reveal) — Task 3, `parentMsgHTML()` + `_openTranslateModal()`
- ✅ Sessions as cards — Task 3, `sessionCardHTML()`
- ✅ Teacher notes per session (collapsible) — Task 3, `_loadSessionGuidance()`
- ✅ Safety tab with flagged conversations only — Task 3, `loadSafety()`
- ✅ Safety badge count on tab — Task 3, `updateSafetyBadge()`
- ✅ Child switcher resets all panes — Task 3, `_selectChild()`

**Placeholder scan:** None found. All code is complete.

**Type consistency:** `child.id`, `child.name` used consistently. `conv.id`, `conv.is_flagged`, `conv.title` consistent. `msg.role`, `msg.content`, `msg.is_safe` consistent. `session.id`, `session.title`, `session.status` consistent. `guidance.guidance_type`, `guidance.content` consistent.
