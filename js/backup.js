import { PROJECT_ID, STORAGE_VERSION, loadState, replaceState, resetState } from './storage.js';

export const BACKUP_VERSION = 1;
export const APPLICATION_VERSION = '0.10';
export const LAST_BACKUP_KEY = 'reporter-training-ops-last-backup-v1';

const TRANSACTION_STATUSES = ['PLANNED', 'COMMITTED', 'PAID', 'CANCELLED'];
const SETTLEMENT_STATUSES = ['NOT_REQUIRED', 'PENDING', 'COMPLETED'];
const CHECKLIST_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NOT_APPLICABLE'];
const SENSITIVE_KEY_PATTERN = /resident|registration|account|phone|address|email|주민|계좌|전화|주소|이메일/i;

function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
function isSensitiveKey(key) { return SENSITIVE_KEY_PATTERN.test(key); }
function containsSensitiveKey(value) {
  if (Array.isArray(value)) return value.some(containsSensitiveKey);
  if (!isObject(value)) return false;
  return Object.entries(value).some(([key, child]) => isSensitiveKey(key) || containsSensitiveKey(child));
}
function isCompletedTaskState(value) { return value?.status === 'COMPLETED' || value?.completed === true; }
function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ko-KR', { dateStyle:'medium', timeStyle:'short' }).format(date);
}

export function createBackup(state = loadState(), exportedAt = new Date()) {
  return {
    backupVersion: BACKUP_VERSION,
    application: PROJECT_ID,
    applicationVersion: APPLICATION_VERSION,
    exportedAt: exportedAt.toISOString(),
    data: clone(state)
  };
}

export function generateBackupFilename(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  const pad = number => String(number).padStart(2, '0');
  return `reporter-training-backup-${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}-${pad(value.getHours())}${pad(value.getMinutes())}.json`;
}

export function getLastBackupDate() {
  try { return localStorage.getItem(LAST_BACKUP_KEY) || null; } catch { return null; }
}

function recordLastBackupDate(value) {
  try { localStorage.setItem(LAST_BACKUP_KEY, value); } catch { /* Storage may be unavailable. */ }
}

export function exportBackup(state = loadState()) {
  const backup = createBackup(state);
  const filename = generateBackupFilename(new Date(backup.exportedAt));
  recordLastBackupDate(backup.exportedAt);
  let downloaded = false;
  if (typeof document !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type:'application/json' });
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
    downloaded = true;
  }
  return { backup, filename, downloaded };
}

export async function readBackupFile(file) {
  if (!file || typeof file.text !== 'function') return { ok:false, error:'백업파일을 선택해 주세요.' };
  try {
    return { ok:true, backup:JSON.parse(await file.text()) };
  } catch {
    return { ok:false, error:'JSON 백업파일을 읽을 수 없습니다.' };
  }
}

function validateSettings(settings, errors) {
  if (!isObject(settings)) { errors.push('settings 구조를 확인할 수 없습니다.'); return; }
  if (typeof settings.trainingName !== 'string') errors.push('교육명 형식이 올바르지 않습니다.');
  if (typeof settings.trainingStartDate !== 'string' || typeof settings.trainingEndDate !== 'string') errors.push('교육일정 형식이 올바르지 않습니다.');
  if (!Number.isInteger(Number(settings.dueSoonDays)) || Number(settings.dueSoonDays) < 0) errors.push('마감임박 기준 형식이 올바르지 않습니다.');
}

function validateBudget(budget, errors, isLegacy) {
  if (!isObject(budget)) {
    if (isLegacy) return;
    errors.push('budget 구조를 확인할 수 없습니다.');
    return;
  }
  if (!isObject(budget.plans)) errors.push('budget.plans 구조를 확인할 수 없습니다.');
  if (!Array.isArray(budget.transactions)) { errors.push('budget.transactions는 배열이어야 합니다.'); return; }
  budget.transactions.forEach((transaction, index) => {
    if (!isObject(transaction)) { errors.push(`지출 ${index + 1}번 구조가 올바르지 않습니다.`); return; }
    if (typeof transaction.id !== 'string' || !transaction.id) errors.push(`지출 ${index + 1}번 ID가 없습니다.`);
    if (typeof transaction.categoryId !== 'string' || !transaction.categoryId) errors.push(`지출 ${index + 1}번 예산항목이 없습니다.`);
    if (!Number.isInteger(Number(transaction.amount)) || Number(transaction.amount) < 0) errors.push(`지출 ${index + 1}번 금액이 올바르지 않습니다.`);
    if (!TRANSACTION_STATUSES.includes(transaction.status)) errors.push(`지출 ${index + 1}번 상태가 올바르지 않습니다.`);
    if (!SETTLEMENT_STATUSES.includes(transaction.settlementStatus)) errors.push(`지출 ${index + 1}번 정산상태가 올바르지 않습니다.`);
    if (typeof transaction.date !== 'string' || !isValidDate(transaction.date)) errors.push(`지출 ${index + 1}번 날짜가 올바르지 않습니다.`);
    if (typeof transaction.description !== 'string') errors.push(`지출 ${index + 1}번 내용이 올바르지 않습니다.`);
  });
}

