# Teacher Parent Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow teachers to assign/remove parent links for students via the teacher dashboard UI.

**Architecture:** Add `email` column to `users` (needed for lookup by email), 3 new REST endpoints under `/api/teacher/students/:studentId/parents`, and a "Parents" collapsible section in the student panel of the teacher dashboard.

**Tech Stack:** Fastify + TypeScript + Kysely (backend), Tailwind CDN + Vanilla ES modules (frontend, port 3001)

---

### Task 1: Add email column to users + persist in auth

**Files:**
- Modify: `nodejs-app/src/db/kysely.ts` — add `email` to `UsersTable`
- Modify: `nodejs-app/src/routes/authRoutes.ts` — persist email in INSERT and UPDATE

- [ ] **Step 1: Add email column to the live DB**

Run:
```bash
psql postgresql://jurnee:jurnee_secret@localhost:5432/childai_node -c "ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;"
```

Expected: `ALTER TABLE`

- [ ] **Step 2: Add email to UsersTable in `nodejs-app/src/db/kysely.ts`**

In `UsersTable` interface, after `display_name`:
```typescript
email: string | null;
```

- [ ] **Step 3: Persist email in auth upsert in `nodejs-app/src/routes/authRoutes.ts`**

The file already has:
```typescript
const email = googleUser.email ?? '';
```

Change the INSERT to include email:
```typescript
const inserted = await db.query(
  `INSERT INTO users (external_subject, primary_role, display_name, email, preferred_language)
   VALUES ($1, $2, $3, $4, 'en')
   RETURNING id, primary_role`,
  [externalSubject, role, displayName, email || null]
);
```

