import { DEFAULT_SETTINGS, completeSettlement, cancelTransaction, getTaskState, loadState, saveBudgetPlans, saveSettings, saveTransaction, TASK_STATUS } from './storage.js';
import { renderDashboard } from './dashboard.js';
import { calculateTaskDate } from './schedule.js';
import { filterTasks, handleTaskEvent, loadTasks, renderTasks } from './tasks.js';
import { getDependencyConfirmationMessage } from './alerts.js';
import { createTransactionId, loadBudgetCategories, validateTransaction } from './budget.js';
import { renderBudgetPanel } from './budget-view.js';
import { exportBackup, getLastBackupDate, previewBackup, readBackupFile, resetAllUserData, restoreBackup } from './backup.js';
import { downloadTextFile, getDateFilename, tasksToCsv } from './csv.js';
import { buildCsvImportPreview, cancelAdminEdit, commitAdminEdit, createTaskAdminSession, getTimingLabel, readTaskAdminForm, renderDependencyOptions, renderTaskAdmin, removeAdminTask, sortAdminTasks, startAdminEdit, suggestNextTaskId } from './task-admin.js';
import { getDataSummary } from './data-quality.js';

const state = loadState();
let tasks = [];
let budgetCategories = [];
let selectedStage = '전체';
let search = '';
let sort = 'default';
const activeFilters = new Set();
const taskList = document.querySelector('#task-list');
const settingsPanel = document.querySelector('#settings-panel');
const settingsForm = document.querySelector('#settings-form');
const settingsError = document.querySelector('#settings-error');
const dataPanel = document.querySelector('#data-panel');
const backupPreviewPanel = document.querySelector('#backup-preview-panel');
const resetConfirmation = document.querySelector('#reset-confirmation');
const backupFileInput = document.querySelector('#backup-file-input');
const dependencyConfirmation = document.querySelector('#dependency-confirmation');
const dependencyConfirmMessage = document.querySelector('#dependency-confirm-message');
const taskAdminPanel = document.querySelector('#task-admin-panel');
const taskAdminForm = document.querySelector('#task-admin-form');
const taskCsvInput = document.querySelector('#task-csv-input');
let pendingCompletion = null;
let pendingBackup = null;
let adminSession = null;

