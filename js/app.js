import { CHECKLIST_STATUS, DEFAULT_SETTINGS, completeSettlement, cancelTransaction, getTaskState, loadState, saveBudgetPlans, saveChecklistState, saveHandoverNote, saveSettings, saveTransaction, TASK_STATUS } from './storage.js';
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
import { AI_MODES, analyzeGap } from './ai-adapter.js';
import { GAP_INPUT_LIMITS, findSensitivePatterns, getSourceType, validateGapSources } from './gap-analysis.js';
import { renderGapResults, renderGapSources, renderGapSummary } from './gap-ui.js';
import { filterChecklistItems, findChecklistSensitivePatterns, getChecklistItemState, getCurrentChecklistSection, loadChecklist } from './checklist.js';
import { renderChecklistError, renderChecklistGroups, renderChecklistNavigation, renderChecklistSummary } from './checklist-ui.js';
import { getHandoverSnapshot } from './handover.js';
import { buildHandoverReportHtml, getHandoverReportFilename } from './handover-export.js';

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
const gapAnalysisPanel = document.querySelector('#gap-analysis-panel');
const gapSourceInput = document.querySelector('#gap-source-input');
const gapAnalysisMode = document.querySelector('#gap-analysis-mode');
const gapResultSummary = document.querySelector('#gap-result-summary');
const gapResultList = document.querySelector('#gap-result-list');
const dashboardView = document.querySelector('#dashboard-view');
const checklistView = document.querySelector('#checklist-view');
const handoverView = document.querySelector('#handover-view');
const checklistSummary = document.querySelector('#checklist-summary');
const checklistNav = document.querySelector('#checklist-section-nav');
const checklistSearchInput = document.querySelector('#checklist-search');
const checklistGroups = document.querySelector('#checklist-groups');
const checklistValidationMessage = document.querySelector('#checklist-validation-message');
const checklistResultSummary = document.querySelector('#checklist-result-summary');
let pendingCompletion = null;
let pendingBackup = null;
let adminSession = null;
let gapSources = [];
let gapSession = null;
let gapFilter = 'all';
let gapSourceSequence = 1;
let gapAnalysisRunning = false;
let checklistData = { items:[], groups:[], report:null };
let checklistLoadError = null;
let checklistSearch = '';
let checklistFilter = 'all';
let checklistSection = '전체';
let handoverHistoryExpanded = false;
const memoTimers = new Map();
const memoDrafts = new Map();

async function initializeTasks() {
  try {
    tasks = await loadTasks();
    budgetCategories = await loadBudgetCategories();
    adminSession = createTaskAdminSession(tasks);
    try {
      checklistData = await loadChecklist();
      checklistLoadError = null;
    } catch (error) {
      checklistLoadError = error;
      checklistData = { items:[], groups:[], report:error.report || null };
      console.error(`[업무목록.csv] ${error.report?.errors?.join(' | ') || error.message}`);
    }
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
  if (checklistView && !checklistView.hidden) renderChecklistView();
  if (handoverView && !handoverView.hidden) renderHandoverView();
}

function findChecklistItem(key) { return checklistData.items.find(item => item.key === key) || null; }

function setChecklistMessage(message = '', isError = false) {
  if (!checklistValidationMessage) return;
  checklistValidationMessage.textContent = message;
  checklistValidationMessage.classList.toggle('is-error', isError);
}

function renderChecklistView() {
  if (!checklistView) return;
  if (checklistLoadError) {
    renderChecklistSummary(checklistSummary, [], state);
    renderChecklistError(checklistGroups, checklistLoadError);
    if (checklistNav) checklistNav.innerHTML = '';
    setChecklistMessage('업무목록.csv를 불러오지 못했습니다. 원인과 행 번호를 확인해 주세요.', true);
    if (checklistResultSummary) checklistResultSummary.textContent = '체크리스트를 표시할 수 없습니다.';
    return;
  }
  const stats = renderChecklistSummary(checklistSummary, checklistData.items, state);
  const currentSection = document.querySelector('#checklist-current-section');
  if (currentSection) currentSection.textContent = `현재 진행 구간 · ${getCurrentChecklistSection(checklistData.groups, state)}`;
  renderChecklistNavigation(checklistNav, checklistData.groups, state, checklistSection);
  const filtered = filterChecklistItems(checklistData.items, state, { query:checklistSearch, filter:checklistFilter, section:checklistSection });
  renderChecklistGroups(checklistGroups, checklistData.groups, filtered, state, checklistSection);
  const expectationMessage = checklistData.report?.expectedMismatches?.length ? `기준값 확인 필요: ${checklistData.report.expectedMismatches.join(' · ')}` : `업무목록.csv 검증 PASS · ${checklistData.report?.total || 0}건 · ${checklistData.report?.sections?.length || 0}구간 · 3회 체크 ${checklistData.report?.threeCheck || 0}건`;
  setChecklistMessage(expectationMessage, Boolean(checklistData.report?.expectedMismatches?.length));
  if (checklistResultSummary) checklistResultSummary.textContent = `${filtered.length}개 업무 표시 중 · 전체 ${stats.total}개`;
}

function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character])); }

