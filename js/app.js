import { DEFAULT_SETTINGS, getTaskState, loadState, saveSettings, TASK_STATUS } from './storage.js';
import { renderDashboard } from './dashboard.js';
import { calculateTaskDate } from './schedule.js';
import { filterTasks, handleTaskEvent, loadTasks, renderTasks } from './tasks.js';
import { getDependencyConfirmationMessage } from './alerts.js';

const state = loadState();
let tasks = [];
let selectedStage = '전체';
let search = '';
let sort = 'default';
const activeFilters = new Set();
const taskList = document.querySelector('#task-list');
const settingsPanel = document.querySelector('#settings-panel');
const settingsForm = document.querySelector('#settings-form');
const settingsError = document.querySelector('#settings-error');
const dependencyConfirmation = document.querySelector('#dependency-confirmation');
const dependencyConfirmMessage = document.querySelector('#dependency-confirm-message');
let pendingCompletion = null;

async function initializeTasks() {
  try {
    tasks = await loadTasks();
    render();
  } catch (error) {
    taskList.innerHTML = '<div class="empty-state">업무 데이터를 불러오지 못했습니다.<br /><small>README.md의 로컬 서버 실행 방법을 확인해 주세요.</small></div>';
    document.querySelector('#result-summary').textContent = '데이터 로드 오류';
    console.error(error);
  }
}

function compareByDueDate(first, second) {
  const firstDate = calculateTaskDate(first, state.settings);
  const secondDate = calculateTaskDate(second, state.settings);
  if (!firstDate && !secondDate) return first.sortOrder - second.sortOrder;
  if (!firstDate) return 1;
  if (!secondDate) return -1;
  return firstDate - secondDate || first.sortOrder - second.sortOrder;
}

function compareByRisk(first, second) {
  const riskOrder = { HIGH:0, MEDIUM:1, LOW:2 };
  return (riskOrder[first.riskLevel] ?? 9) - (riskOrder[second.riskLevel] ?? 9) || first.sortOrder - second.sortOrder;
}

function render() {
  renderDashboard(tasks, state);
  let visibleTasks = filterTasks(tasks, state, { stage:selectedStage, search, filters:activeFilters, settings:state.settings, allTasks:tasks });
  if (sort === 'due-date') visibleTasks = [...visibleTasks].sort(compareByDueDate);
  if (sort === 'risk') visibleTasks = [...visibleTasks].sort(compareByRisk);
  if (sort === 'status') visibleTasks = [...visibleTasks].sort((a, b) => Number(getTaskState(state, a.id).status === TASK_STATUS.COMPLETED) - Number(getTaskState(state, b.id).status === TASK_STATUS.COMPLETED));
  if (sort === 'category') visibleTasks = [...visibleTasks].sort((a, b) => a.category.localeCompare(b.category, 'ko'));
  renderTasks(visibleTasks, state, taskList, tasks);
  document.querySelector('#result-summary').textContent = `${visibleTasks.length}개 업무 표시 중 · 전체 ${tasks.length}개`;
}

function setStage(stage) {
  selectedStage = stage;
  document.querySelectorAll('.filter-tab').forEach(button => button.classList.toggle('active', button.dataset.stage === stage));
  render();
}

function populateSettings() {
  const settings = state.settings || DEFAULT_SETTINGS;
  settingsForm.elements.trainingName.value = settings.trainingName;
  settingsForm.elements.trainingStartDate.value = settings.trainingStartDate;
  settingsForm.elements.trainingEndDate.value = settings.trainingEndDate;
  settingsForm.elements.dueSoonDays.value = settings.dueSoonDays;
  settingsError.textContent = '';
}

function openSettings() {
  populateSettings();
  settingsPanel.hidden = false;
  settingsForm.elements.trainingName.focus();
}

function closeSettings() {
  settingsPanel.hidden = true;
  settingsError.textContent = '';
}

function syncQuickFilters() {
  document.querySelectorAll('.quick-filter').forEach(button => button.classList.toggle('active', activeFilters.has(button.dataset.filter)));
  document.querySelectorAll('[data-alert-filter]').forEach(button => button.classList.toggle('active', activeFilters.has(button.dataset.alertFilter)));
}

function toggleFilter(filter) {
  activeFilters.has(filter) ? activeFilters.delete(filter) : activeFilters.add(filter);
  syncQuickFilters();
  render();
}

