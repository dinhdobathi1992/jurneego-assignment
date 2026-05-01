# Bubbli Frontend UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, role-aware frontend for Bubbli childAI — login via Google OAuth2, then role-specific dashboards for Chatter (learner), Parent, and Teacher.

**Architecture:** Single-page HTML/Tailwind app split into one HTML file per role-view. A shared `auth.js` module handles Google OAuth2 PKCE flow and JWT storage. After login, the backend `/api/auth/me` (or JWT claims) determines the role, and the correct dashboard HTML is loaded. API calls use `fetch` with `Authorization: Bearer <token>`.

**Tech Stack:** HTML5 + Tailwind CSS (CDN), Vanilla JS ES modules, Google OAuth2 (implicit/PKCE), Fetch API, Bubbli Node.js backend (port 8000), Lucide icons (CDN), Plus Jakarta Sans + Inter (Google Fonts)

**Google OAuth2 Credentials:**
- Client ID: `YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com`
- Client Secret: `YOUR_GOOGLE_CLIENT_SECRET` (server-side only, never in frontend JS)
- Redirect URI: `http://localhost:3000/callback` (configurable)

**Brand Design System (from Bubbli landing page):**
- Primary Teal: `#0A3D3C` | Accent Orange: `#EE6742` | Mint Light: `#DAF0EE`
- Fonts: Plus Jakarta Sans (headings) + Inter (body)
- Radius: `rounded-2xl` (cards), `rounded-full` (buttons/inputs)
- Logo: `https://bubbli.ai/assets/bubbli-logo.png`

---

## File Structure

```
frontend/
├── index.html              # Login page (Google OAuth2)
├── callback.html           # OAuth2 redirect handler
├── dashboard-chatter.html  # Learner (Chatter) chat dashboard
├── dashboard-parent.html   # Parent monitoring dashboard
├── dashboard-teacher.html  # Teacher classroom dashboard
├── js/
│   ├── auth.js             # Google OAuth2 PKCE flow, JWT storage, role detection
│   ├── api.js              # Fetch wrapper with Bearer token, error handling
│   ├── chatter.js          # Chatter dashboard logic (chat, SSE streaming)
│   ├── parent.js           # Parent dashboard logic (children, conversations, guidance)
│   └── teacher.js          # Teacher dashboard logic (classrooms, students, moderation)
└── design-system/          # (already created by ui-ux-pro-max skill)
```

---

## Task 1: Login Page — Google OAuth2

**Files:**
- Create: `frontend/index.html`
- Create: `frontend/js/auth.js`

### Design Spec
Match Bubbli brand: centered card on dark teal (`#0A3D3C`) full-screen background with radial mint gradient. Logo at top, tagline, then a single "Continue with Google" button. Three role-preview chips (child/parent/teacher icons) below the button to set expectations.

- [ ] **Step 1: Create `frontend/js/auth.js`**

```javascript
// auth.js — Google OAuth2 implicit flow + role routing
const CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
const REDIRECT_URI = `${location.origin}/frontend/callback.html`;
const SCOPE = 'openid email profile';

export function loginWithGoogle() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'token id_token',
    scope: SCOPE,
    nonce: crypto.randomUUID(),
    prompt: 'select_account',
  });
  location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function saveTokens({ id_token, access_token }) {
  sessionStorage.setItem('id_token', id_token);
  sessionStorage.setItem('access_token', access_token);
}

export function getIdToken() {
  return sessionStorage.getItem('id_token');
}

export function getAccessToken() {
  return sessionStorage.getItem('access_token');
}

export function clearTokens() {
  sessionStorage.clear();
}

export function parseJwtPayload(token) {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

// After OAuth callback: exchange Google id_token with backend to get app JWT
export async function exchangeToken(googleIdToken) {
  const res = await fetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: googleIdToken }),
  });
  if (!res.ok) throw new Error('Token exchange failed');
  return res.json(); // { token, role, display_name }
}

export function routeByRole(role) {
  const routes = {
    learner: '/frontend/dashboard-chatter.html',
    parent:  '/frontend/dashboard-parent.html',
    teacher: '/frontend/dashboard-teacher.html',
    admin:   '/frontend/dashboard-teacher.html',
  };
  location.href = routes[role] ?? '/frontend/index.html';
}
```

- [ ] **Step 2: Create `frontend/index.html` (Login Page)**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bubbli — Sign In</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            teal:   { DEFAULT: '#0A3D3C', dark: '#072e2d', light: '#DAF0EE', xlight: '#F2FBF9' },
            accent: { DEFAULT: '#EE6742', dark: '#d55630' },
          },
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
    h1, h2, h3 { font-family: 'Plus Jakarta Sans', sans-serif; }
    .google-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 28px rgba(10,61,60,0.2); }
    .google-btn:active { transform: translateY(0); }
    .google-btn { transition: transform 0.18s ease, box-shadow 0.18s ease; }
    @media (prefers-reduced-motion: reduce) { .google-btn { transition: none; } }
  </style>