function handoverStatusLabel(status) {
  return ({
    [CHECKLIST_STATUS.NOT_STARTED]:'미착수',
    [CHECKLIST_STATUS.IN_PROGRESS]:'진행중',
    [CHECKLIST_STATUS.COMPLETED]:'완료',
    [CHECKLIST_STATUS.NOT_APPLICABLE]:'해당없음'
  })[status] || '미착수';
}

function formatHandoverDate(value) {
  if (!value) return '변경시각 없음';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '변경시각 없음' : new Intl.DateTimeFormat('ko-KR', { dateStyle:'medium', timeStyle:'short' }).format(date);
}

function renderHandoverItems(container, entries, emptyMessage = '해당 업무가 없습니다.') {
  if (!container) return;
  if (!entries.length) { container.innerHTML = `<p class="handover-empty">${escapeHtml(emptyMessage)}</p>`; return; }
  container.innerHTML = entries.map(entry => `<article class="handover-item ${entry.priority ? 'is-priority' : ''}"><div class="handover-item-copy"><span class="handover-section-label">${escapeHtml(entry.item.section)}</span><strong>${escapeHtml(entry.item.work)}</strong>${entry.reason ? `<span class="handover-reason">${escapeHtml(entry.reason)}</span>` : ''}</div><span class="handover-status handover-status-${escapeHtml(entry.status.toLowerCase())}">${escapeHtml(handoverStatusLabel(entry.status))}</span>${entry.memo ? `<p class="handover-item-memo">메모 · ${escapeHtml(entry.memo)}</p>` : ''}<span class="handover-item-time">마지막 변경 · ${escapeHtml(formatHandoverDate(entry.updatedAt))}</span></article>`).join('');
}

function renderHandoverHistory(container, entries) {
  if (!container) return;
  if (!entries.length) { container.innerHTML = '<p class="handover-empty">최근 변경 이력이 없습니다.</p>'; return; }
  container.innerHTML = entries.map(entry => `<article class="handover-history-item"><time>${escapeHtml(formatHandoverDate(entry.at))}</time><div><span class="handover-section-label">${escapeHtml(entry.section)}</span><strong>${escapeHtml(entry.work)}</strong><p>${escapeHtml(entry.change)}</p></div></article>`).join('');
}

function renderHandoverSectionBlocks(container, snapshot) {
  if (!container) return;
  container.innerHTML = snapshot.sectionProgress.map(section => `<details class="handover-section-block"><summary><strong>${escapeHtml(section.section)}</strong><span>${section.stats.complete} / ${section.stats.applicable} 완료 · ${section.stats.percent}%</span></summary><ul class="handover-status-list">${snapshot.allItems.filter(entry => entry.item.section === section.section).map(entry => `<li><span class="handover-status handover-status-${escapeHtml(entry.status.toLowerCase())}">${escapeHtml(handoverStatusLabel(entry.status))}</span><span>${escapeHtml(entry.item.work)}</span>${entry.memo ? `<small>메모 · ${escapeHtml(entry.memo)}</small>` : ''}</li>`).join('')}</ul></details>`).join('');
}

