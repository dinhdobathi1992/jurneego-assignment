// chatter.js — Learner chat dashboard logic (Onyx-inspired)
import { api } from './api.js';
import { clearTokens, parseJwtPayload } from './auth.js';

const displayName = sessionStorage.getItem('display_name') ?? 'Learner';
const ACTIVE_CONV_KEY = 'active_conv_id';
let activeConversationId = null;
let streamCtrl = null;
let _feedbackCtrl = null;
let allConversations = [];

function setActiveConv(id) {
  activeConversationId = id;
  if (id) sessionStorage.setItem(ACTIVE_CONV_KEY, id);
  else sessionStorage.removeItem(ACTIVE_CONV_KEY);
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

export async function init() {
  // Header / profile
  document.getElementById('user-name').textContent = displayName;
  const tok   = sessionStorage.getItem('app_token');
  const email = sessionStorage.getItem('user_email') || (tok ? parseJwtPayload(tok)?.email : '') || '';
  const emailEl = document.getElementById('user-email');
  if (emailEl) emailEl.textContent = email;

  document.getElementById('logout-btn').addEventListener('click', () => {
    clearTokens();
    location.href = '/frontend/index.html';
  });

  document.getElementById('new-chat-btn').addEventListener('click', startNewChat);
  document.getElementById('send-btn').addEventListener('click', () => sendMessage('msg-input'));
  document.getElementById('welcome-send-btn').addEventListener('click', sendFromWelcome);
  document.getElementById('stop-btn').addEventListener('click', () => {
    if (streamCtrl) {
      streamCtrl.abort();
      // streamCtrl will be cleared by the stream's `error` callback (which fires
      // on abort) or `done` callback. Until then, leave it set so a second click
      // is a no-op.
    }
  });

  // Enter to send
  document.getElementById('msg-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage('msg-input'); }
  });
  document.getElementById('welcome-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFromWelcome(); }
  });

  // Auto-grow textareas
  ['msg-input', 'welcome-input'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, id === 'welcome-input' ? 200 : 160) + 'px';
    });
  });

  // Suggestion chips
  document.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const prompt = chip.dataset.prompt;
      if (!prompt) return;
      const input = document.getElementById('welcome-input');
      input.value = prompt;
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 200) + 'px';
      sendFromWelcome();
    });
  });

  // Search filter
  const search = document.getElementById('conv-search');
  if (search) {
    search.addEventListener('input', (e) => renderConversationList(e.target.value.trim().toLowerCase()));
  }

  await loadConversations();

  // Restore the previously-active chat across page refreshes. Only re-open
  // it if the conversation is still in the list (the learner could have
  // deleted it from another tab); otherwise drop the stored id and stay on
  // the welcome screen.
  const storedId = sessionStorage.getItem(ACTIVE_CONV_KEY);
  if (storedId && allConversations.some(c => c.id === storedId)) {
    await window._selectConv(storedId);
  } else if (storedId) {
    sessionStorage.removeItem(ACTIVE_CONV_KEY);
  }
}

// ─── State transitions ───────────────────────────────────────────────────────

function showWelcome() {
  document.getElementById('welcome-state').style.display = '';
  document.getElementById('chat-thread').style.display = 'none';
  document.getElementById('chat-input-area').style.display = 'none';
  setActiveConv(null);
  // Reset welcome input
  const w = document.getElementById('welcome-input');
  if (w) { w.value = ''; w.style.height = 'auto'; w.focus(); }
  // Clear active highlight
  document.querySelectorAll('.conv-btn').forEach(b => b.classList.remove('active-conv'));
}

function showActiveChat() {
  document.getElementById('welcome-state').style.display = 'none';
  document.getElementById('chat-thread').style.display = '';
  document.getElementById('chat-input-area').style.display = '';
  setTimeout(() => document.getElementById('msg-input')?.focus(), 50);
}

function startNewChat() {
  showWelcome();
}

// ─── Conversation list ────────────────────────────────────────────────────────