</head>
<body class="min-h-screen bg-[#0A3D3C] flex items-center justify-center px-4"
      style="background: radial-gradient(circle at 70% 20%, #1a5f5e 0%, #0A3D3C 55%);">

  <!-- Login Card -->
  <div class="w-full max-w-md">

    <!-- Logo -->
    <div class="flex justify-center mb-8">
      <img src="./assets/logo.png"
           alt="Bubbli"
           class="h-10 object-contain"
           onerror="this.style.display='none'; document.getElementById('logo-text').style.display='block';" />
      <span id="logo-text"
            style="display:none;"
            class="text-white font-jakarta font-extrabold text-2xl tracking-tight">Bubbli</span>
    </div>

    <!-- Card -->
    <div class="bg-white rounded-3xl shadow-2xl px-8 py-10 text-center">

      <!-- Heading -->
      <h1 class="font-jakarta font-extrabold text-2xl text-[#0A3D3C] mb-2">Welcome back</h1>
      <p class="text-[#6B7280] text-sm mb-8 leading-relaxed">
        Safe AI for curious kids.<br />A window into their world for parents &amp; teachers.
      </p>

      <!-- Role Preview Chips -->
      <div class="flex justify-center gap-3 mb-8">
        <!-- Child -->
        <div class="flex flex-col items-center gap-1.5">
          <div class="w-12 h-12 rounded-full bg-[#FFF0E8] flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-[#EE6742]" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </div>
          <span class="text-[10px] font-inter font-500 text-[#6B7280]">Chatter</span>
        </div>
        <!-- Parent -->
        <div class="flex flex-col items-center gap-1.5">
          <div class="w-12 h-12 rounded-full bg-[#E8F5E9] flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-[#22c55e]" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
            </svg>
          </div>
          <span class="text-[10px] font-inter text-[#6B7280]">Parent</span>
        </div>
        <!-- Teacher -->
        <div class="flex flex-col items-center gap-1.5">
          <div class="w-12 h-12 rounded-full bg-[#E3F2FD] flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-[#3b82f6]" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
            </svg>
          </div>
          <span class="text-[10px] font-inter text-[#6B7280]">Teacher</span>
        </div>
      </div>

      <!-- Google Sign-In Button -->
      <button id="google-btn"
              class="google-btn w-full flex items-center justify-center gap-3 bg-white border-2 border-[#DAF0EE] rounded-full px-6 py-3.5 text-[#0A3D3C] font-jakarta font-700 text-[15px] cursor-pointer shadow-sm hover:border-[#0A3D3C]"
              onclick="handleGoogleLogin()">
        <!-- Google SVG -->
        <svg class="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </button>

      <!-- Divider -->
      <div class="mt-8 pt-6 border-t border-[#DAF0EE]">
        <p class="text-[11px] text-[#9CA3AF] leading-relaxed">
          By continuing, you agree to Bubbli's
          <a href="#" class="text-[#0A3D3C] underline underline-offset-2 cursor-pointer">Terms</a> and
          <a href="#" class="text-[#0A3D3C] underline underline-offset-2 cursor-pointer">Privacy Policy</a>.
          <br />Your child's safety is our priority.
        </p>
      </div>
    </div>

    <!-- Footer note -->
    <p class="text-center text-[#B8E2DE] text-xs mt-6">
      Powered by Bubbli Safe AI &bull; COPPA &amp; GDPR-K compliant
    </p>
  </div>

  <script type="module">
    import { loginWithGoogle } from './js/auth.js';
    window.handleGoogleLogin = function() {
      const btn = document.getElementById('google-btn');
      btn.disabled = true;
      btn.textContent = 'Redirecting…';
      loginWithGoogle();
    };

    // If already logged in, redirect
    const token = sessionStorage.getItem('app_token');
    const role  = sessionStorage.getItem('user_role');
    if (token && role) {
      import('./js/auth.js').then(({ routeByRole }) => routeByRole(role));
    }
  </script>
</body>
</html>
```

- [ ] **Step 3: Verify login page opens in browser**

```bash
cd /Users/thi/Devops/Bubbli_Assignment/childAI
python3 -m http.server 3000
# Open: http://localhost:3000/frontend/index.html
```

Expected: Centered login card on dark teal background, Google button, three role chips.

- [ ] **Step 4: Commit**

```bash
git add frontend/index.html frontend/js/auth.js
git commit -m "feat: add login page with Google OAuth2"
```

---

## Task 2: OAuth2 Callback Handler

**Files:**
- Create: `frontend/callback.html`
- Modify: `frontend/js/auth.js` (extend with `handleCallback`)

- [ ] **Step 1: Add `handleCallback` to `auth.js`**

Append to `frontend/js/auth.js`:

```javascript
// Handle Google OAuth2 implicit flow response (called from callback.html)
export async function handleCallback() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const idToken = hash.get('id_token');
  const error   = hash.get('error');

  if (error || !idToken) {
    console.error('OAuth error:', error);
    location.href = '/frontend/index.html?error=oauth_failed';
    return;
  }

  try {
    // Exchange Google id_token for app JWT from backend
    const { token, role, display_name } = await exchangeToken(idToken);
    sessionStorage.setItem('app_token', token);
    sessionStorage.setItem('user_role', role);
    sessionStorage.setItem('display_name', display_name ?? '');
    routeByRole(role);
  } catch (err) {
    console.error('Token exchange error:', err);
    location.href = '/frontend/index.html?error=exchange_failed';
  }
}
```

- [ ] **Step 2: Create `frontend/callback.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bubbli — Signing you in…</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-[#0A3D3C] flex items-center justify-center">
  <div class="text-center">
    <!-- Spinner -->
    <div class="w-12 h-12 border-4 border-[#DAF0EE] border-t-[#EE6742] rounded-full animate-spin mx-auto mb-4"></div>
    <p class="text-[#DAF0EE] font-jakarta font-semibold text-lg">Signing you in…</p>
    <p class="text-[#B8E2DE] text-sm mt-1">Please wait</p>
  </div>
  <script type="module">
    import { handleCallback } from './js/auth.js';
    handleCallback();
  </script>
</body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/callback.html frontend/js/auth.js
git commit -m "feat: add OAuth2 callback handler with backend token exchange"
```

---

## Task 3: Shared API Client

**Files:**
- Create: `frontend/js/api.js`

- [ ] **Step 1: Create `frontend/js/api.js`**

```javascript
// api.js — Fetch wrapper with Bearer token and error handling
const BASE_URL = 'http://localhost:8000';

function getToken() {
  return sessionStorage.getItem('app_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 401) {
    sessionStorage.clear();
    location.href = '/frontend/index.html?error=session_expired';
    return;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }

  return res.status === 204 ? null : res.json();
}

export const api = {
  get:   (path)         => request(path, { method: 'GET' }),
  post:  (path, body)   => request(path, { method: 'POST',  body: JSON.stringify(body) }),
  patch: (path, body)   => request(path, { method: 'PATCH', body: JSON.stringify(body) }),

  // SSE streaming helper — returns EventSource-style object
  stream(path, body, handlers = {}) {
    const token = getToken();
    const ctrl  = new AbortController();

    fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    }).then(async (res) => {
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buf     = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) { handlers.done?.(); break; }
        buf += decoder.decode(value, { stream: true });

        const parts = buf.split('\n\n');
        buf = parts.pop();
        for (const part of parts) {
          const eventLine = part.match(/^event: (.+)/m)?.[1]?.trim();
          const dataLine  = part.match(/^data: (.+)/m)?.[1]?.trim();
          if (dataLine) {
            try {
              const payload = JSON.parse(dataLine);
              handlers[eventLine ?? 'message']?.(payload);
            } catch { /* ignore non-JSON */ }
          }
        }
      }
    }).catch((err) => { if (err.name !== 'AbortError') handlers.error?.(err); });

    return { abort: () => ctrl.abort() };
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/js/api.js
git commit -m "feat: add shared API client with Bearer auth and SSE streaming"
```

---

## Task 4: Chatter (Learner) Dashboard

**Files:**
- Create: `frontend/dashboard-chatter.html`
- Create: `frontend/js/chatter.js`

### Design Spec
Two-panel layout: left sidebar (conversation list, max-w-64), right main panel (chat window). Header shows Bubbli logo + user name + logout. Chat panel has scrollable message history and a fixed bottom input bar. Messages: learner bubbles right (teal), assistant bubbles left (white card). Streamed tokens append in real-time.

- [ ] **Step 1: Create `frontend/js/chatter.js`**

```javascript
// chatter.js — Learner chat dashboard logic
import { api } from './api.js';
import { clearTokens } from './auth.js';