function setHandoverNoteMessage(message = '', isError = false) {
  const element = document.querySelector('#handover-note-message');
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('is-error', isError);
}

function renderHandoverView() {
  if (!handoverView) return;
  const sourceNote = document.querySelector('#handover-source-note');
  if (checklistLoadError) {
    if (sourceNote) sourceNote.textContent = '업무목록.csv를 불러오지 못해 인수인계 화면을 표시할 수 없습니다.';
    ['#handover-first-list', '#handover-next-task', '#handover-inprogress-list', '#handover-previous-list', '#handover-memo-incomplete-list', '#handover-memo-completed-list', '#handover-history-list'].forEach(selector => renderHandoverItems(document.querySelector(selector), [], '업무목록.csv 확인이 필요합니다.'));
    return;
  }
  const snapshot = getHandoverSnapshot(checklistData.items, checklistData.groups, state, { historyLimit:handoverHistoryExpanded ? 200 : 10 });
  const source = snapshot.source;
  if (sourceNote) sourceNote.textContent = `체크리스트 원본 · 업무목록.csv · ${source.rowCount}건 · ${snapshot.sectionProgress.length}구간 · key ${source.keyCount}개 · checksum ${source.checksum}`;
  const currentSection = document.querySelector('#handover-current-section');
  if (currentSection) currentSection.textContent = snapshot.currentSection;
  Object.entries(snapshot.stats).forEach(([key, value]) => { const element = document.querySelector(`[data-handover-stat="${key}"]`); if (element) element.textContent = key === 'percent' ? `${value}%` : value; });
  const progressBar = document.querySelector('#handover-progress-bar');
  if (progressBar) progressBar.style.width = `${snapshot.stats.percent}%`;
  const warning = document.querySelector('#handover-previous-warning');
  if (warning) { warning.hidden = !snapshot.previousIncomplete.length; warning.textContent = snapshot.previousIncomplete.length ? `이전 구간에 미완료 업무가 있습니다. · 이전 구간 미완료 ${snapshot.previousIncomplete.length}건` : ''; }
  renderHandoverItems(document.querySelector('#handover-first-list'), snapshot.firstItems, '우선 확인할 업무가 없습니다.');
  renderHandoverItems(document.querySelector('#handover-next-task'), snapshot.nextTask ? [snapshot.nextTask] : [], '현재 추천할 다음 업무가 없습니다.');
  renderHandoverItems(document.querySelector('#handover-inprogress-list'), snapshot.inProgress, '진행중 업무가 없습니다.');
  renderHandoverItems(document.querySelector('#handover-previous-list'), snapshot.previousIncomplete, '이전 구간 미완료 업무가 없습니다.');
  renderHandoverItems(document.querySelector('#handover-memo-incomplete-list'), snapshot.memoIncomplete, '메모가 있는 미완료 업무가 없습니다.');
  renderHandoverItems(document.querySelector('#handover-memo-completed-list'), snapshot.memoCompleted, '완료 업무의 메모가 없습니다.');
  renderHandoverHistory(document.querySelector('#handover-history-list'), snapshot.recentHistory);
  const moreButton = document.querySelector('#handover-history-more');
  if (moreButton) { moreButton.hidden = snapshot.historyCount <= 10; moreButton.textContent = handoverHistoryExpanded ? '접기' : `더 보기 (${snapshot.historyCount - 10}건)`; }
  renderHandoverSectionBlocks(document.querySelector('#handover-section-list'), snapshot);
  renderHandoverSectionBlocks(document.querySelector('#handover-full-list'), snapshot);
  const note = document.querySelector('#handover-note');
  if (note && document.activeElement !== note) note.value = snapshot.handover.note || '';
}

