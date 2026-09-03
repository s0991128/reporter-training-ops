import { getTaskState, TASK_STATUS } from './storage.js';
import { getTasksByPhase } from './tasks.js';
import { formatTaskDate, getDueSoonTasks, getOverdueTasks, getTasksDueToday } from './schedule.js';

export const STAGES = ['사전준비', '교육운영', '종료처리', '정산', '결과보고'];

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
  return stats;
}
