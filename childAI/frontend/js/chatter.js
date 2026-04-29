// chatter.js — Learner chat dashboard logic
import { api } from './api.js';
import { clearTokens } from './auth.js';

const displayName = sessionStorage.getItem('display_name') ?? 'Learner';
let activeConversationId = null;
let streamCtrl = null;

function emailFromToken() {
  try {
    const t = sessionStorage.getItem('app_token');
    if (!t) return '';
    return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))?.email ?? '';
  } catch { return ''; }
}

export async function init() {
  document.getElementById('user-name').textContent = displayName;
  const emailEl = document.getElementById('user-email');
  const email = sessionStorage.getItem('user_email') || emailFromToken();
  if (emailEl && email) emailEl.textContent = email;

  document.getElementById('logout-btn').addEventListener('click', () => {
    clearTokens();
    location.href = '/frontend/index.html';
  });

  document.getElementById('new-chat-btn').addEventListener('click', createConversation);
  document.getElementById('send-btn').addEventListener('click', sendMessage);
  document.getElementById('msg-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  // Auto-resize textarea
  document.getElementById('msg-input').addEventListener('input', (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  });

  await loadConversations();
}

async function loadConversations() {
  const list = document.getElementById('conv-list');
  list.innerHTML = '<li class="text-xs text-gray-400 px-3 py-2">Loading…</li>';
  try {
    const data = await api.get('/api/conversations?limit=20');
    const conversations = data?.conversations ?? [];
    if (!conversations.length) {
      list.innerHTML = '<li class="text-xs text-gray-400 px-3 py-2 text-center">No chats yet</li>';
      return;
    }
    list.innerHTML = conversations.map(c => `
      <li>
        <button
          class="w-full text-left px-3 py-2.5 rounded-xl text-sm font-inter text-[#0A3D3C] hover:bg-[#DAF0EE] cursor-pointer transition-colors duration-150 ${c.is_flagged ? 'border-l-2 border-[#EE6742]' : ''}"
          data-id="${c.id}"
          onclick="window._selectConv('${c.id}', this)">
          ${escHtml(c.title ?? 'Chat ' + c.id.slice(0, 6))}
          ${c.is_flagged ? '<span class="ml-1 text-[10px] text-[#EE6742] font-semibold">Flagged</span>' : ''}
        </button>
      </li>
    `).join('');
  } catch (err) {
    list.innerHTML = '<li class="text-xs text-[#EE6742] px-3 py-2">Failed to load</li>';
    console.error(err);
  }
}

window._selectConv = async function(id, btn) {
  document.querySelectorAll('#conv-list button').forEach(b => b.classList.remove('bg-[#DAF0EE]', 'font-semibold'));
  btn.classList.add('bg-[#DAF0EE]', 'font-semibold');
  activeConversationId = id;

  showEmptyState(false);
  renderMessages([]);

  try {
    const data = await api.get(`/api/conversations/${id}`);
    renderMessages(data?.messages ?? []);
  } catch (err) {
    console.error(err);
  }

  document.getElementById('chat-input-area').classList.remove('hidden');
  document.getElementById('msg-input').focus();
};

async function createConversation() {
  try {
    const conv = await api.post('/api/conversations', {});
    activeConversationId = conv.id;
    await loadConversations();
    // Highlight new conversation
    const btn = document.querySelector(`[data-id="${conv.id}"]`);
    if (btn) btn.classList.add('bg-[#DAF0EE]', 'font-semibold');
    showEmptyState(false);
    renderMessages([]);
    document.getElementById('chat-input-area').classList.remove('hidden');
    document.getElementById('msg-input').focus();
  } catch (err) {
    console.error(err);
  }
}

function renderMessages(messages) {
  const container = document.getElementById('messages');
  if (!messages.length) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full text-center px-8 select-none">
        <div class="w-16 h-16 bg-[#DAF0EE] rounded-2xl flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-[#0A3D3C]" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
          </svg>
        </div>
        <p class="text-[#0A3D3C] font-jakarta font-semibold text-base">Start the conversation</p>
        <p class="text-gray-400 text-sm mt-1">Ask me anything — I'm here to help!</p>
      </div>`;
    return;
  }
  container.innerHTML = messages.map(msgHTML).join('');
  container.scrollTop = container.scrollHeight;
}

function msgHTML(m) {
  const isLearner = m.role === 'learner';
  return `
    <div class="flex ${isLearner ? 'justify-end' : 'justify-start'} mb-3 px-1">
      <div class="max-w-[75%] ${isLearner
        ? 'bg-[#0A3D3C] text-white rounded-2xl rounded-br-sm'
        : 'bg-white border border-[#DAF0EE] text-[#1A1A1A] rounded-2xl rounded-bl-sm shadow-sm'
      } px-4 py-3 text-sm font-inter leading-relaxed">
        ${escHtml(m.content)}
        ${m.is_safe === false ? '<p class="text-[10px] text-[#EE6742] mt-1.5 font-semibold">Safety notice</p>' : ''}
      </div>
    </div>`;
}

async function sendMessage() {
  const input   = document.getElementById('msg-input');
  const content = input.value.trim();
  if (!content || !activeConversationId) return;

  input.value = '';
  input.style.height = 'auto';
  document.getElementById('send-btn').disabled = true;

  // Optimistic learner bubble
  const container = document.getElementById('messages');
  // Clear empty state if present
  if (container.querySelector('.select-none')) container.innerHTML = '';
  container.insertAdjacentHTML('beforeend', msgHTML({ role: 'learner', content, is_safe: true }));
  container.scrollTop = container.scrollHeight;

  // Streaming AI bubble — starts as typing indicator, transitions to text
  const streamId = 'stream-' + Date.now();
  container.insertAdjacentHTML('beforeend', `
    <div class="flex justify-start mb-3 px-1" id="${streamId}">
      <div class="bg-white border border-[#DAF0EE] text-[#1A1A1A] rounded-2xl rounded-bl-sm shadow-sm px-4 py-3 text-sm font-inter leading-relaxed max-w-[75%]">
        <span id="${streamId}-dots" class="flex gap-1.5 items-center py-0.5">
          <span class="w-2 h-2 rounded-full bg-[#0A3D3C]/30 animate-bounce" style="animation-delay:0ms"></span>
          <span class="w-2 h-2 rounded-full bg-[#0A3D3C]/30 animate-bounce" style="animation-delay:160ms"></span>
          <span class="w-2 h-2 rounded-full bg-[#0A3D3C]/30 animate-bounce" style="animation-delay:320ms"></span>
        </span>
        <span id="${streamId}-text" class="hidden"></span>
      </div>
    </div>`);
  container.scrollTop = container.scrollHeight;

  let accumulated = '';
  let streamingStarted = false;

  streamCtrl = api.stream(
    `/api/conversations/${activeConversationId}/messages/stream`,
    { content, idempotency_key: crypto.randomUUID() },
    {
      'assistant.chunk': ({ content: chunk }) => {
        accumulated += chunk;
        if (!streamingStarted) {
          streamingStarted = true;
          document.getElementById(`${streamId}-dots`)?.remove();
          const textEl = document.getElementById(`${streamId}-text`);
          if (textEl) textEl.classList.remove('hidden');
        }
        const el = document.getElementById(`${streamId}-text`);
        if (el) el.textContent = accumulated;
        if (container) container.scrollTop = container.scrollHeight;
      },
      'assistant.completed': ({ content: full }) => {
        if (full) accumulated = full;
      },
      done: () => {
        document.getElementById(`${streamId}-dots`)?.remove();
        document.getElementById('send-btn')?.removeAttribute('disabled');
        reloadMessages(streamId, accumulated);
        loadConversations();
      },
      error: (err) => {
        console.error('[chatter] stream error:', err);
        document.getElementById(`${streamId}-dots`)?.remove();
        document.getElementById('send-btn')?.removeAttribute('disabled');
        reloadMessages(streamId, accumulated);
      },
    }
  );
}

async function reloadMessages(streamId, accumulated) {
  try {
    const data = await api.get(`/api/conversations/${activeConversationId}`);
    const messages = data?.messages ?? [];
    if (messages.length) {
      renderMessages(messages);
      return;
    }
  } catch (err) {
    console.error('[chatter] reloadMessages failed:', err);
  }
  // Fallback: if reload fails but we have streamed content, keep it
  const el = document.getElementById(`${streamId}-text`);
  if (el && !accumulated) {
    el.textContent = 'Something went wrong. Please try again.';
  }
}

function showEmptyState(show) {
  const state = document.getElementById('chat-empty-state');
  if (state) state.classList.toggle('hidden', !show);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