async function initializeTasks() {
  try {
    tasks = await loadTasks();
    budgetCategories = await loadBudgetCategories();
    adminSession = createTaskAdminSession(tasks);
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
  const operationalTasks = tasks.filter(task => task.active !== false);
  renderDashboard(operationalTasks, state, budgetCategories);
  let visibleTasks = filterTasks(operationalTasks, state, { stage:selectedStage, search, filters:activeFilters, settings:state.settings, allTasks:operationalTasks });
  if (sort === 'due-date') visibleTasks = [...visibleTasks].sort(compareByDueDate);
  if (sort === 'risk') visibleTasks = [...visibleTasks].sort(compareByRisk);
  if (sort === 'status') visibleTasks = [...visibleTasks].sort((a, b) => Number(getTaskState(state, a.id).status === TASK_STATUS.COMPLETED) - Number(getTaskState(state, b.id).status === TASK_STATUS.COMPLETED));
  if (sort === 'category') visibleTasks = [...visibleTasks].sort((a, b) => a.category.localeCompare(b.category, 'ko'));
  renderTasks(visibleTasks, state, taskList, operationalTasks, budgetCategories);
  renderBudgetPanel(state, budgetCategories, operationalTasks);
  document.querySelector('#result-summary').textContent = `${visibleTasks.length}개 업무 표시 중 · 전체 ${operationalTasks.length}개`;
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

function formatBackupDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '최근 백업 없음';
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function showDataMessage(message = '', isError = false) {
  const element = document.querySelector('#data-message');
  element.textContent = message;
  element.classList.toggle('is-error', isError);
}

function renderDataPanel() {
  const lastBackup = getLastBackupDate();
  document.querySelector('#data-last-backup').textContent = formatBackupDate(lastBackup);
  const stale = !lastBackup || Number.isNaN(new Date(lastBackup).getTime()) || Date.now() - new Date(lastBackup).getTime() > 30 * 24 * 60 * 60 * 1000;
  document.querySelector('#backup-recommendation').hidden = !stale;
}

function openDataPanel() {
  renderDataPanel();
  dataPanel.hidden = false;
  document.querySelector('#backup-export').focus();
}

function closeDataPanel() {
  dataPanel.hidden = true;
  showDataMessage();
}

function closeBackupPreview() {
  pendingBackup = null;
  backupPreviewPanel.hidden = true;
}

function closeResetConfirmation() { resetConfirmation.hidden = true; }

function renderBackupPreview(preview) {
  document.querySelector('#preview-exported-at').textContent = preview.exportedAtLabel || '확인할 수 없음';
  document.querySelector('#preview-training-name').textContent = preview.trainingName;
  document.querySelector('#preview-task-count').textContent = `${preview.taskCount}건`;
  document.querySelector('#preview-completed-count').textContent = `${preview.completedCount}건`;
  document.querySelector('#preview-category-count').textContent = `${preview.categoryCount}개`;
  document.querySelector('#preview-transaction-count').textContent = `${preview.transactionCount}건`;
  document.querySelector('#backup-preview-warning').textContent = preview.warnings.join(' ');
  backupPreviewPanel.hidden = false;
  document.querySelector('#backup-preview-restore').focus();
}

async function handleBackupFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  const result = await readBackupFile(file);
  if (!result.ok) { openDataPanel(); showDataMessage(result.error, true); return; }
  const preview = previewBackup(result.backup, tasks);
  if (!preview.valid) { openDataPanel(); showDataMessage(preview.errors.join(' '), true); return; }
  pendingBackup = result.backup;
  closeDataPanel();
  renderBackupPreview(preview);
}

function replaceAppState(nextState) {
  Object.keys(state).forEach(key => delete state[key]);
  Object.assign(state, nextState);
}

function restorePendingBackup() {
  if (!pendingBackup) return;
  const result = restoreBackup(pendingBackup, tasks);
  if (!result.success) {
    closeBackupPreview();
    openDataPanel();
    showDataMessage(result.errors.join(' '), true);
    return;
  }
  replaceAppState(result.state);
  const warning = result.unknownTaskIds.length ? ` 찾을 수 없는 업무상태 ${result.unknownTaskIds.length}건은 제외했습니다.` : '';
  closeBackupPreview();
  render();
  openDataPanel();
  showDataMessage(`운영데이터를 가져왔습니다.${warning}`);
}

function resetUserData() {
  replaceAppState(resetAllUserData());
  closeResetConfirmation();
  render();
  openDataPanel();
  showDataMessage('모든 운영데이터를 초기화했습니다. 백업을 권장합니다.');
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

function getTodayInputDate() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function populateBudgetOptions() {
  const categorySelect = document.querySelector('#transaction-category');
  const taskSelect = document.querySelector('#transaction-task');
  const operationalTasks = tasks.filter(task => task.active !== false);
  const categoryValue = categorySelect.value;
  const taskValue = taskSelect.value;
  categorySelect.innerHTML = budgetCategories.map(category => `<option value="${category.id}">${category.name}</option>`).join('');
  taskSelect.innerHTML = '<option value="">관련 업무 없음</option>' + operationalTasks.map(task => `<option value="${task.id}">${task.id} ${task.title}</option>`).join('');
  if (budgetCategories.some(category => category.id === categoryValue)) categorySelect.value = categoryValue;
  if (operationalTasks.some(task => task.id === taskValue)) taskSelect.value = taskValue;
}

function openBudgetPanel() {
  populateBudgetOptions();
  resetTransactionForm();
  document.querySelector('#budget-panel').hidden = false;
  document.querySelector('#transaction-description').focus();
}

function closeBudgetPanel() {
  document.querySelector('#budget-panel').hidden = true;
  resetTransactionForm();
}

function resetTransactionForm() {
  const form = document.querySelector('#transaction-form');
  form.reset();
  form.elements.editId.value = '';
  form.elements.date.value = getTodayInputDate();
  form.elements.status.value = 'PLANNED';
  form.elements.settlementStatus.value = 'NOT_REQUIRED';
  document.querySelector('#transaction-form-error').textContent = '';
  document.querySelector('#transaction-cancel-edit').hidden = true;
}

function editTransaction(transactionId) {
  const transaction = state.budget.transactions.find(item => item.id === transactionId);
  if (!transaction) return;
  populateBudgetOptions();
  const form = document.querySelector('#transaction-form');
  form.elements.editId.value = transaction.id;
  form.elements.categoryId.value = transaction.categoryId;
  form.elements.amount.value = transaction.amount;
  form.elements.status.value = transaction.status;
  form.elements.date.value = transaction.date;
  form.elements.description.value = transaction.description;
  form.elements.taskId.value = transaction.taskId;
  form.elements.settlementStatus.value = transaction.settlementStatus;
  form.elements.memo.value = transaction.memo;
  document.querySelector('#transaction-cancel-edit').hidden = false;
  form.scrollIntoView({ behavior:'smooth', block:'start' });
}

function savePlanForm(event) {
  event.preventDefault();
  const error = document.querySelector('#budget-plan-error');
  const plans = {};
  const invalid = [...event.currentTarget.querySelectorAll('[data-plan-category]')].some(input => {
    const rawAmount = input.value.trim();
    const amount = Number(rawAmount);
    plans[input.dataset.planCategory] = amount;
    return rawAmount === '' || !Number.isInteger(amount) || amount < 0;
  });
  if (invalid) { error.textContent = '계획예산은 0 이상의 정수로 입력해 주세요.'; return; }
  state.budget = saveBudgetPlans(plans);
  error.textContent = '';
  render();
}

function saveTransactionForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const editId = String(formData.get('editId') || '');
  const existing = state.budget.transactions.find(transaction => transaction.id === editId);
  const transaction = {
    id:editId || createTransactionId(state.budget.transactions),
    categoryId:String(formData.get('categoryId') || ''),
    amount:Number(formData.get('amount')),
    status:String(formData.get('status') || ''),
    date:String(formData.get('date') || ''),
    description:String(formData.get('description') || '').trim(),
    taskId:String(formData.get('taskId') || ''),
    settlementStatus:String(formData.get('settlementStatus') || ''),
    memo:String(formData.get('memo') || '').trim(),
    createdAt:existing?.createdAt
  };
  const validation = validateTransaction(transaction, budgetCategories, tasks);
  const error = document.querySelector('#transaction-form-error');
  if (!validation.valid) { error.textContent = validation.errors.join(' '); return; }
  saveTransaction(transaction);
  state.budget = loadState().budget;
  resetTransactionForm();
  render();
}

function showTaskAdminMessage(message = '', isError = false) {
  if (!adminSession) return;
  adminSession.message = message;
  adminSession.messageIsError = isError;
}

function renderTaskAdminView() {
  if (!adminSession) return;
  renderTaskAdmin(adminSession);
  if (taskAdminForm) renderDependencyOptions(taskAdminForm, adminSession.tasks);
}

function openTaskAdmin() {
  if (!adminSession) adminSession = createTaskAdminSession(tasks);
  renderTaskAdminView();
  taskAdminPanel.hidden = false;
  document.querySelector('#admin-search').focus();
}

function closeTaskAdmin() {
  taskAdminPanel.hidden = true;
  if (adminSession) cancelAdminEdit(adminSession);
}

function setAdminFormError(message = '') {
  const error = document.querySelector('#task-admin-form-error');
  if (error) error.textContent = message;
}

function readAdminDraft() {
  if (!adminSession || !taskAdminForm) return null;
  adminSession.draft = readTaskAdminForm(taskAdminForm);
  return adminSession.draft;
}

function updateAdminTimingLabel() {
  if (!taskAdminForm) return;
  const type = taskAdminForm.elements.namedItem('timingType')?.value;
  const value = taskAdminForm.elements.namedItem('timingValue')?.value;
  const label = taskAdminForm.elements.namedItem('timingLabel');
  if (label && type !== 'MANUAL') label.value = getTimingLabel(type, value);
}

function addAdminCriteria() {
  const draft = readAdminDraft();
  draft.completionCriteria.push('');
  renderTaskAdminView();
}

function removeAdminCriteria(button) {
  const draft = readAdminDraft();
  const row = button.closest('.admin-array-row');
  const index = [...taskAdminForm.querySelectorAll('[data-criteria-input]')].indexOf(row?.querySelector('[data-criteria-input]'));
  if (index >= 0) draft.completionCriteria.splice(index, 1);
  renderTaskAdminView();
}

function addAdminDocument() {
  const draft = readAdminDraft();
  draft.documents.push({ name:'', required:true });
  renderTaskAdminView();
}

function removeAdminDocument(button) {
  const draft = readAdminDraft();
  const row = button.closest('.admin-document-row');
  const index = [...taskAdminForm.querySelectorAll('[data-document-name]')].indexOf(row?.querySelector('[data-document-name]'));
  if (index >= 0) draft.documents.splice(index, 1);
  renderTaskAdminView();
}

function addAdminDependency() {
  const draft = readAdminDraft();
  const selected = taskAdminForm.querySelector('#admin-dependency-select')?.value;
  if (!selected || selected === draft.id || draft.dependencies.includes(selected)) return;
  draft.dependencies.push(selected);
  renderTaskAdminView();
}

function removeAdminDependency(button) {
  const draft = readAdminDraft();
  const id = button.closest('[data-dependency-id]')?.dataset.dependencyId;
  draft.dependencies = draft.dependencies.filter(dependency => dependency !== id);
  renderTaskAdminView();
}

function saveAdminTask(event) {
  event.preventDefault();
  if (!adminSession || !taskAdminForm) return;
  if (!taskAdminForm.checkValidity()) { taskAdminForm.reportValidity(); return; }
  const draft = readAdminDraft();
  const originalId = adminSession.draftOriginalId || null;
  if (originalId && originalId !== draft.id && !window.confirm(`업무 ID를 ${originalId}에서 ${draft.id}(으)로 변경하시겠습니까?\n완료상태·메모는 ID 기준으로 연결되므로 변경 후 상태 확인이 필요합니다.`)) return;
  const result = commitAdminEdit(adminSession, draft, originalId);
  if (!result.success) { setAdminFormError(result.errors.join(' ')); showTaskAdminMessage(result.errors.join(' '), true); renderTaskAdminView(); return; }
  setAdminFormError();
  showTaskAdminMessage('편집 세션에 저장했습니다. 기준 파일은 변경되지 않았습니다.');
  renderTaskAdminView();
}

function deleteAdminTask() {
  if (!adminSession) return;
  const taskId = adminSession.draftOriginalId || adminSession.selectedTaskId;
  if (!taskId) return;
  const result = removeAdminTask(adminSession.tasks, taskId);
  if (!result.success) {
    const references = result.references.map(task => `${task.id} ${task.title}`).join(', ');
    showTaskAdminMessage(`${result.errors[0]} 참조 업무: ${references}`, true);
    renderTaskAdminView();
    return;
  }
  if (!window.confirm(`${taskId} 업무를 후보 목록에서 삭제하시겠습니까?\n운영 중인 업무는 먼저 비활성화하는 방법을 권장합니다.`)) return;
  adminSession.tasks = result.tasks;
  adminSession.selectedTaskId = adminSession.tasks[0]?.id || null;
  cancelAdminEdit(adminSession);
  showTaskAdminMessage(`${taskId} 업무를 편집 세션에서 삭제했습니다.`);
  renderTaskAdminView();
}

function exportAdminCsv() {
  if (!adminSession) return;
  const content = tasksToCsv(sortAdminTasks(adminSession.tasks));
  const filename = getDateFilename('reporter-training-tasks', 'csv');
  const downloaded = downloadTextFile(content, filename, 'text/csv;charset=utf-8');
  showTaskAdminMessage(downloaded ? `CSV 후보 파일을 내보냈습니다. ${filename}` : '현재 환경에서는 파일 다운로드를 실행할 수 없습니다.', !downloaded);
  renderTaskAdminView();
}

function exportAdminJson() {
  if (!adminSession) return;
  const summary = getDataSummary(adminSession.tasks);
  if (!summary.validation.valid) { showTaskAdminMessage('검증 오류를 먼저 수정해야 JSON을 내보낼 수 있습니다.', true); renderTaskAdminView(); return; }
  const filename = getDateFilename('reporter-training-tasks', 'json');
  const downloaded = downloadTextFile(`${JSON.stringify(sortAdminTasks(adminSession.tasks), null, 2)}\n`, filename, 'application/json;charset=utf-8');
  showTaskAdminMessage(downloaded ? `검증을 통과한 후보 JSON을 내보냈습니다. ${filename}` : '현재 환경에서는 파일 다운로드를 실행할 수 없습니다.', !downloaded);
  renderTaskAdminView();
}

async function importAdminCsv(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file || !adminSession) return;
  try {
    adminSession.importPreview = buildCsvImportPreview(await file.text());
    showTaskAdminMessage(`CSV ${adminSession.importPreview.rows.length}건을 미리보기로 불러왔습니다.`);
  } catch (error) {
    adminSession.importPreview = null;
    showTaskAdminMessage(`CSV 파일을 읽을 수 없습니다: ${error.message}`, true);
  }
  renderTaskAdminView();
}

