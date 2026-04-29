// teacher.js — Teacher/Admin dashboard logic
import { api } from './api.js';
import { clearTokens, parseJwtPayload } from './auth.js';

let selectedClassroomId = null;
let selectedStudentId   = null;
let flagBadgeCount      = 0;

// ─── Bootstrap ────────────────────────────────────────────────────────────────

export async function init() {
  // Header
  document.getElementById('user-name').textContent =
    sessionStorage.getItem('display_name') ?? 'Teacher';
  const emailEl = document.getElementById('user-email');
  const tok = sessionStorage.getItem('app_token');
  const email = sessionStorage.getItem('user_email') || (tok ? parseJwtPayload(tok)?.email : '') || '';
  if (emailEl) emailEl.textContent = email;

  document.getElementById('logout-btn').addEventListener('click', () => {
    clearTokens();
    location.href = '/frontend/index.html';
  });

  // Tab buttons
  document.getElementById('tab-students').addEventListener('click', () => switchTab('students'));
  document.getElementById('tab-classrooms').addEventListener('click', () => switchTab('classrooms'));
  document.getElementById('tab-moderation').addEventListener('click', () => switchTab('moderation'));

  await Promise.all([loadClassrooms(), loadFlaggedCount()]);
}

// ─── Classrooms & Students ───────────────────────────────────────────────────

async function loadClassrooms() {
  const select = document.getElementById('classroom-select');
  select.innerHTML = '<option value="">Loading…</option>';

  try {
    const data       = await api.get('/api/teacher/classrooms');
    const classrooms = data?.classrooms ?? data ?? [];

    if (!classrooms.length) {
      select.innerHTML = '<option value="">No classrooms</option>';
      return;
    }

    select.innerHTML = classrooms
      .map(c => `<option value="${escHtml(String(c.id))}">${escHtml(c.name)}${c.grade_level ? ' (' + escHtml(c.grade_level) + ')' : ''}</option>`)
      .join('');

    select.addEventListener('change', () => {
      if (select.value) loadStudents(select.value);
    });

    // Auto-load first classroom
    selectedClassroomId = String(classrooms[0].id);
    await loadStudents(selectedClassroomId);
  } catch (err) {
    select.innerHTML = '<option value="">Failed to load</option>';
    console.error(err);
  }
}

async function loadStudents(classroomId) {
  selectedClassroomId = classroomId;
  const list = document.getElementById('student-list');
  list.innerHTML = '<p class="text-xs text-gray-400 px-3 py-2">Loading…</p>';

  // Reset student panel
  document.getElementById('student-panel').classList.add('hidden');
  document.getElementById('teacher-empty').classList.remove('hidden');

  try {
    const data     = await api.get(`/api/teacher/classrooms/${classroomId}/students`);
    const students = data?.students ?? data ?? [];

    if (!students.length) {
      list.innerHTML = '<p class="text-xs text-gray-400 px-3 py-2 text-center">No students</p>';
      return;
    }

    list.innerHTML = students.map(s => {
      const displayName = s.name ?? s.display_name ?? 'User';
      const initial     = displayName[0].toUpperCase();
      const roleBadge   = s.primary_role && s.primary_role !== 'learner'
        ? `<span class="ml-auto text-[10px] text-gray-400 font-inter flex-shrink-0">${escHtml(s.primary_role)}</span>`
        : '';
      return `
        <button
          data-student-id="${escHtml(String(s.id))}"
          class="student-btn w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left hover:bg-[#DAF0EE] transition-colors duration-150 cursor-pointer"
          onclick="window._selectStudent('${escHtml(String(s.id))}', '${escHtml(displayName)}', this)">
          <div class="flex-shrink-0 w-8 h-8 rounded-full bg-[#E3F2FD] flex items-center justify-center text-[#3b82f6] text-xs font-bold font-jakarta">
            ${escHtml(initial)}
          </div>
          <span class="text-sm font-inter text-[#0A3D3C] truncate flex-1">${escHtml(displayName)}</span>
          ${roleBadge}
        </button>`;
    }).join('');
  } catch (err) {
    list.innerHTML = '<p class="text-xs text-[#EE6742] px-3 py-2">Failed to load</p>';
    console.error(err);
  }
}

