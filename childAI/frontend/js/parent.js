import { api } from './api.js';
import { clearTokens } from './auth.js';

let selectedChildId   = null;
let selectedChildName = null;
let allConversations  = [];
let _pendingMsgId     = null;
let _pendingConvId    = null;
let _pendingConvTitle = null;

// ─── Bootstrap ────────────────────────────────────────────────────────────────

export async function init() {
  const displayName = sessionStorage.getItem('display_name') ?? 'Parent';
  document.getElementById('user-name').textContent = displayName;
  const avatar = document.getElementById('user-avatar');
  if (avatar && displayName) avatar.textContent = displayName[0].toUpperCase();
  const emailEl = document.getElementById('user-email');
  const email = sessionStorage.getItem('user_email') || (() => {
    try {
      const t = sessionStorage.getItem('app_token');
      return t ? JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))?.email ?? '' : '';
    } catch { return ''; }
  })();
  if (emailEl && email) emailEl.textContent = email;

  document.getElementById('logout-btn').addEventListener('click', () => {
    clearTokens();
    location.href = '/frontend/index.html';
  });

  // Tab buttons — set data-tab attribute for tracking
  ['conversations', 'sessions', 'safety'].forEach(t => {
    const btn = document.getElementById(`tab-${t}`);
    if (btn) {
      btn.dataset.tab = t;
      btn.addEventListener('click', () => switchTab(t));
    }
  });

  // Mark conversations tab as initially active
  const convBtn = document.getElementById('tab-conversations');
  if (convBtn) convBtn.dataset.active = 'true';

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
      const pill = document.getElementById('selected-child-pill');
      if (pill) { pill.classList.add('hidden'); pill.classList.remove('flex'); }
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
    const pill = document.getElementById('selected-child-pill');
    if (pill) { pill.classList.add('hidden'); pill.classList.remove('flex'); }
    console.error(err);
  }
}

