import { loadState } from './storage.js';
import { STAGES, renderDashboard } from './dashboard.js';
import { filterTasks, handleTaskEvent, isTaskUrgent, renderTasks } from './tasks.js';

const state = loadState();
let tasks = [];
let selectedStage = '전체';
let search = '';
let sort = 'default';
const activeFilters = new Set();
const taskList = document.querySelector('#task-list');

async function loadTasks() {
  try {
    const response = await fetch('./data/tasks.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    tasks = await response.json();
    render();
  } catch (error) {
    taskList.innerHTML = '<div class="empty-state">업무 데이터를 불러오지 못했습니다.<br /><small>README.md의 로컬 서버 실행 방법을 확인해 주세요.</small></div>';
    document.querySelector('#result-summary').textContent = '데이터 로드 오류';
    console.error(error);
  }
}

function render() {
  renderDashboard(tasks, state);
  let visibleTasks = filterTasks(tasks, state, { stage:selectedStage, search, filters:activeFilters });
  if (sort === 'status') visibleTasks = [...visibleTasks].sort((a, b) => Number(Boolean(state[a.id]?.completed)) - Number(Boolean(state[b.id]?.completed)));
  if (sort === 'category') visibleTasks = [...visibleTasks].sort((a, b) => a.category.localeCompare(b.category, 'ko'));
  renderTasks(visibleTasks, state, taskList);
  document.querySelector('#result-summary').textContent = `${visibleTasks.length}개 업무 표시 중 · 전체 ${tasks.length}개`;
}

function setStage(stage) {
  selectedStage = stage;
  document.querySelectorAll('.filter-tab').forEach(button => button.classList.toggle('active', button.dataset.stage === stage));
  render();
}

document.querySelector('.filter-tabs').addEventListener('click', event => { const button = event.target.closest('[data-stage]'); if (button) setStage(button.dataset.stage); });
document.querySelector('#stage-progress').addEventListener('click', event => { const button = event.target.closest('[data-stage]'); if (button) setStage(button.dataset.stage); });
document.querySelector('#search-input').addEventListener('input', event => { search = event.target.value; render(); });
document.querySelector('#sort-select').addEventListener('change', event => { sort = event.target.value; render(); });
document.querySelector('.quick-filters').addEventListener('click', event => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  const filter = button.dataset.filter;
  activeFilters.has(filter) ? activeFilters.delete(filter) : activeFilters.add(filter);
  button.classList.toggle('active', activeFilters.has(filter));
  render();
});
taskList.addEventListener('click', event => handleTaskEvent(event, state, render));
taskList.addEventListener('change', event => handleTaskEvent(event, state, render));
taskList.addEventListener('input', event => handleTaskEvent(event, state, render));

loadTasks();