window._selectStudent = async function(studentId, name, btn) {
  selectedStudentId = studentId;

  // Highlight active student
  document.querySelectorAll('.student-btn').forEach(b =>
    b.classList.remove('bg-[#DAF0EE]', 'font-semibold'));
  btn.classList.add('bg-[#DAF0EE]', 'font-semibold');

  // Show student panel
  document.getElementById('student-panel-title').textContent = `${name}'s Activity`;
  document.getElementById('student-panel').classList.remove('hidden');
  document.getElementById('teacher-empty').classList.add('hidden');
  loadStudentParents(studentId);

  const convList = document.getElementById('teacher-conv-list');
  convList.innerHTML = '<p class="text-xs text-gray-400 px-3 py-2">Loading…</p>';
  document.getElementById('teacher-thread').innerHTML = '';

  try {
    const data  = await api.get(`/api/teacher/students/${studentId}/conversations`);
    const convs = data?.conversations ?? data ?? [];

    if (!convs.length) {
      convList.innerHTML = '<p class="text-xs text-gray-400 px-3 py-2 text-center">No conversations</p>';
      return;
    }

    convList.innerHTML = convs.map(c => `
      <button
        data-conv-id="${escHtml(String(c.id))}"
        class="conv-btn w-full text-left px-3 py-2.5 rounded-xl text-sm font-inter text-[#0A3D3C] hover:bg-[#DAF0EE] transition-colors duration-150 cursor-pointer ${c.is_flagged ? 'border-l-2 border-[#EE6742]' : ''}"
        onclick="window._loadStudentConv('${escHtml(String(c.id))}', this)">
        <span class="block truncate">${escHtml(c.title ?? 'Chat ' + String(c.id).slice(0, 6))}</span>
        ${c.is_flagged ? '<span class="text-[10px] text-[#EE6742] font-semibold">Flagged</span>' : ''}
      </button>
    `).join('');
  } catch (err) {
    convList.innerHTML = '<p class="text-xs text-[#EE6742] px-3 py-2">Failed to load</p>';
    console.error(err);
  }
};

