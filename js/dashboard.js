import { getTaskState, TASK_STATUS } from './storage.js';
import { getTasksByPhase } from './tasks.js';
import { formatTaskDate, getDueSoonTasks, getOverdueTasks, getTasksDueToday } from './schedule.js';
import { getAlertSummary } from './alerts.js';
import { PHASES } from './constants.js';

export const STAGES = PHASES;

export function getStats(tasks, state) {
  const complete = tasks.filter(task => getTaskState(state, task.id).status === TASK_STATUS.COMPLETED).length;
  const progress = tasks.filter(task => getTaskState(state, task.id).status === TASK_STATUS.IN_PROGRESS).length;
  return { total:tasks.length, complete, pending:tasks.length - complete - progress, progress };
}

function renderScheduleSummary(tasks, state) {
  const settings = state.settings || {};
  const hasDates = settings.trainingStartDate && settings.trainingEndDate;
  const trainingName = settings.trainingName || (hasDates ? '수습기자 기본교육' : '교육일정 미설정');
  const period = hasDates ? `${formatTaskDate(settings.trainingStartDate)} ~ ${formatTaskDate(settings.trainingEndDate)}` : '미설정';
  document.querySelector('#schedule-training-name').textContent = trainingName;
  document.querySelector('#schedule-period').textContent = hasDates ? '설정된 교육 일정 기준으로 계산 중입니다.' : '교육일정을 설정하면 실제 마감일을 확인할 수 있습니다.';
  document.querySelector('#schedule-period-value').textContent = period;
  document.querySelector('#schedule-today-count').textContent = hasDates ? getTasksDueToday(tasks, state, settings).length : 0;
  document.querySelector('#schedule-due-soon-count').textContent = hasDates ? getDueSoonTasks(tasks, state, settings).length : 0;
  document.querySelector('#schedule-overdue-count').textContent = hasDates ? getOverdueTasks(tasks, state, settings).length : 0;
}

function renderAlertSummary(tasks, state) {
  const summary = getAlertSummary(tasks, state, state.settings);
  document.querySelector('#alert-total-count').textContent = summary.total;
  document.querySelector('#alert-blocked-count').textContent = summary.blocked;
  document.querySelector('#alert-overdue-count').textContent = summary.overdueRequired;
  document.querySelector('#alert-high-risk-count').textContent = summary.highRisk;
  document.querySelector('#alert-due-soon-count').textContent = summary.dueSoonCritical;
  const priorityList = document.querySelector('#priority-task-list');
  if (!summary.priorityTasks.length) {
    priorityList.innerHTML = '<li class="priority-empty">현재 확인이 필요한 업무가 없습니다.</li>';
    return;
  }
  priorityList.innerHTML = summary.priorityTasks.filter(item => item.task).map(item => `<li><button class="priority-task priority-${item.alert.severity.toLowerCase()}" type="button" data-task-id="${item.task.id}"><span class="priority-severity">${item.alert.severity}</span><span><b>${item.task.id}</b> ${item.task.title}</span><small>${item.alert.message}</small></button></li>`).join('');
}

export function renderDashboard(tasks, state) {
  const stats = getStats(tasks, state);
  const percent = stats.total ? Math.round((stats.complete / stats.total) * 100) : 0;
  document.querySelector('#total-count').textContent = stats.total;
  document.querySelector('#complete-count').textContent = stats.complete;
  document.querySelector('#progress-count').textContent = stats.progress;
  document.querySelector('#pending-count').textContent = stats.pending;
  document.querySelector('#progress-percent').textContent = `${percent}%`;
  document.querySelector('#overall-progress').style.width = `${percent}%`;
  document.querySelector('#progress-caption').textContent = stats.complete ? `${stats.complete}개 업무를 완료했습니다.` : '첫 업무를 완료하면 진행률이 표시됩니다.';
  document.querySelector('#all-tab-count').textContent = stats.total;
  document.querySelector('#stage-progress').innerHTML = STAGES.map(stage => {
    const stageTasks = getTasksByPhase(tasks, stage);
    const done = stageTasks.filter(task => getTaskState(state, task.id).status === TASK_STATUS.COMPLETED).length;
    const stagePercent = stageTasks.length ? Math.round(done / stageTasks.length * 100) : 0;
    return `<button class="stage-item" data-stage="${stage}"><div class="stage-top"><strong>${stage}</strong><span>${done}/${stageTasks.length}</span></div><div class="stage-track"><span style="width:${stagePercent}%"></span></div></button>`;
  }).join('');
  renderScheduleSummary(tasks, state);
  renderAlertSummary(tasks, state);
  return stats;
}