function applyAdminCsv() {
  if (!adminSession?.importPreview?.validTasks.length) return;
  adminSession.tasks = adminSession.importPreview.validTasks.map(task => JSON.parse(JSON.stringify(task)));
  adminSession.selectedTaskId = adminSession.tasks[0]?.id || null;
  adminSession.importPreview = null;
  cancelAdminEdit(adminSession);
  showTaskAdminMessage('정상 CSV 행을 편집 세션에 가져왔습니다. 운영화면과 기준 파일은 변경되지 않았습니다.');
  renderTaskAdminView();
}

function handleTaskAdminAction(event) {
  const button = event.target.closest('[data-admin-action]');
  if (!button) return;
  const action = button.dataset.adminAction;
  if (action === 'select-task') { if (!adminSession.draft) { adminSession.selectedTaskId = button.dataset.adminTaskId; renderTaskAdminView(); } return; }
  if (action === 'new-task') { startAdminEdit(adminSession, null, document.querySelector('#admin-phase-filter').value === '전체' ? '사전준비' : document.querySelector('#admin-phase-filter').value); setAdminFormError(); renderTaskAdminView(); return; }
  if (action === 'edit-selected') { if (adminSession.selectedTaskId) { startAdminEdit(adminSession, adminSession.selectedTaskId); setAdminFormError(); renderTaskAdminView(); } return; }
  if (action === 'suggest-id') { const phase = taskAdminForm.elements.namedItem('phase').value; taskAdminForm.elements.namedItem('id').value = suggestNextTaskId(adminSession.tasks, phase); return; }
  if (action === 'add-criteria') { addAdminCriteria(); return; }
  if (action === 'remove-criteria') { removeAdminCriteria(button); return; }
  if (action === 'add-document') { addAdminDocument(); return; }
  if (action === 'remove-document') { removeAdminDocument(button); return; }
  if (action === 'add-dependency') { addAdminDependency(); return; }
  if (action === 'remove-dependency') { removeAdminDependency(button); return; }
  if (action === 'cancel-edit') { cancelAdminEdit(adminSession); setAdminFormError(); renderTaskAdminView(); return; }
  if (action === 'delete-selected') { deleteAdminTask(); return; }
  if (action === 'export-csv') { exportAdminCsv(); return; }
  if (action === 'export-json') { exportAdminJson(); return; }
  if (action === 'import-csv') { taskCsvInput.click(); return; }
  if (action === 'cancel-csv') { adminSession.importPreview = null; renderTaskAdminView(); return; }
  if (action === 'apply-csv') { applyAdminCsv(); return; }
  if (action === 'validate') { showTaskAdminMessage('현재 편집 세션을 다시 검증했습니다.'); renderTaskAdminView(); }
}