window._loadStudentConv = async function(convId, btn) {
  // Highlight active conversation
  document.querySelectorAll('.conv-btn').forEach(b =>
    b.classList.remove('bg-[#DAF0EE]', 'font-semibold'));
  btn.classList.add('bg-[#DAF0EE]', 'font-semibold');

  const thread = document.getElementById('teacher-thread');
  thread.innerHTML = '<p class="text-xs text-gray-400 px-6 py-4">Loading messages…</p>';

  try {
    const data     = await api.get(`/api/teacher/conversations/${convId}/messages`);
    const messages = data?.messages ?? data ?? [];

    if (!messages.length) {
      thread.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full text-center px-8 select-none py-12">
          <p class="text-[#0A3D3C] font-jakarta font-semibold text-sm">No messages yet</p>
        </div>`;
      return;
    }

    thread.innerHTML = messages.map(teacherMsgHTML).join('');
    thread.scrollTop = thread.scrollHeight;
  } catch (err) {
    thread.innerHTML = '<p class="text-xs text-[#EE6742] px-6 py-4">Failed to load messages</p>';
    console.error(err);
  }
};

function teacherMsgHTML(m) {
  const isLearner = m.role === 'learner';
  const unsafe    = m.is_safe === false;
  return `
    <div class="flex ${isLearner ? 'justify-end' : 'justify-start'} mb-3 px-1">
      <div class="max-w-[75%] ${isLearner
        ? 'bg-[#0A3D3C] text-white rounded-2xl rounded-br-sm'
        : 'bg-white border border-[#DAF0EE] text-[#1A1A1A] rounded-2xl rounded-bl-sm shadow-sm'
      } px-4 py-3 text-sm font-inter leading-relaxed">
        ${escHtml(m.content)}
        ${unsafe ? `<p class="text-[10px] text-[#EE6742] mt-1.5 font-semibold flex items-center gap-1">
          <svg class="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd"/>
          </svg>
          Safety flag
        </p>` : ''}
      </div>
    </div>`;
}

// ─── Moderation ───────────────────────────────────────────────────────────────

async function loadFlaggedCount() {
  try {
    const data  = await api.get('/api/moderation/flagged');
    const flags = data?.flags ?? data ?? [];

    const unreviewed = flags.filter(f => f.reviewed === false);
    flagBadgeCount   = unreviewed.length;

    const badge = document.getElementById('flag-badge');
    if (flagBadgeCount > 0) {
      badge.textContent = flagBadgeCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }

    renderModerationTable(flags);
  } catch (err) {
    console.error('Failed to load flags:', err);
  }
}

function renderModerationTable(flags) {
  const tbody = document.getElementById('flag-table-body');
  if (!flags.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-4 py-8 text-center text-sm text-gray-400">No flags found</td>
      </tr>`;
    return;
  }

  tbody.innerHTML = flags.map(f => {
    const learnerName = f.learner_name ?? ('Learner ' + String(f.conversation_id).slice(0, 6));
    const convTitle   = f.conversation_title ?? ('Chat ' + String(f.conversation_id).slice(0, 6));
    const preview     = f.flagged_message_preview;

    const severityPill = severityHTML(f.severity);
    const statusPill   = f.reviewed
      ? '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">Reviewed</span>'
      : '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FFF0E8] text-[#EE6742]">Pending</span>';

    const viewBtn = `<button
      class="text-xs font-semibold font-inter text-[#0A3D3C] border border-[#0A3D3C] hover:bg-[#DAF0EE] rounded-full px-3 py-1.5 cursor-pointer transition-colors duration-150 mr-1.5"
      onclick="window._openConvViewer('${escHtml(String(f.conversation_id))}', '${escHtml(learnerName)}', '${escHtml(convTitle)}')">
      View
    </button>`;

    const actionBtn = !f.reviewed
      ? `<div class="flex items-center gap-1 flex-wrap">
           ${viewBtn}
           <button
             data-flag-id="${escHtml(String(f.id))}"
             class="review-btn text-xs font-semibold font-jakarta text-white bg-[#0A3D3C] hover:bg-[#072e2d] rounded-full px-3 py-1.5 cursor-pointer transition-colors duration-150"
             onclick="window._reviewFlag('${escHtml(String(f.id))}', this)">
             Mark Reviewed
           </button>
         </div>`
      : `<div class="flex items-center gap-1">${viewBtn}<span class="text-xs text-gray-300">Reviewed</span></div>`;

    return `
      <tr class="border-b border-[#DAF0EE] hover:bg-[#F2FBF9] transition-colors" data-flag-row="${escHtml(String(f.id))}">
        <td class="px-4 py-3">
          <p class="text-sm font-semibold text-[#0A3D3C] font-jakarta">${escHtml(learnerName)}</p>
          <p class="text-xs text-gray-400 mt-0.5">${escHtml(convTitle)}</p>
          ${preview ? `<p class="text-xs text-gray-500 mt-1 italic truncate max-w-[200px]">"${escHtml(preview)}"</p>` : ''}
        </td>
        <td class="px-4 py-3 text-sm text-[#374151]">${escHtml((f.flag_type ?? '—').replace(/_/g, ' '))}</td>
        <td class="px-4 py-3">${severityPill}</td>
        <td class="px-4 py-3">${statusPill}</td>
        <td class="px-4 py-3">${actionBtn}</td>
      </tr>`;
  }).join('');
}

function severityHTML(severity) {
  const s = (severity ?? '').toLowerCase();
  if (s === 'high')   return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">High</span>';
  if (s === 'medium') return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">Medium</span>';
  if (s === 'low')    return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">Low</span>';
  return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">${escHtml(severity ?? '—')}</span>`;
}

window._reviewFlag = async function(flagId, btn) {
  btn.disabled    = true;
  btn.textContent = 'Saving…';

  try {
    await api.patch(`/api/moderation/flags/${flagId}/review`, {});

    // Update the row in-place
    const row = document.querySelector(`[data-flag-row="${CSS.escape(flagId)}"]`);
    if (row) {
      // Status cell (4th td, index 3)
      const statusCell = row.cells[3];
      if (statusCell) {
        statusCell.innerHTML = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">Reviewed</span>';
      }
      // Action cell (5th td, index 4)
      const actionCell = row.cells[4];
      if (actionCell) {
        actionCell.innerHTML = '<span class="text-xs text-gray-300">—</span>';
      }
    }

    // Decrement badge
    flagBadgeCount = Math.max(0, flagBadgeCount - 1);
    const badge = document.getElementById('flag-badge');
    if (flagBadgeCount > 0) {
      badge.textContent = flagBadgeCount;
    } else {
      badge.classList.add('hidden');
    }
  } catch (err) {
    btn.disabled    = false;
    btn.textContent = 'Mark Reviewed';
    console.error('Failed to review flag:', err);
  }
};

// ─── Tab switching ────────────────────────────────────────────────────────────