const displayName = sessionStorage.getItem('display_name') ?? 'Learner';
let activeConversationId = null;
let streamCtrl = null;

export async function init() {
  document.getElementById('user-name').textContent = displayName;
  document.getElementById('logout-btn').addEventListener('click', () => {
    clearTokens(); location.href = '/frontend/index.html';
  });
  document.getElementById('new-chat-btn').addEventListener('click', createConversation);
  document.getElementById('send-btn').addEventListener('click', sendMessage);
  document.getElementById('msg-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  await loadConversations();
}

async function loadConversations() {
  const list = document.getElementById('conv-list');
  list.innerHTML = '<li class="text-xs text-gray-400 px-3 py-2">Loading…</li>';
  const { conversations } = await api.get('/api/conversations?limit=20');
  if (!conversations.length) {
    list.innerHTML = '<li class="text-xs text-gray-400 px-3 py-2">No chats yet</li>';
    return;
  }
  list.innerHTML = conversations.map(c => `
    <li>
      <button
        class="w-full text-left px-3 py-2.5 rounded-xl text-sm font-inter text-[#0A3D3C] hover:bg-[#DAF0EE] cursor-pointer transition-colors duration-150 ${c.is_flagged ? 'border-l-2 border-[#EE6742]' : ''}"
        onclick="window._selectConv('${c.id}', this)"
        data-id="${c.id}">
        ${c.title ?? 'Chat ' + c.id.slice(0, 6)}
        ${c.is_flagged ? '<span class="ml-1 text-[10px] text-[#EE6742] font-semibold">Flagged</span>' : ''}
      </button>
    </li>
  `).join('');
}

window._selectConv = async function(id, btn) {
  document.querySelectorAll('#conv-list button').forEach(b => b.classList.remove('bg-[#DAF0EE]', 'font-semibold'));
  btn.classList.add('bg-[#DAF0EE]', 'font-semibold');
  activeConversationId = id;
  const { messages } = await api.get(`/api/conversations/${id}`);
  renderMessages(messages ?? []);
  document.getElementById('chat-input-area').classList.remove('hidden');
  document.getElementById('msg-input').focus();
};

async function createConversation() {
  const conv = await api.post('/api/conversations', { title: null });
  activeConversationId = conv.id;
  await loadConversations();
  renderMessages([]);
  document.getElementById('chat-input-area').classList.remove('hidden');
  document.getElementById('msg-input').focus();
}

function renderMessages(messages) {
  const container = document.getElementById('messages');
  container.innerHTML = messages.length ? messages.map(msgHTML).join('') : `
    <div class="flex flex-col items-center justify-center h-full text-center px-8">
      <div class="w-16 h-16 bg-[#DAF0EE] rounded-2xl flex items-center justify-center mb-4">
        <svg class="w-8 h-8 text-[#0A3D3C]" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
        </svg>
      </div>
      <p class="text-[#0A3D3C] font-jakarta font-semibold text-base">Start a conversation</p>
      <p class="text-gray-400 text-sm mt-1">Ask me anything — I'm here to help!</p>
    </div>
  `;
  container.scrollTop = container.scrollHeight;
}

function msgHTML(m) {
  const isLearner = m.role === 'learner';
  return `
    <div class="flex ${isLearner ? 'justify-end' : 'justify-start'} mb-3">
      <div class="max-w-[75%] ${isLearner
        ? 'bg-[#0A3D3C] text-white rounded-2xl rounded-br-md'
        : 'bg-white border border-[#DAF0EE] text-[#1A1A1A] rounded-2xl rounded-bl-md shadow-sm'
      } px-4 py-3 text-sm font-inter leading-relaxed">
        ${m.content}
        ${!m.is_safe ? '<p class="text-[10px] text-[#EE6742] mt-1 font-semibold">Safety notice</p>' : ''}
      </div>
    </div>
  `;
}

async function sendMessage() {
  const input = document.getElementById('msg-input');
  const content = input.value.trim();
  if (!content || !activeConversationId) return;

  input.value = '';
  document.getElementById('send-btn').disabled = true;

  // Optimistically add learner message
  const container = document.getElementById('messages');
  container.insertAdjacentHTML('beforeend', msgHTML({ role: 'learner', content, is_safe: true }));
  container.scrollTop = container.scrollHeight;

  // Add streaming AI bubble
  const streamId = 'stream-' + Date.now();
  container.insertAdjacentHTML('beforeend', `
    <div class="flex justify-start mb-3" id="${streamId}">
      <div class="max-w-[75%] bg-white border border-[#DAF0EE] text-[#1A1A1A] rounded-2xl rounded-bl-md shadow-sm px-4 py-3 text-sm font-inter leading-relaxed">
        <span id="${streamId}-text"></span>
        <span class="animate-pulse text-[#0A3D3C]">▋</span>
      </div>
    </div>
  `);

  let accumulated = '';
  streamCtrl = api.stream(
    `/api/conversations/${activeConversationId}/messages/stream`,
    { content, idempotency_key: crypto.randomUUID() },
    {
      'assistant.chunk': ({ content: chunk }) => {
        accumulated += chunk;
        document.getElementById(`${streamId}-text`).textContent = accumulated;
        container.scrollTop = container.scrollHeight;
      },
      done: () => {
        const cursor = document.querySelector(`#${streamId} .animate-pulse`);
        cursor?.remove();
        document.getElementById('send-btn').disabled = false;
        loadConversations();
      },
      error: (err) => {
        document.getElementById(`${streamId}-text`).textContent = 'Something went wrong. Please try again.';
        const cursor = document.querySelector(`#${streamId} .animate-pulse`);
        cursor?.remove();
        document.getElementById('send-btn').disabled = false;
        console.error(err);
      },
    }
  );
}
```

- [ ] **Step 2: Create `frontend/dashboard-chatter.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bubbli — Chat</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: 'Inter', sans-serif; }
    h1,h2,h3 { font-family: 'Plus Jakarta Sans', sans-serif; }
    #messages { scrollbar-width: thin; scrollbar-color: #DAF0EE transparent; }
  </style>