window._selectChild = async function(childId, name, btn) {
  selectedChildId   = childId;
  selectedChildName = name;

  // Highlight selected child button
  document.querySelectorAll('.child-btn').forEach(b => {
    b.classList.remove('bg-[#F3F0FF]', 'border-[#DDD6FE]');
    b.classList.add('border-transparent');
  });
  btn.classList.add('bg-[#F3F0FF]', 'border-[#DDD6FE]');
  btn.classList.remove('border-transparent');

  // Update header pill
  const pill       = document.getElementById('selected-child-pill');
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
  const wrapper = document.getElementById('parent-thread-wrapper');
  wrapper.classList.add('hidden');
  wrapper.classList.remove('flex');
  document.getElementById('parent-conv-list').innerHTML =
    '<p class="text-xs text-gray-400 px-3 py-2">Loading…</p>';

  // Determine active tab
  const activeBtn = document.querySelector('[data-active="true"]');
  const activeTab = activeBtn?.dataset?.tab ?? 'conversations';
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
    if (selectedChildId !== childId) return;
    const convs = data?.conversations ?? [];
    allConversations = convs;

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
          class="conv-btn w-full text-left px-3 py-2.5 rounded-xl hover:bg-[#F2FBF9] transition-colors duration-150 cursor-pointer ${c.is_flagged ? 'border-l-2 border-[#EE6742]' : ''}"
          onclick="window._openConvViewer('${escHtml(String(c.id))}', '${escHtml(title)}', ${Boolean(c.is_flagged)})">
          <p class="text-sm font-inter text-[#0A3D3C] truncate">${escHtml(title)}</p>
          <div class="flex items-center gap-2 mt-0.5">
            <p class="text-[11px] text-gray-400 font-inter">${escHtml(dateStr)}</p>
            ${c.is_flagged ? '<span class="text-[10px] text-[#EE6742] font-semibold font-inter">Flagged</span>' : ''}
          </div>
        </button>`;
    }).join('');
  } catch (err) {
    allConversations = [];
    list.innerHTML = '<p class="text-xs text-[#EE6742] px-3 py-2">Failed to load</p>';
    console.error(err);
  }
}

// ─── Conversation viewer (privacy gate) ───────────────────────────────────────

window._openConvViewer = function(convId, title, isFlagged) {
  _pendingConvId    = convId;
  _pendingConvTitle = title;
  const modal = document.getElementById('privacy-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.getElementById('privacy-confirm-btn').onclick = () => window._confirmViewConv(isFlagged);
};

window._confirmViewConv = async function(isFlagged) {
  const modal = document.getElementById('privacy-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');

  // Highlight selected conversation
  document.querySelectorAll('.conv-btn').forEach(b => b.classList.remove('bg-[#F2FBF9]', 'font-semibold'));
  const convBtn = document.querySelector(`[data-conv-id="${CSS.escape(_pendingConvId)}"]`);
  if (convBtn) convBtn.classList.add('bg-[#F2FBF9]', 'font-semibold');

  document.getElementById('parent-empty').classList.add('hidden');
  const wrapper = document.getElementById('parent-thread-wrapper');
  wrapper.classList.remove('hidden');
  wrapper.classList.add('flex');

  document.getElementById('thread-title').textContent = _pendingConvTitle ?? 'Conversation';

  const flaggedBadge = document.getElementById('thread-flagged-badge');
  if (isFlagged) {
    flaggedBadge.classList.remove('hidden');
    flaggedBadge.classList.add('inline-flex');
  } else {
    flaggedBadge.classList.add('hidden');
    flaggedBadge.classList.remove('inline-flex');
  }

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
  const modal = document.getElementById('privacy-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
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
            <svg aria-hidden="true" class="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
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
  const resultEl = document.getElementById('translate-result');
  resultEl.textContent = '';
  resultEl.classList.add('hidden');
  const modal = document.getElementById('translate-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.getElementById('translate-btn').onclick = window._doTranslate;
};

window._doTranslate = async function() {
  if (!_pendingMsgId) return;
  const lang  = document.getElementById('translate-lang').value;
  const btn   = document.getElementById('translate-btn');
  btn.disabled    = true;
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
    btn.disabled    = false;
    btn.textContent = 'Translate';
  }
};

window._closeTranslateModal = function() {
  const modal = document.getElementById('translate-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  _pendingMsgId = null;
};

// ─── Sessions ─────────────────────────────────────────────────────────────────

async function loadSessions(childId) {
  const container = document.getElementById('sessions-container');
  container.innerHTML = '<p class="text-xs text-gray-400 text-center py-8">Loading…</p>';

  try {
    const data     = await api.get(`/api/parent/children/${childId}/sessions`);
    if (selectedChildId !== childId) return;
    const sessions = data?.sessions ?? [];

    if (!sessions.length) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <div class="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
            <svg aria-hidden="true" class="w-7 h-7 text-[#3B82F6]" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
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
  const title    = s.title ?? ('Session ' + String(s.id).slice(0, 6));
  const dateStr  = new Date(s.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
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
          <svg aria-hidden="true" class="w-5 h-5 text-[#3B82F6]" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
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
    if (selectedChildId !== childId) return;
    const convs = data?.conversations ?? [];
    allConversations = convs;
    const count = convs.filter(c => c.is_flagged).length;
    const badge = document.getElementById('safety-badge');
    if (count > 0) {
      badge.textContent = String(count);
      badge.classList.remove('hidden');
      badge.classList.add('inline-flex');
    } else {
      badge.classList.add('hidden');
      badge.classList.remove('inline-flex');
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
          <svg aria-hidden="true" class="w-7 h-7 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
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
              <svg aria-hidden="true" class="w-5 h-5 text-[#EE6742]" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd"/>
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold font-jakarta text-[#0A3D3C] truncate">${escHtml(title)}</p>
              <p class="text-xs text-gray-400 font-inter mt-0.5">${escHtml(dateStr)}</p>
            </div>
            <button
              class="flex-shrink-0 text-xs font-semibold font-jakarta text-white bg-[#EE6742] hover:bg-[#d4502b] rounded-full px-4 py-2 cursor-pointer transition-colors duration-150"
              onclick="window._reviewFlagged('${escHtml(String(c.id))}', '${escHtml(title)}')">
              Review
            </button>
          </div>`;
      }).join('')}
    </div>`;
}

window._reviewFlagged = function(convId, title) {
  // Switch to conversations tab, then open the conversation with privacy gate
  switchTab('conversations');
  window._openConvViewer(convId, title, true);
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