async function loadConversations() {
  const wrap = document.getElementById('conv-list-wrap');
  if (!wrap.children.length) wrap.innerHTML = '<p class="text-xs text-gray-400 px-3 py-2">Loading…</p>';
  try {
    const data = await api.get('/api/conversations?limit=50');
    allConversations = data?.conversations ?? [];
    const filter = (document.getElementById('conv-search')?.value ?? '').trim().toLowerCase();
    renderConversationList(filter);
  } catch (err) {
    wrap.innerHTML = '<p class="text-xs text-[#EE6742] px-3 py-2">Failed to load</p>';
    console.error(err);
  }
}

// Poll for the conversation's auto-generated title up to ~12s after a send.
// Bails out early as soon as the title appears so the sidebar updates as
// fast as the LLM allows. Multiple in-flight polls are harmless (idempotent).
async function pollForTitle(conversationId) {
  const delays = [1500, 2000, 2500, 3000, 3000]; // total ≈ 12s
  for (const ms of delays) {
    await new Promise(r => setTimeout(r, ms));
    if (activeConversationId !== conversationId) return; // user switched chats
    await loadConversations();
    const conv = allConversations.find(c => c.id === conversationId);
    if (conv?.title) return;
  }
}

function groupConversationsByDate(conversations) {
  const now      = new Date();
  const today    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yest     = new Date(today); yest.setDate(yest.getDate() - 1);
  const sevenAgo = new Date(today); sevenAgo.setDate(sevenAgo.getDate() - 7);
  const thirtyAgo = new Date(today); thirtyAgo.setDate(thirtyAgo.getDate() - 30);

  const groups = { today: [], yesterday: [], last7: [], last30: [], older: [] };
  conversations.forEach(c => {
    const ts = c.updated_at ?? c.created_at;
    const t  = ts ? new Date(ts) : new Date(0);
    if      (t >= today)    groups.today.push(c);
    else if (t >= yest)     groups.yesterday.push(c);
    else if (t >= sevenAgo) groups.last7.push(c);
    else if (t >= thirtyAgo) groups.last30.push(c);
    else groups.older.push(c);
  });
  return groups;
}

function renderConversationList(filter) {
  const wrap = document.getElementById('conv-list-wrap');
  const filtered = filter
    ? allConversations.filter(c => (c.title ?? '').toLowerCase().includes(filter))
    : allConversations;

  if (!filtered.length) {
    wrap.innerHTML = filter
      ? '<p class="text-xs text-gray-400 px-3 py-3 text-center">No matches</p>'
      : '<p class="text-xs text-gray-400 px-3 py-3 text-center">No chats yet — click <b>New Chat</b> to start.</p>';
    return;
  }

  const groups = groupConversationsByDate(filtered);
  const labels = { today: 'Today', yesterday: 'Yesterday', last7: 'Previous 7 days', last30: 'Previous 30 days', older: 'Older' };

  let html = '';
  for (const key of ['today', 'yesterday', 'last7', 'last30', 'older']) {
    if (!groups[key].length) continue;
    html += `
      <p class="text-[10px] font-semibold font-jakarta text-gray-400 uppercase tracking-widest px-3 pt-3 pb-1.5">${labels[key]}</p>
      <ul class="space-y-0.5 mb-1">
        ${groups[key].map(convItemHTML).join('')}
      </ul>`;
  }
  wrap.innerHTML = html;
}

function convItemHTML(c) {
  const id      = String(c.id);
  const title   = c.title ?? `Chat ${id.slice(0, 6)}`;
  const flagged = !!c.is_flagged;
  const active  = id === activeConversationId;

  return `
    <li>
      <button
        class="conv-btn group w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left text-sm font-inter cursor-pointer transition-colors ${active ? 'active-conv bg-[#DAF0EE] text-[#0A3D3C] font-semibold' : 'text-[#0A3D3C] hover:bg-[#DAF0EE]/60'}"
        data-id="${escAttr(id)}"
        onclick="window._selectConv('${escAttr(id)}')">
        ${flagged
          ? '<span class="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#EE6742]" title="Flagged"></span>'
          : '<span class="flex-shrink-0 w-1.5 h-1.5"></span>'}
        <span class="flex-1 truncate">${escHtml(title)}</span>
      </button>
    </li>`;
}

// ─── Selecting / loading conversations ───────────────────────────────────────