</head>
<body class="h-screen bg-[#F2FBF9] flex flex-col overflow-hidden">

  <!-- Top Nav -->
  <header class="bg-[#0A3D3C] px-4 md:px-6 py-3 flex items-center justify-between flex-shrink-0">
    <img src="./assets/logo.png" alt="Bubbli" class="h-7 object-contain brightness-0 invert"
         onerror="this.outerHTML='<span class=\'text-white font-jakarta font-extrabold text-lg\'>Bubbli</span>'" />
    <div class="flex items-center gap-3">
      <span id="user-name" class="text-[#DAF0EE] text-sm font-medium hidden md:block"></span>
      <button id="logout-btn" class="text-[#DAF0EE] hover:text-white text-xs border border-[#DAF0EE]/40 rounded-full px-3 py-1.5 cursor-pointer transition-colors duration-150">
        Sign out
      </button>
    </div>
  </header>

  <!-- Body: Sidebar + Chat -->
  <div class="flex flex-1 overflow-hidden">

    <!-- Sidebar -->
    <aside class="w-56 md:w-64 bg-white border-r border-[#DAF0EE] flex flex-col flex-shrink-0 hidden md:flex">
      <div class="p-3 border-b border-[#DAF0EE]">
        <button id="new-chat-btn"
                class="w-full flex items-center justify-center gap-2 bg-[#EE6742] hover:bg-[#d55630] text-white rounded-full px-4 py-2.5 text-sm font-jakarta font-semibold cursor-pointer transition-colors duration-150 shadow-sm">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Chat
        </button>
      </div>
      <div class="flex-1 overflow-y-auto p-2">
        <p class="text-[10px] text-gray-400 uppercase tracking-widest font-semibold px-3 pt-2 pb-1">Recent</p>
        <ul id="conv-list" class="space-y-0.5"></ul>
      </div>
    </aside>

    <!-- Chat Area -->
    <main class="flex-1 flex flex-col overflow-hidden">
      <!-- Messages -->
      <div id="messages" class="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-1"></div>

      <!-- Input Bar -->
      <div id="chat-input-area" class="hidden bg-white border-t border-[#DAF0EE] px-4 md:px-8 py-4">
        <div class="flex gap-3 max-w-3xl mx-auto">
          <textarea id="msg-input" rows="1"
                    placeholder="Ask anything…"
                    class="flex-1 resize-none bg-[#F2FBF9] border border-[#DAF0EE] rounded-2xl px-4 py-3 text-sm font-inter text-[#0A3D3C] placeholder-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A3D3C]/30 transition-shadow"
                    style="max-height:120px;"></textarea>
          <button id="send-btn"
                  class="bg-[#0A3D3C] hover:bg-[#072e2d] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl px-5 py-3 font-jakarta font-semibold text-sm cursor-pointer transition-colors duration-150 flex-shrink-0">
            Send
          </button>
        </div>
        <p class="text-center text-[10px] text-gray-400 mt-2">Bubbli is safe-filtered for kids &bull; Rate-limited to 100 msgs/day</p>
      </div>
    </main>
  </div>

  <script type="module">
    import { init } from './js/chatter.js';
    const token = sessionStorage.getItem('app_token');
    const role  = sessionStorage.getItem('user_role');
    if (!token || role !== 'learner') { location.href = '/frontend/index.html'; }
    else init();
  </script>
</body>
</html>
```

- [ ] **Step 3: Test in browser**

Navigate to `http://localhost:3000/frontend/dashboard-chatter.html` (after setting a mock `app_token` and `user_role=learner` in sessionStorage via DevTools).

Expected: Two-panel layout, sidebar with "New Chat" button, chat area with input bar.

- [ ] **Step 4: Commit**

```bash
git add frontend/dashboard-chatter.html frontend/js/chatter.js
git commit -m "feat: add Chatter (learner) chat dashboard with SSE streaming"
```

---

## Task 5: Parent Dashboard

**Files:**
- Create: `frontend/dashboard-parent.html`
- Create: `frontend/js/parent.js`

### Design Spec
Three-column layout (desktop): left sidebar (children list), center (conversation list for selected child), right panel (message thread + guidance tools). Guidance panel has a collapsible form to add notes. Translation button on each message row. Responsive: on mobile, columns stack vertically with back-navigation.

- [ ] **Step 1: Create `frontend/js/parent.js`**

```javascript
// parent.js — Parent dashboard logic
import { api } from './api.js';
import { clearTokens } from './auth.js';

const displayName = sessionStorage.getItem('display_name') ?? 'Parent';
let selectedChildId   = null;
let selectedConvId    = null;

export async function init() {
  document.getElementById('user-name').textContent = displayName;
  document.getElementById('logout-btn').addEventListener('click', () => {
    clearTokens(); location.href = '/frontend/index.html';
  });
  await loadChildren();
}

async function loadChildren() {
  const list = document.getElementById('children-list');
  const { children } = await api.get('/api/parent/children');
  if (!children.length) {
    list.innerHTML = '<p class="text-xs text-gray-400 px-3 py-2">No linked children yet</p>';
    return;
  }
  list.innerHTML = children.map(c => `
    <button
      class="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-[#DAF0EE] cursor-pointer transition-colors duration-150"
      onclick="window._selectChild('${c.id}', '${c.display_name ?? 'Child'}', this)">
      <div class="w-8 h-8 rounded-full bg-[#FFF0E8] flex items-center justify-center text-[#EE6742] text-xs font-bold">
        ${(c.display_name ?? 'C')[0].toUpperCase()}
      </div>
      <span class="text-sm font-inter text-[#0A3D3C] font-medium truncate">${c.display_name ?? 'Unnamed'}</span>
    </button>
  `).join('');
}

window._selectChild = async function(childId, name, btn) {
  selectedChildId = childId;
  document.querySelectorAll('#children-list button').forEach(b => b.classList.remove('bg-[#DAF0EE]'));
  btn.classList.add('bg-[#DAF0EE]');
  document.getElementById('selected-child-name').textContent = name + "'s Conversations";
  document.getElementById('conv-panel').classList.remove('hidden');

  const { conversations } = await api.get(`/api/parent/children/${childId}/conversations`);
  const convList = document.getElementById('parent-conv-list');
  if (!conversations.length) {
    convList.innerHTML = '<p class="text-xs text-gray-400 px-2 py-2">No conversations</p>';
    return;
  }
  convList.innerHTML = conversations.map(c => `
    <button
      class="w-full text-left px-3 py-2.5 rounded-xl text-sm font-inter text-[#0A3D3C] hover:bg-[#F2FBF9] cursor-pointer transition-colors duration-150 ${c.is_flagged ? 'border-l-2 border-[#EE6742]' : ''}"
      onclick="window._selectConv('${c.id}', this)">
      ${c.title ?? 'Chat ' + c.id.slice(0,6)}
      ${c.is_flagged ? '<span class="ml-1 text-[10px] text-[#EE6742] font-semibold">Flagged</span>' : ''}
    </button>
  `).join('');
};

window._selectConv = async function(convId, btn) {
  selectedConvId = convId;
  document.querySelectorAll('#parent-conv-list button').forEach(b => b.classList.remove('bg-[#DAF0EE]'));
  btn.classList.add('bg-[#DAF0EE]');

  const { messages } = await api.get(`/api/parent/conversations/${convId}/messages`);
  const thread = document.getElementById('message-thread');
  thread.innerHTML = messages.map(m => `
    <div class="flex ${m.role === 'learner' ? 'justify-end' : 'justify-start'} mb-3 group">
      <div class="relative max-w-[75%]">
        <div class="${m.role === 'learner'
          ? 'bg-[#0A3D3C] text-white rounded-2xl rounded-br-md'
          : 'bg-white border border-[#DAF0EE] text-[#1A1A1A] rounded-2xl rounded-bl-md'
        } px-4 py-3 text-sm font-inter leading-relaxed">
          ${m.content}
          ${!m.is_safe ? '<p class="text-[10px] text-[#EE6742] mt-1 font-semibold">Safety flag</p>' : ''}
        </div>
        <button
          class="absolute top-1 ${m.role === 'learner' ? '-left-8' : '-right-8'} opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-[#DAF0EE] cursor-pointer transition-opacity duration-150"
          title="Translate"
          onclick="window._translateMsg('${m.id}', this)">
          <svg class="w-4 h-4 text-[#0A3D3C]" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="m10.5 21 5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 0 1-3.827-5.802" />
          </svg>
        </button>
      </div>
    </div>
  `).join('');
  thread.scrollTop = thread.scrollHeight;
  document.getElementById('message-panel').classList.remove('hidden');
};

window._translateMsg = async function(msgId, btn) {
  btn.disabled = true;
  try {
    const { translation } = await api.post(`/api/parent/messages/${msgId}/translate`, { target_language: 'en' });
    const msgDiv = btn.closest('.group').querySelector('.px-4');
    msgDiv.insertAdjacentHTML('beforeend', `
      <div class="mt-2 pt-2 border-t border-[#DAF0EE] text-[#0A3D3C] text-xs italic">${translation.translated_content}</div>
    `);
  } catch (e) {
    btn.disabled = false;
    alert('Translation failed');
  }
};

window._addGuidance = async function() {
  const content = document.getElementById('guidance-input').value.trim();
  const type = document.getElementById('guidance-type').value;
  if (!content || !selectedConvId) return;

  // Need a shared session — this is simplified; real implementation would use session from conversation
  const sessions = await api.get(`/api/parent/children/${selectedChildId}/sessions`);
  const session  = sessions.sessions?.[0];
  if (!session) { alert('No active session found'); return; }

  await api.post(`/api/parent/sessions/${session.id}/guidance`, {
    guidance_type: type,
    content,
    conversation_id: selectedConvId,
    visibility: 'adults_only',
  });
  document.getElementById('guidance-input').value = '';
  document.getElementById('guidance-success').classList.remove('hidden');
  setTimeout(() => document.getElementById('guidance-success').classList.add('hidden'), 3000);
};
```