export function switchTab(tab) {
  const tabs  = ['students', 'classrooms', 'moderation'];
  const views = ['view-students', 'view-classrooms', 'view-moderation'];

  // Deactivate all tabs and hide all views
  tabs.forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) {
      el.classList.remove('border-b-2', 'border-[#0A3D3C]', 'text-[#0A3D3C]', 'font-semibold');
      el.classList.add('text-gray-500', 'border-transparent');
    }
  });
  views.forEach(v => {
    const el = document.getElementById(v);
    if (el) el.classList.add('hidden');
  });

  // Activate selected tab and its view
  const activeTab  = document.getElementById(`tab-${tab}`);
  const activeView = document.getElementById(`view-${tab}`);
  if (activeTab) {
    activeTab.classList.add('border-b-2', 'border-[#0A3D3C]', 'text-[#0A3D3C]', 'font-semibold');
    activeTab.classList.remove('text-gray-500', 'border-transparent');
  }
  if (activeView) activeView.classList.remove('hidden');

  // Side effects per tab
  if (tab === 'moderation') loadFlaggedCount();
  if (tab === 'classrooms') loadManageClassrooms();
}

// ─── Classroom Management ─────────────────────────────────────────────────────

let activeClassroomId   = null;
let activeClassroomName = null;

export async function loadManageClassrooms() {
  const list = document.getElementById('classroom-list');
  list.innerHTML = '<p class="text-xs text-gray-400 px-3 py-2">Loading…</p>';
  try {
    const data       = await api.get('/api/teacher/manage/classrooms');
    const classrooms = data?.classrooms ?? [];
    if (!classrooms.length) {
      list.innerHTML = '<p class="text-xs text-gray-400 px-3 py-2 text-center">No classrooms yet.<br/>Click <b>New</b> to create one.</p>';
      return;
    }
    list.innerHTML = classrooms.map(c => `
      <button
        data-classroom-id="${escHtml(String(c.id))}"
        class="classroom-btn w-full text-left px-3 py-2.5 rounded-xl hover:bg-[#DAF0EE] transition-colors duration-150 cursor-pointer"
        onclick="window._selectClassroom('${escHtml(String(c.id))}', '${escHtml(c.name)}', '${escHtml(c.grade_level ?? '')}', this)">
        <p class="text-sm font-semibold font-jakarta text-[#0A3D3C] truncate">${escHtml(c.name)}</p>
        ${c.grade_level ? `<p class="text-xs text-gray-400 mt-0.5">${escHtml(c.grade_level)}</p>` : ''}
      </button>`).join('');
  } catch (err) {
    list.innerHTML = '<p class="text-xs text-[#EE6742] px-3 py-2">Failed to load</p>';
    console.error(err);
  }
}

window._selectClassroom = async function(id, name, grade, btn) {
  activeClassroomId   = id;
  activeClassroomName = name;
  document.querySelectorAll('.classroom-btn').forEach(b => b.classList.remove('bg-[#DAF0EE]', 'font-semibold'));
  btn.classList.add('bg-[#DAF0EE]', 'font-semibold');

  document.getElementById('classroom-empty').classList.add('hidden');
  document.getElementById('classroom-detail').classList.remove('hidden');
  document.getElementById('classroom-detail-name').textContent = name;
  document.getElementById('classroom-detail-meta').textContent = grade ? `Grade: ${grade}` : '';

  await loadClassroomMembers(id);
};