function showDashboard() {
  if (dashboardView) dashboardView.hidden = false;
  if (checklistView) checklistView.hidden = true;
  if (handoverView) handoverView.hidden = true;
}

function showChecklist() {
  if (dashboardView) dashboardView.hidden = true;
  if (checklistView) checklistView.hidden = false;
  if (handoverView) handoverView.hidden = true;
  renderChecklistView();
  checklistSearchInput?.focus();
}

function showHandover() {
  if (dashboardView) dashboardView.hidden = true;
  if (checklistView) checklistView.hidden = true;
  if (handoverView) handoverView.hidden = false;
  renderHandoverView();
}

function syncChecklistState() {
  const latest = loadState();
  state.checklist = latest.checklist;
  state.checklistHistory = latest.checklistHistory;
  state.handover = latest.handover;
}

function updateChecklistItemState(item, patch) {
  if (!item) return;
  saveChecklistState(item.key, patch);
  syncChecklistState();
  renderChecklistView();
  if (handoverView && !handoverView.hidden) renderHandoverView();
}

function updateChecklistCardStatus(card, status) {
  if (!card) return;
  card.className = card.className.replace(/\bchecklist-status-[^\s]+/g, '').trim();
  card.classList.add(`checklist-status-${status.toLowerCase()}`);
  const label = card.querySelector('.checklist-status-label');
  if (label) label.textContent = ({
    [CHECKLIST_STATUS.NOT_STARTED]:'미착수',
    [CHECKLIST_STATUS.IN_PROGRESS]:'진행중',
    [CHECKLIST_STATUS.COMPLETED]:'완료',
    [CHECKLIST_STATUS.NOT_APPLICABLE]:'해당없음'
  })[status] || '미착수';
}

function deriveChecklistPatch(item, checks, memo, currentStatus) {
  if (currentStatus === CHECKLIST_STATUS.NOT_APPLICABLE) return { status:currentStatus, completedAt:null, checks, memo };
  if (item.note === '3회 체크') {
    const completed = checks.length === 3 && checks.every(Boolean);
    return { status:completed ? CHECKLIST_STATUS.COMPLETED : checks.some(Boolean) || memo ? CHECKLIST_STATUS.IN_PROGRESS : CHECKLIST_STATUS.NOT_STARTED, completedAt:completed ? (state.checklist[item.key]?.completedAt || new Date().toISOString()) : null, checks, memo };
  }
  const status = currentStatus === CHECKLIST_STATUS.COMPLETED ? CHECKLIST_STATUS.COMPLETED : memo ? CHECKLIST_STATUS.IN_PROGRESS : CHECKLIST_STATUS.NOT_STARTED;
  return { status, completedAt:status === CHECKLIST_STATUS.COMPLETED ? (state.checklist[item.key]?.completedAt || new Date().toISOString()) : null, checks:[], memo };
}

function handleChecklistChange(event) {
  const action = event.target.dataset.checklistAction;
  if (!action || action === 'memo') return;
  const card = event.target.closest('[data-checklist-key]');
  const item = findChecklistItem(card?.dataset.checklistKey);
  if (!item) return;
  const current = getChecklistItemState(item, state);
  if (action === 'status-check') {
    updateChecklistItemState(item, { status:event.target.checked ? CHECKLIST_STATUS.COMPLETED : CHECKLIST_STATUS.NOT_STARTED, completedAt:event.target.checked ? new Date().toISOString() : null, checks:[], memo:current.memo });
    return;
  }
  if (action === 'detail-check') {
    const checks = [...current.checks];
    checks[Number(event.target.dataset.checklistIndex)] = Boolean(event.target.checked);
    updateChecklistItemState(item, deriveChecklistPatch(item, checks, current.memo, current.status));
  }
}