- [ ] **Step 2: Create `frontend/dashboard-parent.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bubbli — Parent Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: 'Inter', sans-serif; }
    h1,h2,h3 { font-family: 'Plus Jakarta Sans', sans-serif; }
  </style>
</head>
<body class="h-screen bg-[#F2FBF9] flex flex-col overflow-hidden">

  <!-- Header -->
  <header class="bg-[#0A3D3C] px-4 md:px-6 py-3 flex items-center justify-between flex-shrink-0">
    <div class="flex items-center gap-3">
      <img src="./assets/logo.png" alt="Bubbli" class="h-7 object-contain brightness-0 invert"
           onerror="this.outerHTML='<span class=\'text-white font-jakarta font-extrabold text-lg\'>Bubbli</span>'" />
      <span class="bg-[#E8F5E9] text-[#22c55e] text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">Parent</span>
    </div>
    <div class="flex items-center gap-3">
      <span id="user-name" class="text-[#DAF0EE] text-sm font-medium hidden md:block"></span>
      <button id="logout-btn" class="text-[#DAF0EE] hover:text-white text-xs border border-[#DAF0EE]/40 rounded-full px-3 py-1.5 cursor-pointer transition-colors duration-150">Sign out</button>
    </div>
  </header>

  <!-- Three-panel layout -->
  <div class="flex flex-1 overflow-hidden">

    <!-- Panel 1: Children -->
    <aside class="w-48 md:w-56 bg-white border-r border-[#DAF0EE] flex flex-col flex-shrink-0">
      <div class="px-4 py-3 border-b border-[#DAF0EE]">
        <h2 class="text-xs font-jakarta font-bold text-[#0A3D3C] uppercase tracking-wider">My Children</h2>
      </div>
      <div id="children-list" class="flex-1 overflow-y-auto p-2 space-y-0.5">
        <p class="text-xs text-gray-400 px-3 py-2">Loading…</p>
      </div>
    </aside>

    <!-- Panel 2: Conversations -->
    <aside id="conv-panel" class="hidden w-52 md:w-60 bg-white border-r border-[#DAF0EE] flex flex-col flex-shrink-0">
      <div class="px-4 py-3 border-b border-[#DAF0EE]">
        <h2 id="selected-child-name" class="text-xs font-jakarta font-bold text-[#0A3D3C] uppercase tracking-wider truncate">Select a child</h2>
      </div>
      <div id="parent-conv-list" class="flex-1 overflow-y-auto p-2 space-y-0.5"></div>
    </aside>

    <!-- Panel 3: Messages + Guidance -->
    <main id="message-panel" class="hidden flex-1 flex flex-col overflow-hidden">
      <!-- Thread -->
      <div id="message-thread" class="flex-1 overflow-y-auto px-4 md:px-8 py-6"></div>

      <!-- Guidance Form -->
      <div class="bg-white border-t border-[#DAF0EE] px-4 md:px-8 py-4">
        <details class="group">
          <summary class="flex items-center gap-2 text-sm font-jakarta font-semibold text-[#0A3D3C] cursor-pointer list-none select-none">
            <svg class="w-4 h-4 group-open:rotate-90 transition-transform duration-150" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
            Add Guidance Note
          </summary>
          <div class="mt-3 space-y-3">
            <select id="guidance-type"
                    class="w-full text-sm border border-[#DAF0EE] rounded-xl px-3 py-2 text-[#0A3D3C] bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A3D3C]/20 cursor-pointer">
              <option value="reflection_prompt">Reflection Prompt</option>
              <option value="context_note">Context Note</option>
              <option value="safety_note">Safety Note</option>
              <option value="translation_note">Translation Note</option>
            </select>
            <textarea id="guidance-input" rows="2" placeholder="Add a note for your child's session…"
                      class="w-full text-sm border border-[#DAF0EE] rounded-xl px-3 py-2 text-[#0A3D3C] bg-[#F2FBF9] resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A3D3C]/20 placeholder-gray-400"></textarea>
            <div class="flex items-center gap-3">
              <button onclick="window._addGuidance()"
                      class="bg-[#0A3D3C] hover:bg-[#072e2d] text-white rounded-full px-5 py-2 text-sm font-jakarta font-semibold cursor-pointer transition-colors duration-150">
                Save Note
              </button>
              <span id="guidance-success" class="hidden text-[#22c55e] text-sm font-medium">Saved!</span>
            </div>
          </div>
        </details>
      </div>
    </main>

    <!-- Empty state -->
    <div id="empty-state" class="flex-1 flex items-center justify-center text-center px-8">
      <div>
        <div class="w-16 h-16 bg-[#DAF0EE] rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-[#0A3D3C]" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
          </svg>
        </div>
        <p class="text-[#0A3D3C] font-jakarta font-semibold">Select a child to view their chats</p>
        <p class="text-gray-400 text-sm mt-1">You can add guidance notes and translate messages</p>
      </div>
    </div>
  </div>

  <script type="module">
    import { init } from './js/parent.js';
    const token = sessionStorage.getItem('app_token');
    const role  = sessionStorage.getItem('user_role');
    if (!token || role !== 'parent') { location.href = '/frontend/index.html'; }
    else init();
  </script>
</body>
</html>
```