function validateChecklist(checklist, errors) {
  if (checklist === undefined) return;
  if (!isObject(checklist)) { errors.push('checklist 구조를 확인할 수 없습니다.'); return; }
  Object.entries(checklist).forEach(([key, entry]) => {
    if (!isObject(entry)) { errors.push(`체크리스트 ${key} 상태 구조가 올바르지 않습니다.`); return; }
    if (!CHECKLIST_STATUSES.includes(entry.status)) errors.push(`체크리스트 ${key} 상태가 올바르지 않습니다.`);
    if (entry.completedAt !== null && entry.completedAt !== undefined && Number.isNaN(new Date(entry.completedAt).getTime())) errors.push(`체크리스트 ${key} 완료일이 올바르지 않습니다.`);
    if (typeof entry.memo !== 'string') errors.push(`체크리스트 ${key} 메모가 올바르지 않습니다.`);
    if (!Array.isArray(entry.checks) || entry.checks.length > 3 || entry.checks.some(value => typeof value !== 'boolean')) errors.push(`체크리스트 ${key} 세부 체크가 올바르지 않습니다.`);
  });
}

export function validateBackup(backup, tasks = []) {
  const errors = [];
  const warnings = [];
  const unknownTaskIds = [];
  if (!isObject(backup)) return { valid:false, errors:['백업 데이터 구조를 확인할 수 없습니다.'], warnings, unknownTaskIds };
  if (backup.backupVersion !== BACKUP_VERSION) errors.push('지원하지 않는 백업파일 버전입니다.');
  if (backup.application !== PROJECT_ID) errors.push('이 파일은 Reporter Training Ops 백업파일이 아닙니다.');
  if (typeof backup.applicationVersion !== 'string' || !backup.applicationVersion) errors.push('백업 프로그램 버전을 확인할 수 없습니다.');
  if (typeof backup.exportedAt !== 'string' || Number.isNaN(new Date(backup.exportedAt).getTime())) errors.push('백업 생성일을 확인할 수 없습니다.');
  if (!isObject(backup.data)) return { valid:false, errors:[...errors, 'data 구조를 확인할 수 없습니다.'], warnings, unknownTaskIds };
  const data = backup.data;
  if (data.projectId !== PROJECT_ID) errors.push('백업 데이터의 프로젝트가 일치하지 않습니다.');
  if (!Number.isInteger(data.version)) errors.push('백업 데이터 버전을 확인할 수 없습니다.');
  if (Number.isInteger(data.version) && data.version > STORAGE_VERSION) errors.push('현재 프로그램보다 새로운 버전에서 생성된 백업입니다.');
  validateSettings(data.settings, errors);
  if (!isObject(data.tasks)) errors.push('tasks 구조를 확인할 수 없습니다.');
  else {
    Object.entries(data.tasks).forEach(([taskId, taskState]) => {
      if (!isObject(taskState)) errors.push(`업무 ${taskId} 상태 구조가 올바르지 않습니다.`);
    });
    const knownTaskIds = new Set(tasks.filter(task => task?.id).map(task => task.id));
    if (knownTaskIds.size) Object.keys(data.tasks).forEach(taskId => { if (!knownTaskIds.has(taskId)) unknownTaskIds.push(taskId); });
    if (unknownTaskIds.length) warnings.push(`현재 버전에서 찾을 수 없는 업무상태 ${unknownTaskIds.length}건이 있습니다.`);
  }
  validateBudget(data.budget, errors, Number(data.version) < STORAGE_VERSION);
  validateChecklist(data.checklist, errors);
  if (containsSensitiveKey(backup)) errors.push('백업파일에 개인정보 필드가 포함되어 있습니다.');
  return { valid:errors.length === 0, errors, warnings, unknownTaskIds };
}

export function previewBackup(backup, tasks = []) {
  const validation = validateBackup(backup, tasks);
  const data = isObject(backup?.data) ? backup.data : {};
  const taskStates = isObject(data.tasks) ? Object.values(data.tasks) : [];
  const checklistStates = isObject(data.checklist) ? Object.values(data.checklist) : [];
  const plans = isObject(data.budget?.plans) ? data.budget.plans : {};
  const transactions = Array.isArray(data.budget?.transactions) ? data.budget.transactions : [];
  return {
    ...validation,
    exportedAt:backup?.exportedAt || '',
    exportedAtLabel:formatDateTime(backup?.exportedAt),
    trainingName:data.settings?.trainingName || '교육명 미설정',
    taskCount:taskStates.length,
    completedCount:taskStates.filter(isCompletedTaskState).length,
    categoryCount:Object.keys(plans).length,
    transactionCount:transactions.length,
    checklistCount:checklistStates.length,
    checklistCompletedCount:checklistStates.filter(item => item?.status === 'COMPLETED').length
  };
}

export function restoreBackup(backup, tasks = []) {
  const validation = validateBackup(backup, tasks);
  if (!validation.valid) return { success:false, ...validation };
  const data = clone(backup.data);
  const knownTaskIds = new Set(tasks.filter(task => task?.id).map(task => task.id));
  if (knownTaskIds.size && isObject(data.tasks)) {
    data.tasks = Object.fromEntries(Object.entries(data.tasks).filter(([taskId]) => knownTaskIds.has(taskId)));
  }
  const state = replaceState(data);
  return { success:true, state, warnings:validation.warnings, unknownTaskIds:validation.unknownTaskIds, errors:[] };
}

export function resetAllUserData() { return resetState(); }