function handleChecklistClick(event) {
  const navButton = event.target.closest('[data-checklist-section]');
  if (navButton) { checklistSection = navButton.dataset.checklistSection; renderChecklistView(); return; }
  const filterButton = event.target.closest('[data-checklist-filter]');
  if (filterButton) {
    checklistFilter = filterButton.dataset.checklistFilter;
    document.querySelectorAll('[data-checklist-filter]').forEach(button => button.classList.toggle('active', button === filterButton));
    renderChecklistView();
    return;
  }
  const actionButton = event.target.closest('[data-checklist-action="toggle-na"]');
  if (!actionButton) return;
  const card = actionButton.closest('[data-checklist-key]');
  const item = findChecklistItem(card?.dataset.checklistKey);
  if (!item) return;
  const current = getChecklistItemState(item, state);
  if (current.status === CHECKLIST_STATUS.NOT_APPLICABLE) {
    updateChecklistItemState(item, deriveChecklistPatch(item, current.checks, current.memo, CHECKLIST_STATUS.NOT_STARTED));
  } else {
    updateChecklistItemState(item, { status:CHECKLIST_STATUS.NOT_APPLICABLE, completedAt:null, checks:current.checks, memo:current.memo });
  }
}

function handleChecklistInput(event) {
  if (event.target.dataset.checklistAction !== 'memo') return;
  const card = event.target.closest('[data-checklist-key]');
  const item = findChecklistItem(card?.dataset.checklistKey);
  if (!item) return;
  const sensitive = findChecklistSensitivePatterns(event.target.value);
  const timer = memoTimers.get(item.key);
  if (timer) window.clearTimeout(timer);
  if (sensitive.length) {
    memoDrafts.delete(item.key);
    setChecklistMessage(`개인정보로 보이는 내용은 저장하지 않았습니다: ${sensitive.join(', ')}`, true);
    return;
  }
  memoDrafts.set(item.key, event.target.value);
  const current = getChecklistItemState(item, state);
  const patch = deriveChecklistPatch(item, current.checks, event.target.value, current.status);
  updateChecklistCardStatus(card, patch.status);
  renderChecklistSummary(checklistSummary, checklistData.items, state);
  memoTimers.set(item.key, window.setTimeout(() => {
    memoTimers.delete(item.key);
    flushChecklistMemo(item, false);
  }, 450));
}

function flushChecklistMemo(item, renderAfterSave = true) {
  if (!item || !memoDrafts.has(item.key)) return;
  const timer = memoTimers.get(item.key);
  if (timer) window.clearTimeout(timer);
  memoTimers.delete(item.key);
  const memo = memoDrafts.get(item.key);
  memoDrafts.delete(item.key);
  const sensitive = findChecklistSensitivePatterns(memo);
  if (sensitive.length) { setChecklistMessage(`개인정보로 보이는 내용은 저장하지 않았습니다: ${sensitive.join(', ')}`, true); if (renderAfterSave) renderChecklistView(); return; }
  const current = getChecklistItemState(item, state);
  saveChecklistState(item.key, deriveChecklistPatch(item, current.checks, memo, current.status));
  syncChecklistState();
  if (renderAfterSave) renderChecklistView();
  else {
    renderChecklistSummary(checklistSummary, checklistData.items, state);
    if (handoverView && !handoverView.hidden) renderHandoverView();
  }
}

function handleChecklistBlur(event) {
  if (event.target.dataset.checklistAction !== 'memo') return;
  const card = event.target.closest('[data-checklist-key]');
  const item = findChecklistItem(card?.dataset.checklistKey);
  flushChecklistMemo(item, true);
}

function handleHandoverNoteInput(event) {
  if (event.target.id !== 'handover-note') return;
  const sensitive = findChecklistSensitivePatterns(event.target.value);
  setHandoverNoteMessage(sensitive.length ? `개인정보로 보이는 내용은 저장하지 않습니다: ${sensitive.join(', ')}` : '저장 버튼을 누르면 브라우저에 저장됩니다.', Boolean(sensitive.length));
}