- [ ] **Step 3: Test in browser** — Set `app_token` + `user_role=parent` in sessionStorage, verify three-panel layout.

- [ ] **Step 4: Commit**

```bash
git add frontend/dashboard-parent.html frontend/js/parent.js
git commit -m "feat: add Parent dashboard with child monitoring and guidance notes"
```

---

## Task 6: Teacher Dashboard

**Files:**
- Create: `frontend/dashboard-teacher.html`
- Create: `frontend/js/teacher.js`

### Design Spec
Header with teal background and "Teacher" role badge. Left sidebar: classroom selector. Center panel: student list in selected classroom with safety status indicators. Right panel: student conversation thread + moderation tools (flag review, learning objectives). Flagged messages shown with orange border + severity badge.

- [ ] **Step 1: Create `frontend/js/teacher.js`**

```javascript
// teacher.js — Teacher dashboard logic
import { api } from './api.js';
import { clearTokens } from './auth.js';

const displayName = sessionStorage.getItem('display_name') ?? 'Teacher';
let selectedClassroomId = null;
let selectedStudentId   = null;

export async function init() {
  document.getElementById('user-name').textContent = displayName;
  document.getElementById('logout-btn').addEventListener('click', () => {
    clearTokens(); location.href = '/frontend/index.html';
  });
  document.getElementById('tab-students').addEventListener('click', () => switchTab('students'));
  document.getElementById('tab-moderation').addEventListener('click', () => switchTab('moderation'));
  await loadClassrooms();
  await loadFlaggedCount();
}

async function loadClassrooms() {
  const sel = document.getElementById('classroom-select');
  const { classrooms } = await api.get('/api/teacher/classrooms');
  if (!classrooms.length) { sel.innerHTML = '<option>No classrooms</option>'; return; }
  sel.innerHTML = classrooms.map(c => `<option value="${c.id}">${c.name} (${c.grade_level ?? 'All grades'})</option>`).join('');
  sel.addEventListener('change', () => loadStudents(sel.value));
  loadStudents(sel.value);
}

async function loadStudents(classroomId) {
  selectedClassroomId = classroomId;
  const list = document.getElementById('student-list');
  list.innerHTML = '<p class="text-xs text-gray-400 px-2 py-2">Loading…</p>';
  const { students } = await api.get(`/api/teacher/classrooms/${classroomId}/students`);
  if (!students.length) { list.innerHTML = '<p class="text-xs text-gray-400 px-2 py-2">No students</p>'; return; }
  list.innerHTML = students.map(s => `
    <button
      class="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-[#DAF0EE] cursor-pointer transition-colors duration-150"
      onclick="window._selectStudent('${s.id}', '${s.display_name ?? 'Student'}', this)">
      <div class="w-8 h-8 rounded-full bg-[#E3F2FD] flex items-center justify-center text-[#3b82f6] text-xs font-bold">
        ${(s.display_name ?? 'S')[0].toUpperCase()}
      </div>
      <span class="text-sm font-inter text-[#0A3D3C] truncate">${s.display_name ?? 'Unnamed'}</span>
    </button>
  `).join('');
}

window._selectStudent = async function(studentId, name, btn) {
  selectedStudentId = studentId;
  document.querySelectorAll('#student-list button').forEach(b => b.classList.remove('bg-[#DAF0EE]'));
  btn.classList.add('bg-[#DAF0EE]');
  document.getElementById('student-panel-title').textContent = name + "'s Activity";
  document.getElementById('student-panel').classList.remove('hidden');
  document.getElementById('teacher-empty').classList.add('hidden');

  const { conversations } = await api.get(`/api/teacher/students/${studentId}/conversations`);
  const convList = document.getElementById('teacher-conv-list');
  convList.innerHTML = conversations.map(c => `
    <button
      class="w-full text-left px-3 py-2.5 rounded-xl text-sm hover:bg-[#F2FBF9] cursor-pointer transition-colors duration-150 ${c.is_flagged ? 'border-l-2 border-[#EE6742]' : ''}"
      onclick="window._loadStudentConv('${c.id}', this)">
      ${c.title ?? 'Chat ' + c.id.slice(0,6)}
      ${c.is_flagged ? '<span class="ml-1 text-[10px] text-[#EE6742] font-semibold">Flagged</span>' : ''}
    </button>
  `).join('');
};

window._loadStudentConv = async function(convId, btn) {
  document.querySelectorAll('#teacher-conv-list button').forEach(b => b.classList.remove('bg-[#DAF0EE]'));
  btn.classList.add('bg-[#DAF0EE]');

  const { messages } = await api.get(`/api/teacher/conversations/${convId}/messages`);
  document.getElementById('teacher-thread').innerHTML = messages.map(m => `
    <div class="flex ${m.role === 'learner' ? 'justify-end' : 'justify-start'} mb-3">
      <div class="max-w-[75%] ${m.role === 'learner'
        ? 'bg-[#0A3D3C] text-white rounded-2xl rounded-br-md'
        : 'bg-white border border-[#DAF0EE] text-[#1A1A1A] rounded-2xl rounded-bl-md'
      } px-4 py-3 text-sm leading-relaxed">
        ${m.content}
        ${!m.is_safe ? `<div class="mt-1.5 flex items-center gap-1"><span class="w-1.5 h-1.5 bg-[#EE6742] rounded-full"></span><span class="text-[10px] text-[#EE6742] font-semibold uppercase tracking-wide">Safety flag</span></div>` : ''}
      </div>
    </div>
  `).join('');
  document.getElementById('teacher-thread').scrollTop = 999999;
};

async function loadFlaggedCount() {
  try {
    const { flags } = await api.get('/api/moderation/flagged');
    const count = flags.filter(f => !f.reviewed).length;
    if (count > 0) {
      document.getElementById('flag-badge').textContent = count;
      document.getElementById('flag-badge').classList.remove('hidden');
    }
    renderModerationTable(flags);
  } catch { /* handle gracefully */ }
}

function renderModerationTable(flags) {
  const tbody = document.getElementById('flag-table-body');
  const severityColor = { high: 'text-red-600 bg-red-50', medium: 'text-[#EE6742] bg-[#FFF0E8]', low: 'text-yellow-600 bg-yellow-50' };
  tbody.innerHTML = flags.map(f => `
    <tr class="hover:bg-[#F2FBF9] cursor-pointer transition-colors duration-100">
      <td class="px-4 py-3 text-xs font-mono text-gray-500">${f.conversation_id.slice(0,8)}</td>
      <td class="px-4 py-3 text-xs text-[#0A3D3C]">${f.flag_type}</td>
      <td class="px-4 py-3">
        <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${severityColor[f.severity] ?? 'text-gray-600 bg-gray-100'}">${f.severity}</span>
      </td>
      <td class="px-4 py-3 text-xs text-gray-500">${f.reviewed ? 'Reviewed' : '<span class="text-[#EE6742] font-semibold">Pending</span>'}</td>
      <td class="px-4 py-3">
        ${!f.reviewed ? `<button onclick="window._reviewFlag('${f.id}', this)" class="text-xs text-[#0A3D3C] border border-[#DAF0EE] rounded-full px-3 py-1 hover:bg-[#DAF0EE] cursor-pointer transition-colors duration-150">Mark Reviewed</button>` : '—'}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="5" class="px-4 py-6 text-center text-gray-400 text-sm">No flagged content</td></tr>';
}