async function loadClassroomMembers(classroomId) {
  const container = document.getElementById('classroom-members-list');
  container.innerHTML = '<p class="text-xs text-gray-400">Loading…</p>';
  try {
    const data    = await api.get(`/api/teacher/manage/classrooms/${classroomId}/members`);
    const members = data?.members ?? [];
    if (!members.length) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-12 text-center">
          <p class="text-sm text-gray-400">No learners yet.</p>
          <p class="text-xs text-gray-300 mt-1">Click <span class="font-semibold">Add Learner</span> to enrol someone.</p>
        </div>`;
      return;
    }
    container.innerHTML = members.map(m => {
      const name = m.display_name || m.external_subject?.slice(0, 16) || 'Learner';
      return `
        <div class="flex items-center gap-3 bg-white rounded-xl border border-[#DAF0EE] px-4 py-3 shadow-sm">
          <div class="w-9 h-9 rounded-full bg-[#DAF0EE] flex items-center justify-center text-[#0A3D3C] text-sm font-bold font-jakarta flex-shrink-0">
            ${escHtml(name[0].toUpperCase())}
          </div>
          <span class="flex-1 text-sm font-inter text-[#1A1A1A] truncate">${escHtml(name)}</span>
          <button
            class="text-xs text-gray-400 hover:text-[#EE6742] font-semibold cursor-pointer transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
            onclick="window._removeLearner('${escHtml(classroomId)}', '${escHtml(m.user_id)}', this)">
            Remove
          </button>
        </div>`;
    }).join('');
  } catch (err) {
    container.innerHTML = '<p class="text-xs text-[#EE6742]">Failed to load members</p>';
    console.error(err);
  }
}

window._openCreateClassroom = function() {
  document.getElementById('cc-name').value  = '';
  document.getElementById('cc-grade').value = '';
  document.getElementById('cc-year').value  = '';
  document.getElementById('create-classroom-modal').classList.remove('hidden');
  document.getElementById('cc-name').focus();
};

window._submitCreateClassroom = async function() {
  const name  = document.getElementById('cc-name').value.trim();
  const grade = document.getElementById('cc-grade').value.trim();
  const year  = document.getElementById('cc-year').value.trim();
  if (!name) { document.getElementById('cc-name').focus(); return; }

  const btn = document.getElementById('cc-submit-btn');
  btn.disabled = true; btn.textContent = 'Creating…';
  try {
    await api.post('/api/teacher/manage/classrooms', { name, grade_level: grade || undefined, academic_year: year || undefined });
    document.getElementById('create-classroom-modal').classList.add('hidden');
    await loadManageClassrooms();
  } catch (err) {
    console.error(err);
  } finally {
    btn.disabled = false; btn.textContent = 'Create';
  }
};

window._openAddLearner = async function() {
  if (!activeClassroomId) return;
  const listEl = document.getElementById('add-learner-list');
  listEl.innerHTML = '<p class="text-xs text-gray-400 py-2">Loading learners…</p>';
  document.getElementById('add-learner-modal').classList.remove('hidden');

  try {
    // Fetch all users with conversations, then filter out already-enrolled ones
    const [allRes, membersRes] = await Promise.all([
      api.get('/api/teacher/classrooms/00000000-0000-0000-0000-000000000001/students'),
      api.get(`/api/teacher/manage/classrooms/${activeClassroomId}/members`),
    ]);
    const allUsers   = allRes?.students ?? [];
    const enrolled   = new Set((membersRes?.members ?? []).map(m => m.user_id));
    const available  = allUsers.filter(u => !enrolled.has(u.id));

    if (!available.length) {
      listEl.innerHTML = '<p class="text-xs text-gray-400 py-2 text-center">All learners are already enrolled.</p>';
      return;
    }
    listEl.innerHTML = available.map(u => {
      const name = u.name ?? u.display_name ?? 'Learner';
      return `
        <button
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#DAF0EE] transition-colors cursor-pointer text-left"
          onclick="window._addLearner('${escHtml(String(u.id))}', this)">
          <div class="w-8 h-8 rounded-full bg-[#DAF0EE] flex items-center justify-center text-[#0A3D3C] text-xs font-bold flex-shrink-0">
            ${escHtml(name[0].toUpperCase())}
          </div>
          <span class="text-sm font-inter text-[#1A1A1A] flex-1 truncate">${escHtml(name)}</span>
          <span class="text-xs text-[#0A3D3C] font-semibold">+ Add</span>
        </button>`;
    }).join('');
  } catch (err) {
    listEl.innerHTML = '<p class="text-xs text-[#EE6742] py-2">Failed to load</p>';
    console.error(err);
  }
};

window._addLearner = async function(userId, btn) {
  btn.disabled = true;
  try {
    await api.post(`/api/teacher/manage/classrooms/${activeClassroomId}/members`, { user_id: userId });
    btn.remove();
    await loadClassroomMembers(activeClassroomId);
    // Close modal if no more learners to add
    const remaining = document.getElementById('add-learner-list').querySelectorAll('button');
    if (!remaining.length) document.getElementById('add-learner-modal').classList.add('hidden');
  } catch (err) {
    btn.disabled = false;
    console.error(err);
  }
};

window._removeLearner = async function(classroomId, userId, btn) {
  btn.disabled = true; btn.textContent = '…';
  try {
    await fetch(`http://localhost:8001/api/teacher/manage/classrooms/${classroomId}/members/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${sessionStorage.getItem('app_token')}` },
    });
    await loadClassroomMembers(classroomId);
  } catch (err) {
    btn.disabled = false; btn.textContent = 'Remove';
    console.error(err);
  }
};