document.querySelector('#task-admin-button').addEventListener('click', openTaskAdmin);
document.querySelector('#task-admin-close').addEventListener('click', closeTaskAdmin);
taskAdminPanel.addEventListener('click', event => {
  if (event.target === taskAdminPanel) { closeTaskAdmin(); return; }
  handleTaskAdminAction(event);
});
taskAdminPanel.addEventListener('input', event => {
  if (!adminSession) return;
  if (event.target.id === 'admin-search') { adminSession.query = event.target.value; renderTaskAdminView(); return; }
  if (event.target.id === 'admin-dependency-search') renderDependencyOptions(taskAdminForm, adminSession.tasks);
});
taskAdminPanel.addEventListener('change', event => {
  if (!adminSession) return;
  if (event.target.id === 'admin-phase-filter') { adminSession.phaseFilter = event.target.value; renderTaskAdminView(); return; }
  if (event.target.id === 'admin-show-inactive') { adminSession.showInactive = event.target.checked; renderTaskAdminView(); return; }
  if (event.target.name === 'timingType' || event.target.name === 'timingValue') updateAdminTimingLabel();
});
taskAdminForm.addEventListener('submit', saveAdminTask);
taskCsvInput.addEventListener('change', importAdminCsv);

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
document.querySelector('#data-button').addEventListener('click', openDataPanel);
document.querySelector('#data-close').addEventListener('click', closeDataPanel);
dataPanel.addEventListener('click', event => { if (event.target === dataPanel) closeDataPanel(); });
document.querySelector('#backup-export').addEventListener('click', () => {
  const result = exportBackup(state);
  renderDataPanel();
  showDataMessage(`운영데이터 백업이 완료되었습니다. ${result.filename}`);
});
document.querySelector('#backup-import').addEventListener('click', () => backupFileInput.click());
backupFileInput.addEventListener('change', handleBackupFile);
document.querySelector('#data-reset').addEventListener('click', () => {
  closeDataPanel();
  resetConfirmation.hidden = false;
  document.querySelector('#reset-confirm').focus();
});
document.querySelector('#backup-preview-close').addEventListener('click', closeBackupPreview);
document.querySelector('#backup-preview-cancel').addEventListener('click', closeBackupPreview);
document.querySelector('#backup-preview-restore').addEventListener('click', restorePendingBackup);
backupPreviewPanel.addEventListener('click', event => { if (event.target === backupPreviewPanel) closeBackupPreview(); });
document.querySelector('#reset-close').addEventListener('click', closeResetConfirmation);
document.querySelector('#reset-cancel').addEventListener('click', closeResetConfirmation);
document.querySelector('#reset-confirm').addEventListener('click', resetUserData);
resetConfirmation.addEventListener('click', event => { if (event.target === resetConfirmation) closeResetConfirmation(); });
document.querySelector('#budget-button').addEventListener('click', openBudgetPanel);
document.querySelector('#budget-close').addEventListener('click', closeBudgetPanel);
document.querySelector('#budget-panel').addEventListener('click', event => {
  if (event.target.id === 'budget-panel') { closeBudgetPanel(); return; }
  const actionButton = event.target.closest('[data-budget-action]');
  if (!actionButton) return;
  const transactionId = actionButton.dataset.transactionId;
  if (actionButton.dataset.budgetAction === 'edit') editTransaction(transactionId);
  if (actionButton.dataset.budgetAction === 'cancel') { cancelTransaction(transactionId); state.budget = loadState().budget; render(); }
  if (actionButton.dataset.budgetAction === 'settle') { completeSettlement(transactionId); state.budget = loadState().budget; render(); }
});
document.querySelector('#budget-plan-form').addEventListener('submit', savePlanForm);
document.querySelector('#transaction-form').addEventListener('submit', saveTransactionForm);
document.querySelector('#transaction-cancel-edit').addEventListener('click', resetTransactionForm);
settingsPanel.addEventListener('click', event => { if (event.target === settingsPanel) closeSettings(); });
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (!dependencyConfirmation.hidden) { closeDependencyConfirmation(true); render(); }
  else if (!resetConfirmation.hidden) closeResetConfirmation();
  else if (!backupPreviewPanel.hidden) closeBackupPreview();
  else if (!taskAdminPanel.hidden) closeTaskAdmin();
  else if (!dataPanel.hidden) closeDataPanel();
  else if (!settingsPanel.hidden) closeSettings();
  else if (!document.querySelector('#budget-panel').hidden) closeBudgetPanel();
});

initializeTasks();