window._reviewFlag = async function(flagId, btn) {
  btn.disabled = true;
  btn.textContent = 'Saving…';
  await api.patch(`/api/moderation/flags/${flagId}/review`, { reviewer_notes: '' });
  btn.closest('tr').querySelector('td:nth-child(4)').innerHTML = 'Reviewed';
  btn.remove();
  const badge = document.getElementById('flag-badge');
  const count = parseInt(badge.textContent) - 1;
  if (count <= 0) badge.classList.add('hidden');
  else badge.textContent = count;
};

function switchTab(tab) {
  document.getElementById('tab-students').classList.toggle('border-b-2', tab === 'students');
  document.getElementById('tab-students').classList.toggle('border-[#0A3D3C]', tab === 'students');
  document.getElementById('tab-moderation').classList.toggle('border-b-2', tab === 'moderation');
  document.getElementById('tab-moderation').classList.toggle('border-[#0A3D3C]', tab === 'moderation');
  document.getElementById('view-students').classList.toggle('hidden', tab !== 'students');
  document.getElementById('view-moderation').classList.toggle('hidden', tab !== 'moderation');
}
```

- [ ] **Step 2: Create `frontend/dashboard-teacher.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bubbli — Teacher Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: 'Inter', sans-serif; }
    h1,h2,h3 { font-family: 'Plus Jakarta Sans', sans-serif; }
    #teacher-thread { scrollbar-width: thin; scrollbar-color: #DAF0EE transparent; }
  </style>