function saveHandoverNoteFromForm() {
  const note = document.querySelector('#handover-note');
  if (!note) return;
  const sensitive = findChecklistSensitivePatterns(note.value);
  if (sensitive.length) { setHandoverNoteMessage(`개인정보로 보이는 내용은 저장하지 않았습니다: ${sensitive.join(', ')}`, true); return; }
  saveHandoverNote(note.value);
  syncChecklistState();
  renderHandoverView();
  setHandoverNoteMessage('종합 인수인계 메모를 저장했습니다.');
}

function exportHandoverReport() {
  const exportMessage = document.querySelector('#handover-export-message');
  if (checklistLoadError || !checklistData.items.length) {
    if (exportMessage) exportMessage.textContent = '업무목록.csv를 확인한 뒤 보고서를 만들 수 있습니다.';
    return;
  }
  const html = buildHandoverReportHtml(checklistData.items, checklistData.groups, state, new Date());
  const filename = getHandoverReportFilename(new Date());
  const downloaded = downloadTextFile(html, filename, 'text/html;charset=utf-8');
  if (exportMessage) { exportMessage.textContent = downloaded ? `인수인계 보고서를 만들었습니다. ${filename}` : '현재 환경에서는 파일 다운로드를 실행할 수 없습니다.'; exportMessage.classList.toggle('is-error', !downloaded); }
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
  document.querySelector('#preview-checklist-count').textContent = `${preview.checklistCount || 0}건`;
  document.querySelector('#preview-checklist-completed-count').textContent = `${preview.checklistCompletedCount || 0}건`;
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
  clearAdminAiReference();
  renderTaskAdminView();
  taskAdminPanel.hidden = false;
  document.querySelector('#admin-search').focus();
}

function closeTaskAdmin() {
  taskAdminPanel.hidden = true;
  if (adminSession) cancelAdminEdit(adminSession);
  clearAdminAiReference();
}

function clearAdminAiReference() {
  const reference = document.querySelector('#admin-ai-reference');
  if (!reference) return;
  reference.hidden = true;
  const content = reference.querySelector('p');
  if (content) content.textContent = '';
}

function setAdminAiReference(result, mode = '신규업무 후보') {
  const reference = document.querySelector('#admin-ai-reference');
  if (!reference) return;
  reference.hidden = false;
  reference.querySelector('strong').textContent = `AI 누락점검 참고 · ${mode}`;
  reference.querySelector('p').textContent = `${result.source?.filename || '분석자료'}: ${result.source?.excerpt || result.candidate}\n${result.reason || ''}\nAI 제안은 참고용이며 저장 전 업무 정의를 담당자가 확인해야 합니다.`;
}

function openTaskAdminFromGap(result, taskId = null) {
  if (!adminSession) adminSession = createTaskAdminSession(tasks);
  const existingTaskId = taskId && tasks.some(task => task.id === taskId) ? taskId : null;
  if (existingTaskId) {
    startAdminEdit(adminSession, existingTaskId);
  } else {
    startAdminEdit(adminSession, null, '사전준비');
    adminSession.draft.title = result.candidate;
    adminSession.draft.description = result.candidate;
    adminSession.draft.handover.caution = `분석자료 근거: ${result.source?.excerpt || ''}`.trim();
    adminSession.draft.tags = Array.isArray(result.suggestedTags) ? result.suggestedTags : [];
  }
  showTaskAdminMessage(existingTaskId ? '기존 업무를 AI 누락점검 참고와 함께 열었습니다. 원본은 자동 변경되지 않습니다.' : '신규업무 후보를 편집 화면으로 전달했습니다. 단계·일정·필수여부·담당·완료기준·dependency를 확인해 주세요.');
  gapAnalysisPanel.hidden = true;
  renderTaskAdminView();
  taskAdminPanel.hidden = false;
  setAdminAiReference(result, existingTaskId ? '기존업무 보강 후보' : '신규업무 후보');
  document.querySelector('#task-admin-title')?.scrollIntoView({ block:'nearest' });
}