// ─── Conversation Viewer ──────────────────────────────────────────────────────

let _pendingConvId = null;
let _pendingLearnerName = null;
let _pendingConvTitle = null;

window._openConvViewer = function(convId, learnerName, convTitle) {
  _pendingConvId     = convId;
  _pendingLearnerName = learnerName;
  _pendingConvTitle  = convTitle;

  // Show privacy warning first
  document.getElementById('privacy-modal').classList.remove('hidden');
  document.getElementById('privacy-confirm-btn').onclick = window._confirmAndViewConv;
};

window._confirmAndViewConv = async function() {
  document.getElementById('privacy-modal').classList.add('hidden');

  const modal    = document.getElementById('conv-modal');
  const messages = document.getElementById('conv-modal-messages');
  document.getElementById('conv-modal-title').textContent  = _pendingConvTitle ?? 'Conversation';
  document.getElementById('conv-modal-learner').textContent = `Learner: ${_pendingLearnerName ?? '—'}`;
  messages.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Loading…</p>';
  modal.classList.remove('hidden');

  try {
    const data = await api.get(`/api/moderation/flagged/${_pendingConvId}`);
    const msgs = data?.messages ?? [];
    if (!msgs.length) {
      messages.innerHTML = '<p class="text-xs text-gray-400 text-center py-8">No messages</p>';
      return;
    }
    messages.innerHTML = msgs.map(m => {
      const isLearner = m.role === 'learner';
      const unsafe    = m.is_safe === false;
      return `
        <div class="flex ${isLearner ? 'justify-end' : 'justify-start'} mb-2 px-1">
          <div class="max-w-[78%] ${isLearner
            ? 'bg-[#0A3D3C] text-white rounded-2xl rounded-br-sm'
            : 'bg-white border border-[#DAF0EE] text-[#1A1A1A] rounded-2xl rounded-bl-sm shadow-sm'
          } px-4 py-2.5 text-sm font-inter leading-relaxed">
            ${escHtml(m.content)}
            ${unsafe ? '<p class="text-[10px] text-[#EE6742] mt-1 font-semibold">Safety flag</p>' : ''}
          </div>
        </div>`;
    }).join('');
    messages.scrollTop = messages.scrollHeight;
  } catch (err) {
    messages.innerHTML = '<p class="text-xs text-[#EE6742] text-center py-8">Failed to load conversation</p>';
    console.error(err);
  }
};

window._closePrivacyModal = function() {
  document.getElementById('privacy-modal').classList.add('hidden');
  _pendingConvId = _pendingLearnerName = _pendingConvTitle = null;
};

window._closeConvModal = function() {
  document.getElementById('conv-modal').classList.add('hidden');
};

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
          class="opacity-0 group-hover:opacity-100 text-xs text-gray-300 hover:text-[#EE6742] cursor-pointer transition-opacity px-1"
          title="Remove parent link">×</button>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = '<p class="text-xs text-[#EE6742] px-1 py-1">Failed to load</p>';
    console.error('loadStudentParents error:', err);
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
  if (!email) { input?.focus(); return; }

  const linkBtn = document.querySelector('#parent-add-form button');
  if (linkBtn) { linkBtn.textContent = 'Linking…'; linkBtn.disabled = true; }

  try {
    await api.post(`/api/teacher/students/${selectedStudentId}/parents`, { email });
    document.getElementById('parent-add-form')?.classList.add('hidden');
    await loadStudentParents(selectedStudentId);
  } catch (err) {
    const msg = err?.message || 'Failed to link parent';
    alert(msg);
  } finally {
    if (linkBtn) { linkBtn.textContent = 'Link'; linkBtn.disabled = false; }
  }
};

window._removeParentLink = async function(parentId, btn) {
  if (!selectedStudentId) return;
  if (!confirm('Remove this parent link?')) return;
  const orig = btn.textContent;
  btn.textContent = '…';
  try {
    await api.delete(`/api/teacher/students/${selectedStudentId}/parents/${parentId}`);
    await loadStudentParents(selectedStudentId);
  } catch {
    alert('Failed to remove parent link');
    btn.textContent = orig;
  }
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