window._selectConv = async function(id) {
  setActiveConv(id);
  // Re-render list to update active highlight
  renderConversationList((document.getElementById('conv-search')?.value ?? '').trim().toLowerCase());

  showActiveChat();

  const messagesEl = document.getElementById('messages');
  messagesEl.innerHTML = '<p class="text-xs text-gray-400 text-center py-8">Loading…</p>';

  try {
    const data = await api.get(`/api/conversations/${id}`);
    renderMessages(data?.messages ?? []);
  } catch (err) {
    messagesEl.innerHTML = '<p class="text-xs text-[#EE6742] text-center py-8">Failed to load</p>';
    console.error(err);
  }
};

// ─── Message rendering ───────────────────────────────────────────────────────

function renderMessages(messages) {
  const container = document.getElementById('messages');
  if (!messages.length) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center text-center py-16 select-none">
        <div class="w-14 h-14 bg-[#DAF0EE] rounded-2xl flex items-center justify-center mb-4">
          <svg class="w-7 h-7 text-[#0A3D3C]" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
          </svg>
        </div>
        <p class="text-[#0A3D3C] font-jakarta font-semibold">Start the conversation</p>
        <p class="text-gray-400 text-sm mt-1">Type a message below to begin.</p>
      </div>`;
    return;
  }
  container.innerHTML = messages.map(msgHTML).join('');
  scrollToBottom();
}

function scrollToBottom() {
  const thread = document.getElementById('chat-thread');
  if (thread) thread.scrollTop = thread.scrollHeight;
}

function msgHTML(m) {
  if (m.role === 'learner') return userMsgHTML(m);
  return aiMsgHTML(m);
}

// Compact timestamp for message bubbles: "5:18 PM" today, "Yesterday 5:18 PM",
// "Mon 5:18 PM" earlier this week, "Apr 27, 5:18 PM" older. Returns '' if the
// input is missing or unparseable so the UI just shows nothing rather than NaN.
function formatMsgTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return time;
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  const daysAgo = Math.floor((now - d) / 86400000);
  if (daysAgo < 7) return `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

function userMsgHTML(m) {
  const ts = formatMsgTime(m.created_at);
  return `
    <div class="flex flex-col items-end mb-6">
      <div class="max-w-[80%] bg-[#F2FBF9] text-[#0A3D3C] rounded-2xl px-5 py-3 text-[15px] font-inter leading-relaxed border border-[#DAF0EE]">
        ${escHtml(m.content).replace(/\n/g, '<br>')}
        ${m.is_safe === false ? '<p class="text-[11px] text-[#EE6742] mt-1.5 font-semibold">Safety notice</p>' : ''}
      </div>
      ${ts ? `<p class="text-[11px] text-gray-400 mt-1.5 mr-1 font-inter">${ts}</p>` : ''}
    </div>`;
}

window._toggleFeedback = async function(btn, messageId, score) {
  // Cancel any prior in-flight feedback PATCH so a stale response can't
  // overwrite the latest user choice on the server.
  if (_feedbackCtrl) _feedbackCtrl.abort();
  _feedbackCtrl = new AbortController();
  const ctrl = _feedbackCtrl;

  const wasActive = btn.dataset.active === 'true';
  const newScore = wasActive ? null : score;

  // optimistic: clear all feedback buttons for this message, then highlight if new score
  document.querySelectorAll(`[data-msg-id="${messageId}"]`).forEach(b => {
    b.dataset.active = 'false';
    b.setAttribute('aria-pressed', 'false');
    b.classList.remove('text-[#0A3D3C]', 'bg-[#DAF0EE]', 'text-[#EE6742]', 'bg-[#FFE5DD]');
    b.classList.add('text-gray-400');
  });
  if (newScore !== null) {
    btn.dataset.active = 'true';
    btn.setAttribute('aria-pressed', 'true');
    btn.classList.remove('text-gray-400');
    if (newScore === 1) {
      btn.classList.add('text-[#0A3D3C]', 'bg-[#DAF0EE]');
    } else {
      btn.classList.add('text-[#EE6742]', 'bg-[#FFE5DD]');
    }
  } else {
    btn.setAttribute('aria-pressed', 'false');
  }

  try {
    await api.patch(`/api/messages/${messageId}/feedback`, { score: newScore }, { signal: ctrl.signal });
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('feedback failed', err);
    showToast('Could not save feedback');
  } finally {
    if (_feedbackCtrl === ctrl) _feedbackCtrl = null;
  }
};

function aiMsgHTML(m) {
  const safe = m.is_safe !== false;
  const ts = formatMsgTime(m.created_at);
  return `
    <div class="ai-msg-group flex gap-3 mb-7">
      <div class="flex-shrink-0 w-8 h-8 rounded-full bg-[#DAF0EE] flex items-center justify-center mt-0.5 shadow-sm">
        <svg class="w-4 h-4 text-[#0A3D3C]" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
        </svg>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-[11px] font-semibold font-jakarta text-[#0A3D3C] mb-1.5">Bubbli</p>
        <div class="bg-white border border-[#DAF0EE] rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm">
          <div class="ai-content text-[15px] font-inter text-[#1F2937] leading-relaxed">${escHtml(m.content)}</div>
          ${!safe ? `
            <p class="text-[11px] text-[#EE6742] mt-3 font-semibold flex items-center gap-1 pt-2 border-t border-[#FFE5DD]">
              <svg class="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd"/>
              </svg>
              Safety notice
            </p>` : ''}
        </div>
        <div class="flex items-center gap-2 mt-2 ml-1">
          ${ts ? `<span class="text-[11px] text-gray-400 font-inter">${ts}</span>` : ''}
          <div class="ai-actions flex items-center gap-1">
          ${m.id ? `
            <button onclick="window._toggleFeedback(this, '${escAttr(m.id)}', 1)"
                    data-msg-id="${escAttr(m.id)}" data-active="${m.feedback_score === 1}"
                    aria-label="Helpful" aria-pressed="${m.feedback_score === 1}"
                    class="${m.feedback_score === 1 ? 'text-[#0A3D3C] bg-[#DAF0EE]' : 'text-gray-400'} hover:text-[#0A3D3C] hover:bg-[#DAF0EE] p-1.5 rounded-lg cursor-pointer transition-colors" title="Helpful">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m10.598-9.75H14.25M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.654 3.375Z" />
              </svg>
            </button>
            <button onclick="window._toggleFeedback(this, '${escAttr(m.id)}', -1)"
                    data-msg-id="${escAttr(m.id)}" data-active="${m.feedback_score === -1}"
                    aria-label="Not helpful" aria-pressed="${m.feedback_score === -1}"
                    class="${m.feedback_score === -1 ? 'text-[#EE6742] bg-[#FFE5DD]' : 'text-gray-400'} hover:text-[#EE6742] hover:bg-[#FFE5DD] p-1.5 rounded-lg cursor-pointer transition-colors" title="Not helpful">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977a8.96 8.96 0 0 1-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398-.306.774-1.086 1.227-1.918 1.227h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 0 0 .303-.54m.023-8.25H16.48a4.5 4.5 0 0 1 1.423.23l3.114 1.04a4.5 4.5 0 0 0 1.423.23h1.294M14.25 9h-3.027c-.808 0-1.535.446-2.033 1.08a9.039 9.039 0 0 1-2.861 2.4c-.723.384-1.35.956-1.653 1.715a4.499 4.499 0 0 0-.322 1.672v.633a2.25 2.25 0 0 0 2.25 2.25.75.75 0 0 0 .75-.75v-.182c0-.866.385-1.65 1.03-2.193 1.617-1.359 2.667-3.16 2.844-5.124M14.25 9V5.25c0-1.5-.75-2.25-2.25-2.25l-1.5 4.5L9 9h5.25Z" />
              </svg>
            </button>` : ''}
          <button onclick="window._copyMsg(this)" data-content="${escAttr(m.content ?? '')}"
                  class="text-gray-400 hover:text-[#0A3D3C] p-1.5 rounded-lg hover:bg-[#DAF0EE] cursor-pointer transition-colors" title="Copy">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
            </svg>
          </button>
          </div>
        </div>
      </div>
    </div>`;
}

window._copyMsg = function(btn) {
  const content = btn.dataset.content || '';
  navigator.clipboard.writeText(content).then(() => showToast('Copied'));
};

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.opacity = '1';
  setTimeout(() => { t.style.opacity = '0'; }, 1500);
}