function setGapMessage(message = '', isError = false) {
  const element = document.querySelector('#gap-analysis-message');
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('is-error', isError);
}

function renderGapView() {
  const results = gapSession?.results || [];
  document.querySelector('#gap-master-count').textContent = `${tasks.length}개 업무`;
  document.querySelector('#gap-source-count').textContent = `${gapSources.length}개 파일`;
  document.querySelector('#gap-analysis-run').disabled = gapSources.length === 0 || gapAnalysisRunning;
  renderGapSources(document.querySelector('#gap-source-list'), gapSources, sourceId => {
    gapSources = gapSources.filter(source => source.id !== sourceId);
    gapSession = null;
    setGapMessage();
    renderGapView();
  });
  const summaryElements = {
    all:document.querySelector('#gap-count-all'),
    high:document.querySelector('#gap-count-high'),
    medium:document.querySelector('#gap-count-medium'),
    low:document.querySelector('#gap-count-low')
  };
  renderGapSummary(summaryElements, results);
  ['NEW_TASK', 'ENRICH_EXISTING', 'DUPLICATE'].forEach(type => {
    const count = results.filter(result => result.type === type).length;
    const strong = gapResultSummary.querySelector(`[data-gap-filter="${type}"] strong`);
    if (strong) strong.textContent = String(count);
  });
  gapResultSummary.querySelectorAll('[data-gap-filter]').forEach(button => button.classList.toggle('active', button.dataset.gapFilter === gapFilter));
  renderGapResults(gapResultList, results, gapFilter, {
    onAcceptNew:result => { result.status = 'ACCEPTED'; renderGapView(); openTaskAdminFromGap(result); },
    onOpenExisting:result => { result.status = 'ACCEPTED'; renderGapView(); openTaskAdminFromGap(result, result.similarTasks[0]?.taskId); },
    onIgnore:result => { result.status = 'IGNORED'; renderGapView(); }
  });
}

function openGapAnalysis() {
  renderGapView();
  gapAnalysisPanel.hidden = false;
  gapSourceInput.focus();
}

function closeGapAnalysis() { gapAnalysisPanel.hidden = true; }

async function importGapSources(event) {
  const files = [...(event.target.files || [])];
  event.target.value = '';
  if (!files.length) return;
  const unsupported = [];
  const sensitive = [];
  for (const file of files) {
    if (gapSources.length >= GAP_INPUT_LIMITS.maxFiles) { unsupported.push(`${file.name}(최대 ${GAP_INPUT_LIMITS.maxFiles}개)`); continue; }
    const type = getSourceType(file.name);
    if (!type) { unsupported.push(file.name); continue; }
    const content = await file.text();
    if (content.length > GAP_INPUT_LIMITS.maxFileChars) { unsupported.push(`${file.name}(파일이 너무 큼)`); continue; }
    const totalAfterAdd = gapSources.reduce((sum, source) => sum + source.content.length, 0) + content.length;
    if (totalAfterAdd > GAP_INPUT_LIMITS.maxTotalChars) { unsupported.push(`${file.name}(전체 용량 초과)`); continue; }
    if (findSensitivePatterns(content).length) sensitive.push(file.name);
    gapSources.push({ id:`SRC-${String(gapSourceSequence++).padStart(3, '0')}`, filename:file.name, type, content, addedAt:new Date().toISOString() });
  }
  gapSession = null;
  const messages = [];
  if (unsupported.length) messages.push(`지원하지 않는 파일은 제외했습니다: ${unsupported.join(', ')}`);
  if (sensitive.length) messages.push(`민감정보 형식이 감지된 파일이 있습니다(${sensitive.join(', ')}). AI 정밀분석으로 전송하지 않도록 먼저 내용을 정리해 주세요.`);
  setGapMessage(messages.join(' ') || '분석자료를 추가했습니다.');
  renderGapView();
}

