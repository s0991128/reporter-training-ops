import { getTaskState, saveTaskState, TASK_STATUS } from './storage.js';
import { matchesTaskSearch } from './search.js';
import { validateTasks } from './validator.js';
import { calculateTaskDate, getDaysDifference, getDueSoonTasks, getOverdueTasks, getScheduleStatus, getTasksDueThisWeek, getTasksDueToday, formatTaskDate, SCHEDULE_STATUS } from './schedule.js';

function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[character])); }
function formatCompletedAt(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ko-KR').format(date);
}
function getScheduleMessage(task, taskState, settings) {
  const status = getScheduleStatus(task, taskState, settings);
  const taskDate = calculateTaskDate(task, settings);
  if (!taskDate) return { status, date:'', message:'' };
  const daysUntilDue = getDaysDifference(new Date(), taskDate);
  const messages = {
    [SCHEDULE_STATUS.UPCOMING]:`마감까지 ${daysUntilDue}일`,
    [SCHEDULE_STATUS.DUE_SOON]:`마감까지 ${daysUntilDue}일`,
    [SCHEDULE_STATUS.DUE_TODAY]:'오늘 마감',
    [SCHEDULE_STATUS.OVERDUE]:`${Math.abs(daysUntilDue)}일 지연`,
    [SCHEDULE_STATUS.COMPLETED]:'완료'
  };
  return { status, date:formatTaskDate(taskDate), message:messages[status] || '' };
}
function hasScheduleFilter(filters, filter) { return filters.has(filter); }
function matchesScheduleFilter(task, state, settings, filter) {
  if (filter === 'today') return getTasksDueToday([task], state, settings).length > 0;
  if (filter === 'week') return getTasksDueThisWeek([task], state, settings).length > 0;
  if (filter === 'urgent') return getDueSoonTasks([task], state, settings).length > 0;
  if (filter === 'overdue') return getOverdueTasks([task], state, settings).length > 0;
  return true;
}

export async function loadTasks(url = './data/tasks.json') {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`업무 데이터 로드 실패: HTTP ${response.status}`);
  const tasks = await response.json();
  const validation = validateTasks(tasks);
  if (!validation.valid) console.error(`[tasks.json] ${validation.errors.length}개 오류:\n- ${validation.errors.join('\n- ')}`);
  return Array.isArray(tasks) ? tasks : [];
}

export function getTasksByPhase(tasks, phase) { return tasks.filter(task => task.phase === phase); }
export function getTaskTimingLabel(task) { return task.timing?.label || ''; }
export function getCompletionCriteria(task) { return Array.isArray(task.completionCriteria) ? task.completionCriteria : []; }
export function getTaskCaution(task) { return task.handover?.caution || ''; }

export function filterTasks(tasks, state, {stage = '전체', search = '', filters = new Set(), settings = state?.settings || {}} = {}) {
  const query = search.trim().toLowerCase();
  const scheduleFilters = ['today', 'week', 'urgent', 'overdue'];
  return tasks.filter(task => {
    const taskState = getTaskState(state, task.id);
    return (stage === '전체' || task.phase === stage)
      && (!query || matchesTaskSearch(task, query))
      && (!filters.has('required') || task.required)
      && (!filters.has('incomplete') || taskState.status !== TASK_STATUS.COMPLETED)
      && scheduleFilters.filter(filter => hasScheduleFilter(filters, filter)).every(filter => matchesScheduleFilter(task, state, settings, filter));
  });
}

export function renderTasks(tasks, state, list) {
  if (!tasks.length) { list.innerHTML = '<div class="empty-state">조건에 맞는 업무가 없습니다.<br /><small>검색어, 일정 설정 또는 필터를 조정해 보세요.</small></div>'; return; }
  list.innerHTML = tasks.map(task => {
    const taskState = getTaskState(state, task.id);
    const completed = taskState.status === TASK_STATUS.COMPLETED;
    const schedule = getScheduleMessage(task, taskState, state.settings);
    const criteria = getCompletionCriteria(task).map(item => `<li>${escapeHtml(item)}</li>`).join('');
    const scheduleMarkup = schedule.date ? `<div class="schedule-detail"><span class="schedule-date">${schedule.date}</span><span class="schedule-status schedule-status-${schedule.status.toLowerCase()}">${schedule.message}</span></div>` : '';
    return `<article class="task-card ${completed ? 'is-complete' : ''} schedule-card-${schedule.status.toLowerCase()}" data-task-id="${escapeHtml(task.id)}">
      <div class="task-topline"><div><span class="day-badge">${escapeHtml(getTaskTimingLabel(task))}</span>${scheduleMarkup}</div><span class="stage-badge">${escapeHtml(task.category)}</span></div>
      <h3>${escapeHtml(task.title)}</h3><p class="task-description">${escapeHtml(task.description)}</p>
      <div class="meta-row"><span>담당 <b>${escapeHtml(task.assigneeRole)}</b></span><span>소요 <b>${task.estimatedMinutes}분</b></span><span class="${task.required ? 'required' : 'optional'}">${task.required ? '필수' : '선택'}</span></div>
      <div class="completion-criteria"><span>완료기준</span><ul>${criteria}</ul></div><p class="caution"><span>주의</span> ${escapeHtml(getTaskCaution(task))}</p>
      <div class="completion-row"><label class="completion-label"><input type="checkbox" data-action="complete" ${completed ? 'checked' : ''} /> <span>${completed ? '완료됨' : '완료 체크'}</span></label><span class="complete-date">${taskState.completedAt ? `완료일 ${formatCompletedAt(taskState.completedAt)}` : ''}</span><button class="memo-button" data-action="memo">${taskState.memo ? '메모 수정' : '메모 입력'} ${taskState.memo ? '•' : '+'}</button></div>
      <div class="memo-area ${taskState.memo ? 'open' : ''}"><textarea data-action="memo-input" placeholder="인수인계에 필요한 메모를 입력하세요.">${escapeHtml(taskState.memo || '')}</textarea><p class="memo-hint">메모는 이 브라우저에만 저장됩니다.</p></div>
    </article>`;
  }).join('');
}

export function handleTaskEvent(event, state, onChange) {
  const action = event.target.dataset.action;
  if (!action) return;
  const card = event.target.closest('[data-task-id]'); const taskId = card?.dataset.taskId;
  if (!taskId) return;
  if (action === 'complete') {
    const patch = { status:event.target.checked ? TASK_STATUS.COMPLETED : TASK_STATUS.IN_PROGRESS, completedAt:event.target.checked ? new Date().toISOString() : null };
    state.tasks[taskId] = { ...getTaskState(state, taskId), ...patch };
    saveTaskState(taskId, patch);
    onChange();
  }
  if (action === 'memo-input') {
    const current = getTaskState(state, taskId);
    const patch = { memo:event.target.value, status:current.status === TASK_STATUS.NOT_STARTED ? TASK_STATUS.IN_PROGRESS : current.status };
    state.tasks[taskId] = { ...getTaskState(state, taskId), ...patch };
    saveTaskState(taskId, patch);
  }
  if (action === 'memo') card.querySelector('.memo-area')?.classList.toggle('open');
}