// ─── Sending messages ────────────────────────────────────────────────────────

async function sendFromWelcome() {
  const input   = document.getElementById('welcome-input');
  const content = input.value.trim();
  if (!content) return;

  // Create new conversation, switch to active state, then send
  try {
    const conv = await api.post('/api/conversations', {});
    setActiveConv(conv.id);
    showActiveChat();
    document.getElementById('messages').innerHTML = '';
    document.getElementById('msg-input').value = content;
    input.value = '';
    await loadConversations();
    await sendMessage('msg-input');
  } catch (err) {
    console.error('failed to start chat', err);
  }
}

async function sendMessage(inputId) {
  const input = document.getElementById(inputId);
  const content = input.value.trim();
  if (!content || !activeConversationId) return;

  input.value = '';
  input.style.height = 'auto';
  document.getElementById('send-btn').disabled = true;
  document.getElementById('send-btn').classList.add('hidden');
  document.getElementById('stop-btn').classList.remove('hidden');

  const container = document.getElementById('messages');
  // If empty state placeholder, clear it
  if (container.querySelector('.select-none')) container.innerHTML = '';
  container.insertAdjacentHTML('beforeend', userMsgHTML({
    role: 'learner', content, is_safe: true, created_at: new Date().toISOString(),
  }));
  scrollToBottom();

  // AI streaming bubble
  const streamId = 'stream-' + Date.now();
  container.insertAdjacentHTML('beforeend', `
    <div class="ai-msg-group flex gap-3 mb-7" id="${streamId}">
      <div class="flex-shrink-0 w-8 h-8 rounded-full bg-[#DAF0EE] flex items-center justify-center mt-0.5 shadow-sm">
        <svg class="w-4 h-4 text-[#0A3D3C]" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
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

  let accumulated = '';
  let started = false;

  streamCtrl = api.stream(
    `/api/conversations/${activeConversationId}/messages/stream`,
    { content, idempotency_key: crypto.randomUUID() },
    {
      'assistant.chunk': ({ content: chunk }) => {
        accumulated += chunk;
        if (!started) {
          started = true;
          document.getElementById(`${streamId}-dots`)?.remove();
          const t = document.getElementById(`${streamId}-text`);
          if (t) t.classList.remove('hidden');
        }
        const t = document.getElementById(`${streamId}-text`);
        if (t) t.textContent = accumulated;
        scrollToBottom();
      },
      'assistant.completed': ({ content: full }) => { if (full) accumulated = full; },
      done: () => {
        document.getElementById(`${streamId}-dots`)?.remove();
        document.getElementById('send-btn')?.removeAttribute('disabled');
        document.getElementById('send-btn')?.classList.remove('hidden');
        document.getElementById('stop-btn')?.classList.add('hidden');
        reloadMessages(streamId, accumulated);
        loadConversations();
        // Auto-title runs server-side as fire-and-forget; the LLM call can
        // take longer than the streamed reply, so poll a few times and stop
        // as soon as the active conversation has a real title.
        pollForTitle(activeConversationId);
      },
      error: (err) => {
        console.error('[chatter] stream error:', err);
        document.getElementById(`${streamId}-dots`)?.remove();
        document.getElementById('send-btn')?.removeAttribute('disabled');
        document.getElementById('send-btn')?.classList.remove('hidden');
        document.getElementById('stop-btn')?.classList.add('hidden');
        reloadMessages(streamId, accumulated);
      },
    }
  );
}

async function reloadMessages(streamId, accumulated) {
  try {
    const data = await api.get(`/api/conversations/${activeConversationId}`);
    const msgs = data?.messages ?? [];
    if (msgs.length) { renderMessages(msgs); return; }
  } catch (err) {
    console.error('[chatter] reloadMessages failed:', err);
  }
  const t = document.getElementById(`${streamId}-text`);
  if (t && !accumulated) t.textContent = 'Something went wrong. Please try again.';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