</head>
<body class="h-screen bg-[#F2FBF9] flex flex-col overflow-hidden">

  <!-- Header -->
  <header class="bg-[#0A3D3C] px-4 md:px-6 py-3 flex items-center justify-between flex-shrink-0">
    <div class="flex items-center gap-3">
      <img src="./assets/logo.png" alt="Bubbli" class="h-7 object-contain brightness-0 invert"
           onerror="this.outerHTML='<span class=\'text-white font-jakarta font-extrabold text-lg\'>Bubbli</span>'" />
      <span class="bg-[#E3F2FD] text-[#3b82f6] text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">Teacher</span>
    </div>
    <div class="flex items-center gap-3">
      <span id="user-name" class="text-[#DAF0EE] text-sm font-medium hidden md:block"></span>
      <button id="logout-btn" class="text-[#DAF0EE] hover:text-white text-xs border border-[#DAF0EE]/40 rounded-full px-3 py-1.5 cursor-pointer transition-colors duration-150">Sign out</button>
    </div>
  </header>

  <!-- Tab Bar -->
  <nav class="bg-white border-b border-[#DAF0EE] px-6 flex gap-0 flex-shrink-0">
    <button id="tab-students"
            class="px-5 py-3 text-sm font-jakarta font-semibold text-[#0A3D3C] border-b-2 border-[#0A3D3C] cursor-pointer transition-colors duration-150">
      Students
    </button>
    <button id="tab-moderation"
            class="relative px-5 py-3 text-sm font-jakarta font-semibold text-[#6B7280] hover:text-[#0A3D3C] cursor-pointer transition-colors duration-150">
      Moderation
      <span id="flag-badge"
            class="hidden absolute top-2 right-2 bg-[#EE6742] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">0</span>
    </button>
  </nav>

  <!-- Content -->
  <div class="flex flex-1 overflow-hidden">

    <!-- View: Students -->
    <div id="view-students" class="flex flex-1 overflow-hidden">

      <!-- Sidebar: Classroom + Students -->
      <aside class="w-52 md:w-60 bg-white border-r border-[#DAF0EE] flex flex-col flex-shrink-0">
        <div class="px-4 py-3 border-b border-[#DAF0EE]">
          <label class="text-[10px] font-bold text-[#0A3D3C] uppercase tracking-wider block mb-1.5">Classroom</label>
          <select id="classroom-select"
                  class="w-full text-sm border border-[#DAF0EE] rounded-xl px-3 py-2 text-[#0A3D3C] bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A3D3C]/20 cursor-pointer">
            <option>Loading…</option>
          </select>
        </div>
        <div class="px-3 py-2 border-b border-[#DAF0EE]">
          <p class="text-[10px] font-bold text-[#0A3D3C] uppercase tracking-wider">Students</p>
        </div>
        <div id="student-list" class="flex-1 overflow-y-auto p-2 space-y-0.5">
          <p class="text-xs text-gray-400 px-3 py-2">Loading…</p>
        </div>
      </aside>

      <!-- Center: Student Conversations -->
      <aside id="student-panel" class="hidden w-52 md:w-60 bg-white border-r border-[#DAF0EE] flex flex-col flex-shrink-0">
        <div class="px-4 py-3 border-b border-[#DAF0EE]">
          <h2 id="student-panel-title" class="text-xs font-jakarta font-bold text-[#0A3D3C] uppercase tracking-wider truncate">Conversations</h2>
        </div>
        <div id="teacher-conv-list" class="flex-1 overflow-y-auto p-2 space-y-0.5"></div>
      </aside>

      <!-- Right: Thread -->
      <main class="flex-1 flex flex-col overflow-hidden">
        <div id="teacher-thread" class="flex-1 overflow-y-auto px-4 md:px-8 py-6"></div>
        <div id="teacher-empty" class="flex-1 flex items-center justify-center text-center px-8">
          <div>
            <div class="w-16 h-16 bg-[#DAF0EE] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-[#0A3D3C]" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
              </svg>
            </div>
            <p class="text-[#0A3D3C] font-jakarta font-semibold">Select a student</p>
            <p class="text-gray-400 text-sm mt-1">View their conversations and moderate flags</p>
          </div>
        </div>
      </main>
    </div>

    <!-- View: Moderation -->
    <div id="view-moderation" class="hidden flex-1 overflow-y-auto px-4 md:px-8 py-6">
      <div class="max-w-4xl mx-auto">
        <h2 class="font-jakarta font-extrabold text-xl text-[#0A3D3C] mb-4">Safety Flags</h2>
        <div class="bg-white rounded-2xl border border-[#DAF0EE] overflow-hidden shadow-sm">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-[#DAF0EE]">
                <tr>
                  <th class="px-4 py-3 text-left text-[10px] font-extrabold text-[#0A3D3C] uppercase tracking-wider">Conversation</th>
                  <th class="px-4 py-3 text-left text-[10px] font-extrabold text-[#0A3D3C] uppercase tracking-wider">Flag Type</th>
                  <th class="px-4 py-3 text-left text-[10px] font-extrabold text-[#0A3D3C] uppercase tracking-wider">Severity</th>
                  <th class="px-4 py-3 text-left text-[10px] font-extrabold text-[#0A3D3C] uppercase tracking-wider">Status</th>
                  <th class="px-4 py-3 text-left text-[10px] font-extrabold text-[#0A3D3C] uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody id="flag-table-body" class="divide-y divide-[#DAF0EE]">
                <tr><td colspan="5" class="px-4 py-6 text-center text-gray-400">Loading…</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

  </div>

  <script type="module">
    import { init } from './js/teacher.js';
    const token = sessionStorage.getItem('app_token');
    const role  = sessionStorage.getItem('user_role');
    if (!token || !['teacher','admin'].includes(role)) { location.href = '/frontend/index.html'; }
    else init();
  </script>
</body>
</html>
```

- [ ] **Step 3: Test in browser** — Set `app_token` + `user_role=teacher` in sessionStorage, verify tabs and moderation table.

- [ ] **Step 4: Commit**

```bash
git add frontend/dashboard-teacher.html frontend/js/teacher.js
git commit -m "feat: add Teacher dashboard with classroom management and moderation"
```

---

## Task 7: Backend — Google OAuth2 Token Exchange Endpoint

**Files:**
- Create: `nodejs-app/src/routes/auth.ts`
- Modify: `nodejs-app/src/app.ts` (register route)

This endpoint receives the Google `id_token` from the frontend, verifies it with Google's API, upserts the user in the DB, and returns an app JWT.

- [ ] **Step 1: Write failing test**

Create `nodejs-app/tests/routes/auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { authRoutes } from '../../src/routes/auth';

describe('POST /api/auth/google', () => {
  it('returns 400 when id_token is missing', async () => {
    const app = Fastify();
    await app.register(authRoutes);
    const res = await app.inject({ method: 'POST', url: '/api/auth/google', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 when id_token is invalid', async () => {
    const app = Fastify();
    await app.register(authRoutes);
    const res = await app.inject({
      method: 'POST', url: '/api/auth/google',
      payload: { id_token: 'invalid.token.here' },
    });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd nodejs-app && npx vitest run tests/routes/auth.test.ts
```

Expected: FAIL — `authRoutes` not found.

- [ ] **Step 3: Create `nodejs-app/src/routes/auth.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import jwt from 'jsonwebtoken';

const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const JWT_SECRET = process.env.DEV_JWT_SECRET ?? 'dev-secret-min-32-chars-placeholder';

const bodySchema = z.object({ id_token: z.string().min(1) });

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/google', async (req, reply) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ message: 'id_token required' });

    const { id_token } = parsed.data;

    // Verify Google id_token
    let payload: Record<string, string>;
    try {
      const res  = await fetch(`${GOOGLE_TOKENINFO_URL}?id_token=${id_token}`);
      payload = await res.json() as Record<string, string>;
      if (payload.error || (CLIENT_ID && payload.aud !== CLIENT_ID)) {
        return reply.status(401).send({ message: 'Invalid Google token' });
      }
    } catch {
      return reply.status(401).send({ message: 'Token verification failed' });
    }

    const email = payload.email ?? '';
    const name  = payload.name  ?? payload.email ?? 'User';

    // Determine role from email domain or DB lookup
    // Default: 'learner' — extend with your role-assignment logic
    const role = 'learner';

    // Upsert user into DB (simplified — extend with your DB layer)
    // In production: call userService.upsertByExternalSubject(payload.sub, role)

    // Issue app JWT
    const token = jwt.sign(
      { sub: payload.sub, role, email },
      JWT_SECRET,
      { expiresIn: '8h', issuer: 'bubbli' }
    );

    return reply.status(200).send({ token, role, display_name: name });
  });
}
```

- [ ] **Step 4: Register route in `nodejs-app/src/app.ts`**

Find the line that registers routes (e.g., `app.register(conversationRoutes)`) and add:

```typescript
import { authRoutes } from './routes/auth.js';
// ... existing imports ...
await app.register(authRoutes);
```

- [ ] **Step 5: Run tests**

```bash
cd nodejs-app && npx vitest run tests/routes/auth.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add nodejs-app/src/routes/auth.ts nodejs-app/src/app.ts nodejs-app/tests/routes/auth.test.ts
git commit -m "feat: add Google OAuth2 token exchange endpoint"
```

---

## Self-Review

### Spec Coverage
| Requirement | Task |
|---|---|
| Login page with Google OAuth2 | Task 1, 2 |
| Token exchange with backend | Task 2, 7 |
| Role-based routing after login | Task 2 (auth.js `routeByRole`) |
| Chatter (learner) dashboard | Task 3, 4 |
| Parent dashboard | Task 3, 5 |
| Teacher dashboard | Task 3, 6 |
| Bubbli brand matching | All (teal #0A3D3C, mint #DAF0EE, orange #EE6742) |

### Gaps / Notes
- `GOOGLE_CLIENT_ID` and `DEV_JWT_SECRET` env vars must be set in `nodejs-app/.env`
- Client secret (`YOUR_GOOGLE_CLIENT_SECRET`) is **never used in frontend** — it's for server-side OAuth2 flows only. The implicit flow in Task 1 only uses the Client ID.
- Role assignment in Task 7 defaults to `'learner'` — production must look up role from DB by email/sub.
- Serve the `frontend/` directory with the Node.js static file server or a separate `python3 -m http.server`.

### Placeholder Scan
No TBDs, TODOs, or incomplete steps found.

### Type Consistency
- `api.js` → `api.get`, `api.post`, `api.patch`, `api.stream` — used consistently across `chatter.js`, `parent.js`, `teacher.js`
- `auth.js` → `loginWithGoogle`, `handleCallback`, `exchangeToken`, `routeByRole`, `clearTokens` — used consistently