Change the UPDATE to also sync email (email doesn't change between logins but may be missing on old rows):
```typescript
await db.query(
  `UPDATE users SET
    display_name = COALESCE(NULLIF($1, 'User'), display_name),
    email = COALESCE(email, NULLIF($2, '')),
    primary_role = $3
   WHERE external_subject = $4`,
  [displayName, email || null, role, externalSubject]
);
```

- [ ] **Step 4: Back-fill emails for existing Google-auth users from display_name heuristic (skip — will be filled on next login)**

Nothing to do — rows get email on next login.

- [ ] **Step 5: Build check**

Run:
```bash
cd nodejs-app && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add nodejs-app/src/db/kysely.ts nodejs-app/src/routes/authRoutes.ts
git commit -m "feat: add email column to users table and persist on every login"
```

---

### Task 2: Backend — parent management endpoints

**Files:**
- Modify: `nodejs-app/src/routes/teacherRoutes.ts` — add 3 new routes at the bottom before the closing `}`

**Endpoints:**
- `GET  /api/teacher/students/:studentId/parents`
- `POST /api/teacher/students/:studentId/parents`  body: `{ email: string }`
- `DELETE /api/teacher/students/:studentId/parents/:parentId`

Auth: `teacherGuard` (already defined in the file as `requireRole('teacher','admin')`) + `rateLimitFor('teacher')`.

- [ ] **Step 1: Read the end of `nodejs-app/src/routes/teacherRoutes.ts`**

Confirm the file ends with the closing `};` of the `teacherRoutes` plugin. The new routes go above that line. Also note the imports already present — `Type`, `authenticate`, `requireRole`, `rateLimitFor`, `getDb` are all imported.

- [ ] **Step 2: Add the 3 endpoints**

Paste this block immediately before the final `};` of the plugin function:

```typescript
  // GET /api/teacher/students/:studentId/parents
  fastify.get(
    '/api/teacher/students/:studentId/parents',
    {
      schema: {
        tags: ['teacher'],
        summary: 'List linked parents for a student',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: Type.Object({ studentId: Type.String({ format: 'uuid' }) }),
      },
      preHandler: [authenticate, teacherGuard, rateLimitFor('teacher')],
    },
    async (request, reply) => {
      const { studentId } = request.params as { studentId: string };
      const db = getDb();
      const rows = await db
        .selectFrom('parent_child_links as l')
        .innerJoin('users as u', 'u.id', 'l.parent_user_id')
        .select(['l.id as link_id', 'u.id as parent_id', 'u.display_name', 'u.email', 'l.relationship_type'])
        .where('l.child_user_id', '=', studentId)
        .where('l.status', '=', 'active')
        .execute();
      return reply.send({
        parents: (rows as any[]).map(r => ({
          link_id: r.link_id,
          parent_id: r.parent_id,
          name: r.display_name?.trim() || r.email?.split('@')[0] || 'Parent',
          email: r.email ?? null,
          relationship_type: r.relationship_type,
        })),
      });
    }
  );

  // POST /api/teacher/students/:studentId/parents
  fastify.post(
    '/api/teacher/students/:studentId/parents',
    {
      schema: {
        tags: ['teacher'],
        summary: 'Link a parent to a student by email',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: Type.Object({ studentId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          email: Type.String({ format: 'email', minLength: 3, maxLength: 200 }),
        }),
      },
      preHandler: [authenticate, teacherGuard, rateLimitFor('teacher')],
    },
    async (request, reply) => {
      const { studentId } = request.params as { studentId: string };
      const { email } = request.body as { email: string };
      const db = getDb();

      // Look up parent user by email
      const parentUser = await db
        .selectFrom('users')
        .select(['id', 'primary_role', 'display_name'])
        .where('email', '=', email.toLowerCase().trim())
        .executeTakeFirst();

      if (!parentUser) {
        return reply.status(404).send({ error: 'No user found with that email. They must log in at least once first.' });
      }
      if (parentUser.primary_role !== 'parent' && parentUser.primary_role !== 'admin') {
        return reply.status(400).send({ error: `User role is '${parentUser.primary_role}', not 'parent'. Update their role first.` });
      }

      // Check child exists
      const childUser = await db
        .selectFrom('users')
        .select('id')
        .where('id', '=', studentId)
        .executeTakeFirst();
      if (!childUser) return reply.status(404).send({ error: 'Student not found' });

      // Check link doesn't already exist
      const existing = await db
        .selectFrom('parent_child_links')
        .select('id')
        .where('parent_user_id', '=', parentUser.id)
        .where('child_user_id', '=', studentId)
        .where('status', '=', 'active')
        .executeTakeFirst();
      if (existing) return reply.status(409).send({ error: 'Parent is already linked to this student' });

      const pool = (await import('../db/pool')).getPool();
      const inserted = await pool.query(
        `INSERT INTO parent_child_links (parent_user_id, child_user_id, relationship_type, status, consent_source)
         VALUES ($1, $2, 'parent', 'active', 'teacher_assigned')
         RETURNING id`,
        [parentUser.id, studentId]
      );

      return reply.status(201).send({
        link: {
          link_id: inserted.rows[0].id,
          parent_id: parentUser.id,
          name: parentUser.display_name?.trim() || email.split('@')[0],
          email,
          relationship_type: 'parent',
        },
      });
    }
  );

  // DELETE /api/teacher/students/:studentId/parents/:parentId
  fastify.delete(
    '/api/teacher/students/:studentId/parents/:parentId',
    {
      schema: {
        tags: ['teacher'],
        summary: 'Remove a parent link from a student',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: Type.Object({
          studentId: Type.String({ format: 'uuid' }),
          parentId: Type.String({ format: 'uuid' }),
        }),
      },
      preHandler: [authenticate, teacherGuard, rateLimitFor('teacher')],
    },
    async (request, reply) => {
      const { studentId, parentId } = request.params as { studentId: string; parentId: string };
      const db = getDb();
      const result = await db
        .deleteFrom('parent_child_links')
        .where('child_user_id', '=', studentId)
        .where('parent_user_id', '=', parentId)
        .where('status', '=', 'active')
        .executeTakeFirst();
      if (!result || Number(result.numDeletedRows) === 0) {
        return reply.status(404).send({ error: 'Link not found' });
      }
      return reply.status(204).send();
    }
  );
```

- [ ] **Step 3: Build check**

```bash
cd nodejs-app && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 4: Curl smoke test — GET (should return existing Jason→Thi link)**

```bash
curl -s -H "x-api-key: dev-local-api-key" \
  "http://localhost:8001/api/teacher/students/bcc8c3fb-e34b-4904-ad4e-3637b18d833b/parents" | python3 -m json.tool
```

Expected: `{ "parents": [ { "link_id": "...", "parent_id": "d07b3aa2-...", "name": "...", "email": "jasonadwards92@gmail.com", ... } ] }`

Note: email may be null until Jason logs in again. The name should show.

- [ ] **Step 5: Commit**

```bash
git add nodejs-app/src/routes/teacherRoutes.ts
git commit -m "feat: add teacher endpoints to list/add/remove parent links per student"
```

---

### Task 3: Frontend — Parents section in teacher dashboard

**Files:**
- Modify: `frontend/dashboard-teacher.html` — add parents section HTML inside `#student-panel`
- Modify: `frontend/js/teacher.js` — add `loadStudentParents`, `_submitAddParent`, `_removeParentLink` functions; call `loadStudentParents` from `_selectStudent`

**UI spec:**
- Inside `#student-panel`, below `#teacher-conv-list`, add a thin `border-t` divider then a "Parents" section
- Section header: label "PARENTS" (same style as "STUDENTS" header) + small "+ Add" teal button
- Add form: `#parent-add-form` (hidden by default), email input + "Link" button + "Cancel" button
- Parents list: `#parents-list` — each item is name (bold) + email (muted) + remove button (×)
- Empty state in list: "No parents linked"

- [ ] **Step 1: Add HTML to `frontend/dashboard-teacher.html`**

Inside `#student-panel` div, after `<div class="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5 pt-1" id="teacher-conv-list"></div>`, add:

```html
        <!-- Parents section -->
        <div class="border-t border-[#DAF0EE] flex-shrink-0 pb-3">
          <div class="flex items-center justify-between px-3 pt-2 pb-1">
            <p class="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Parents</p>
            <button id="add-parent-btn"
                    onclick="window._toggleAddParentForm()"
                    class="text-[10px] font-semibold text-[#0A3D3C] bg-[#DAF0EE] hover:bg-[#c5e8e4] rounded-full px-2 py-0.5 cursor-pointer transition-colors">
              + Add
            </button>
          </div>
          <!-- Add form (hidden) -->
          <div id="parent-add-form" class="hidden px-3 pb-2">
            <input id="parent-email-input" type="email" placeholder="parent@email.com"
                   class="w-full text-xs border border-[#DAF0EE] rounded-lg px-2 py-1.5 mb-1.5 focus:outline-none focus:border-[#0A3D3C]" />
            <div class="flex gap-1.5">
              <button onclick="window._submitAddParent()"
                      class="flex-1 text-xs font-semibold bg-[#0A3D3C] text-white rounded-lg py-1 cursor-pointer hover:bg-[#0d4f4e] transition-colors">
                Link
              </button>
              <button onclick="window._cancelAddParent()"
                      class="flex-1 text-xs text-gray-500 border border-gray-200 rounded-lg py-1 cursor-pointer hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
          <!-- Parents list -->
          <div id="parents-list" class="px-2 space-y-1"></div>
        </div>
```

- [ ] **Step 2: Add functions to `frontend/js/teacher.js`**

Add after the `escHtml` function (end of file):

```javascript
// ─── Parent Management ─────────────────────────────────────────────────────────

async function loadStudentParents(studentId) {
  const list = document.getElementById('parents-list');
  if (!list) return;
  list.innerHTML = '<p class="text-xs text-gray-400 px-1 py-1">Loading…</p>';
  try {
    const data = await api.get(`/api/teacher/students/${studentId}/parents`);
    const parents = data?.parents ?? [];
    if (!parents.length) {
      list.innerHTML = '<p class="text-xs text-gray-400 px-1 py-1 text-center">No parents linked</p>';
      return;
    }
    list.innerHTML = parents.map(p => `
      <div class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#F3F0FF] group">
        <div class="w-7 h-7 rounded-full bg-[#EDE9FE] flex items-center justify-center text-[#7C3AED] text-xs font-bold flex-shrink-0">
          ${escHtml((p.name || 'P')[0].toUpperCase())}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-semibold font-jakarta text-[#0A3D3C] truncate">${escHtml(p.name)}</p>
          ${p.email ? `<p class="text-[10px] text-gray-400 truncate">${escHtml(p.email)}</p>` : ''}
        </div>
        <button
          onclick="window._removeParentLink('${escHtml(p.parent_id)}', this)"
          class="hidden group-hover:flex text-xs text-gray-300 hover:text-[#EE6742] cursor-pointer transition-colors px-1"
          title="Remove parent link">×</button>
      </div>
    `).join('');
  } catch {
    list.innerHTML = '<p class="text-xs text-[#EE6742] px-1 py-1">Failed to load</p>';
  }
}

window._toggleAddParentForm = function() {
  const form = document.getElementById('parent-add-form');
  const input = document.getElementById('parent-email-input');
  if (!form) return;
  const isHidden = form.classList.contains('hidden');
  form.classList.toggle('hidden', !isHidden);
  if (isHidden && input) { input.value = ''; input.focus(); }
};

window._cancelAddParent = function() {
  const form = document.getElementById('parent-add-form');
  if (form) form.classList.add('hidden');
};

window._submitAddParent = async function() {
  if (!selectedStudentId) return;
  const input = document.getElementById('parent-email-input');
  const email = input?.value?.trim();
  if (!email) return;

  const btn = document.querySelector('#parent-add-form button:first-of-type');
  if (btn) { btn.textContent = 'Linking…'; btn.disabled = true; }

  try {
    await api.post(`/api/teacher/students/${selectedStudentId}/parents`, { email });
    document.getElementById('parent-add-form')?.classList.add('hidden');
    await loadStudentParents(selectedStudentId);
  } catch (err) {
    const msg = err?.message || 'Failed';
    alert(msg);
  } finally {
    if (btn) { btn.textContent = 'Link'; btn.disabled = false; }
  }
};

window._removeParentLink = async function(parentId, btn) {
  if (!selectedStudentId) return;
  if (!confirm('Remove this parent link?')) return;
  btn.textContent = '…';
  try {
    await api.delete(`/api/teacher/students/${selectedStudentId}/parents/${parentId}`);
    await loadStudentParents(selectedStudentId);
  } catch {
    alert('Failed to remove');
    btn.textContent = '×';
  }
};
```

- [ ] **Step 3: Call `loadStudentParents` from `_selectStudent`**

In `_selectStudent` function, after `document.getElementById('student-panel').classList.remove('hidden');`, add:
```javascript
  loadStudentParents(studentId);
```

- [ ] **Step 4: Check `api.delete` exists in `api.js`**

Run:
```bash
grep -n "delete\|Delete" /Users/thi/Devops/JurneeGo_Assignment/childAI/frontend/js/api.js
```

If `delete` method is missing, add it to the `api` object in `api.js`:
```javascript
delete: (path) => request('DELETE', path),
```

- [ ] **Step 5: Smoke test via browser**

1. Refresh teacher dashboard (Cmd+Shift+R)
2. Click on a student — "Parents" section should appear below conversations
3. Click "+ Add" → type `jasonadwards92@gmail.com` → click "Link"
4. Should show Jason's name in the parents list

- [ ] **Step 6: Commit**

```bash
git add frontend/dashboard-teacher.html frontend/js/teacher.js frontend/js/api.js
git commit -m "feat: add parents management section to teacher student panel"
```
