import { saveTaskState } from './storage.js';

function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character])); }
function isUrgent(task) { return /^D-(?:[1-7])$/.test(task.day) || task.day.includes('당일') || task.day.includes('+1일'); }

export function filterTasks(tasks, state, {stage, search, filters}) {
  const query = search.trim().toLowerCase();
  return tasks.filter(task => {
    const taskState = state[task.id] || {};
    const searchable = [task.title, task.description, task.caution].join(' ').toLowerCase();
    return (stage === '전체' || task.stage === stage) && (!query || searchable.includes(query)) && (!filters.has('required') || task.required) && (!filters.has('incomplete') || !taskState.completed) && (!filters.has('urgent') || isUrgent(task));
  });
}

export function renderTasks(tasks, state, list) {
  if (!tasks.length) { list.innerHTML = '<div class="empty-state">조건에 맞는 업무가 없습니다.<br /><small>검색어 또는 필터를 조정해 보세요.</small></div>'; return; }
  list.innerHTML = tasks.map(task => {
    const taskState = state[task.id] || {};
    const completed = Boolean(taskState.completed);
    return `<article class="task-card ${completed ? 'is-complete' : ''}" data-task-id="${task.id}">
      <div class="task-topline"><span class="day-badge">${escapeHtml(task.day)}</span><span class="stage-badge">${escapeHtml(task.category)}</span></div>
      <h3>${escapeHtml(task.title)}</h3><p class="task-description">${escapeHtml(task.description)}</p>
      <div class="meta-row"><span>담당 <b>${escapeHtml(task.role)}</b></span><span>소요 <b>${task.minutes}분</b></span><span class="${task.required ? 'required' : 'optional'}">${task.required ? '필수' : '선택'}</span></div>
      <p class="completion-criteria"><span>완료기준</span> ${escapeHtml(task.completion)}</p><p class="caution"><span>주의</span> ${escapeHtml(task.caution)}</p>
      <div class="completion-row"><label class="completion-label"><input type="checkbox" data-action="complete" ${completed ? 'checked' : ''} /> <span>${completed ? '완료됨' : '완료 체크'}</span></label><span class="complete-date">${taskState.completedAt ? `완료일 ${taskState.completedAt}` : ''}</span><button class="memo-button" data-action="memo">${taskState.memo ? '메모 수정' : '메모 입력'} ${taskState.memo ? '•' : '+'}</button></div>
      <div class="memo-area ${taskState.memo ? 'open' : ''}"><textarea data-action="memo-input" placeholder="인수인계에 필요한 메모를 입력하세요.">${escapeHtml(taskState.memo || '')}</textarea><p class="memo-hint">메모는 이 브라우저에만 저장됩니다.</p></div>
    </article>`;
  }).join('');
}

export function isTaskUrgent(task) { return isUrgent(task); }

export function handleTaskEvent(event, state, onChange) {
  const action = event.target.dataset.action;
  if (!action) return;
  const card = event.target.closest('[data-task-id]'); const taskId = card?.dataset.taskId;
  if (!taskId) return;
  if (action === 'complete') {
    const patch = { completed:event.target.checked, started:true, completedAt:event.target.checked ? new Intl.DateTimeFormat('ko-KR').format(new Date()) : '' };
    state[taskId] = { ...(state[taskId] || {}), ...patch };
    saveTaskState(taskId, patch);
  }
  if (action === 'memo-input') {
    const patch = { memo:event.target.value, started:true };
    state[taskId] = { ...(state[taskId] || {}), ...patch };
    saveTaskState(taskId, patch);
  }
  if (action === 'memo') card.querySelector('.memo-area').classList.toggle('open');
  if (action === 'complete') onChange();
}