function showDependencyConfirmation({ dependencies, proceed, input }) {
  pendingCompletion = { proceed, input };
  dependencyConfirmMessage.textContent = getDependencyConfirmationMessage(dependencies);
  dependencyConfirmation.hidden = false;
  document.querySelector('#dependency-confirm-proceed').focus();
}

function closeDependencyConfirmation(restore = true) {
  if (restore && pendingCompletion?.input) pendingCompletion.input.checked = false;
  pendingCompletion = null;
  dependencyConfirmation.hidden = true;
}

function focusTask(taskId) {
  selectedStage = '전체';
  search = '';
  sort = 'default';
  activeFilters.clear();
  document.querySelector('#search-input').value = '';
  document.querySelector('#sort-select').value = sort;
  document.querySelectorAll('.filter-tab').forEach(button => button.classList.toggle('active', button.dataset.stage === selectedStage));
  syncQuickFilters();
  render();
  window.setTimeout(() => {
    const card = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
    card?.scrollIntoView({ behavior:'smooth', block:'center' });
    card?.querySelector('h3')?.focus?.();
  }, 0);
}

document.querySelector('.filter-tabs').addEventListener('click', event => { const button = event.target.closest('[data-stage]'); if (button) setStage(button.dataset.stage); });
document.querySelector('#stage-progress').addEventListener('click', event => { const button = event.target.closest('[data-stage]'); if (button) setStage(button.dataset.stage); });
document.querySelector('#search-input').addEventListener('input', event => { search = event.target.value; render(); });
document.querySelector('#sort-select').addEventListener('change', event => { sort = event.target.value; render(); });
document.querySelector('.quick-filters').addEventListener('click', event => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  toggleFilter(button.dataset.filter);
});
taskList.addEventListener('click', event => handleTaskEvent(event, state, render, tasks, showDependencyConfirmation));
taskList.addEventListener('change', event => handleTaskEvent(event, state, render, tasks, showDependencyConfirmation));
taskList.addEventListener('input', event => handleTaskEvent(event, state, render, tasks, showDependencyConfirmation));
document.querySelector('#alert-summary').addEventListener('click', event => {
  const filterButton = event.target.closest('[data-alert-filter]');
  if (filterButton) toggleFilter(filterButton.dataset.alertFilter);
  const priorityButton = event.target.closest('[data-task-id]');
  if (priorityButton) focusTask(priorityButton.dataset.taskId);
});
document.querySelector('#dependency-confirm-cancel').addEventListener('click', () => { closeDependencyConfirmation(true); render(); });
document.querySelector('#dependency-confirm-close').addEventListener('click', () => { closeDependencyConfirmation(true); render(); });
document.querySelector('#dependency-confirm-proceed').addEventListener('click', () => {
  const completion = pendingCompletion;
  closeDependencyConfirmation(false);
  completion?.proceed();
});
dependencyConfirmation.addEventListener('click', event => { if (event.target === dependencyConfirmation) { closeDependencyConfirmation(true); render(); } });
document.querySelector('#settings-button').addEventListener('click', openSettings);
document.querySelector('#settings-close').addEventListener('click', closeSettings);
document.querySelector('#settings-cancel').addEventListener('click', closeSettings);
settingsForm.addEventListener('submit', event => {
  event.preventDefault();
  const formData = new FormData(settingsForm);
  const trainingStartDate = String(formData.get('trainingStartDate') || '');
  const trainingEndDate = String(formData.get('trainingEndDate') || '');
  const dueSoonDays = Number(formData.get('dueSoonDays'));
  if ((trainingStartDate && !trainingEndDate) || (!trainingStartDate && trainingEndDate)) { settingsError.textContent = '교육 시작일과 종료일을 모두 입력해 주세요.'; return; }
  if (trainingStartDate && trainingEndDate && trainingStartDate > trainingEndDate) { settingsError.textContent = '교육 종료일은 시작일보다 빠를 수 없습니다.'; return; }
  if (!Number.isInteger(dueSoonDays) || dueSoonDays < 0 || dueSoonDays > 365) { settingsError.textContent = '마감임박 기준은 0일에서 365일 사이의 정수로 입력해 주세요.'; return; }
  state.settings = saveSettings({ trainingName:String(formData.get('trainingName') || '').trim(), trainingStartDate, trainingEndDate, dueSoonDays });
  closeSettings();
  render();
});
settingsPanel.addEventListener('click', event => { if (event.target === settingsPanel) closeSettings(); });
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (!dependencyConfirmation.hidden) { closeDependencyConfirmation(true); render(); }
  else if (!settingsPanel.hidden) closeSettings();
});

initializeTasks();