async function runGapAnalysis() {
  if (!gapSources.length) { setGapMessage('분석자료를 먼저 추가해 주세요.', true); return; }
  if (gapAnalysisRunning) return;
  const mode = gapAnalysisMode.value || AI_MODES.LOCAL_RULE;
  if (mode === AI_MODES.REMOTE_AI) {
    const inputValidation = validateGapSources(gapSources);
    if (!inputValidation.valid) {
      const message = inputValidation.sensitivePatterns.length
        ? '개인정보 형식이 감지되어 AI로 전송하지 않았습니다. 민감정보를 제거한 뒤 다시 시도해 주세요.'
        : inputValidation.errors.join(' ');
      setGapMessage(message, true);
      return;
    }
  }
  const runButton = document.querySelector('#gap-analysis-run');
  gapAnalysisRunning = true;
  runButton.disabled = true;
  gapAnalysisMode.disabled = true;
  setGapMessage(mode === AI_MODES.REMOTE_AI ? 'AI가 업무자료와 현재 업무를 비교하고 있습니다.' : '분석자료와 현재 업무 마스터를 비교하는 중입니다.');
  renderGapView();
  try {
    const result = await analyzeGap({ sources:gapSources, tasks, mode });
    gapSession = { sessionId:`ANALYSIS-${Date.now()}`, createdAt:new Date().toISOString(), sourceCount:gapSources.length, taskCount:tasks.length, mode, results:result.results };
    setGapMessage(result.error || `분석이 완료되었습니다. ${result.results.length}건의 검토 후보가 있습니다.`, Boolean(result.error));
  } finally {
    gapAnalysisRunning = false;
    gapAnalysisMode.disabled = false;
    renderGapView();
  }
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

document.querySelector('#gap-analysis-button').addEventListener('click', openGapAnalysis);
document.querySelector('#gap-analysis-close').addEventListener('click', closeGapAnalysis);
gapAnalysisPanel.addEventListener('click', event => { if (event.target === gapAnalysisPanel) closeGapAnalysis(); });
gapSourceInput.addEventListener('change', importGapSources);
document.querySelector('#gap-analysis-run').addEventListener('click', runGapAnalysis);
gapResultSummary.addEventListener('click', event => {
  const button = event.target.closest('[data-gap-filter]');
  if (!button) return;
  gapFilter = button.dataset.gapFilter;
  renderGapView();
});
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

document.querySelector('#checklist-button').addEventListener('click', showChecklist);
document.querySelector('#handover-button').addEventListener('click', showHandover);
document.querySelector('#handover-checklist-button').addEventListener('click', showChecklist);
document.querySelector('#handover-export').addEventListener('click', exportHandoverReport);
document.querySelector('#handover-history-more').addEventListener('click', () => { handoverHistoryExpanded = !handoverHistoryExpanded; renderHandoverView(); });
document.querySelector('#handover-note-save').addEventListener('click', saveHandoverNoteFromForm);
handoverView.addEventListener('input', handleHandoverNoteInput);
document.querySelector('#dashboard-button').addEventListener('click', showDashboard);
document.querySelector('#checklist-back').addEventListener('click', showDashboard);
checklistNav.addEventListener('click', handleChecklistClick);
document.querySelector('.checklist-filters').addEventListener('click', handleChecklistClick);
checklistSearchInput.addEventListener('input', event => { checklistSearch = event.target.value; renderChecklistView(); });
checklistGroups.addEventListener('click', handleChecklistClick);
checklistGroups.addEventListener('change', handleChecklistChange);
checklistGroups.addEventListener('input', handleChecklistInput);
checklistGroups.addEventListener('focusout', handleChecklistBlur);

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
document.querySelector('#budget-menu-button').addEventListener('click', openBudgetPanel);
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
  else if (!gapAnalysisPanel.hidden) closeGapAnalysis();
  else if (!taskAdminPanel.hidden) closeTaskAdmin();
  else if (!dataPanel.hidden) closeDataPanel();
  else if (!settingsPanel.hidden) closeSettings();
  else if (!document.querySelector('#budget-panel').hidden) closeBudgetPanel();
});

initializeTasks();
