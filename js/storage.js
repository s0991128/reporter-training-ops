export const STORAGE_KEY = 'trainee-reporter-training-state-v4';
export const STORAGE_VERSION = 4;
export const PROJECT_ID = 'reporter-training-ops';
export const TASK_STATUS = Object.freeze({ NOT_STARTED:'NOT_STARTED', IN_PROGRESS:'IN_PROGRESS', COMPLETED:'COMPLETED' });
export const DEFAULT_SETTINGS = Object.freeze({ trainingName:'', trainingStartDate:'', trainingEndDate:'', dueSoonDays:3 });

const LEGACY_TASK_ID_MAP = Object.freeze({ 'END-001':'CLS-001', 'END-003':'CLS-002', 'BUD-001':'FIN-001', 'BUD-002':'FIN-002', 'BUD-003':'FIN-003' });
const LEGACY_STORAGE_KEYS = ['trainee-reporter-training-state-v3', 'trainee-reporter-training-state-v2', 'trainee-reporter-training-state-v1'];
const TRANSACTION_STATUSES = ['PLANNED', 'COMMITTED', 'PAID', 'CANCELLED'];
const SETTLEMENT_STATUSES = ['NOT_REQUIRED', 'PENDING', 'COMPLETED'];

function createEmptyState() {
  return { version:STORAGE_VERSION, projectId:PROJECT_ID, settings:{ ...DEFAULT_SETTINGS }, tasks:{}, budget:{ plans:{}, transactions:[] } };
}

function normalizeSettings(settings = {}) {
  const dueSoonDays = Number(settings.dueSoonDays);
  return {
    trainingName:typeof settings.trainingName === 'string' ? settings.trainingName : DEFAULT_SETTINGS.trainingName,
    trainingStartDate:typeof settings.trainingStartDate === 'string' ? settings.trainingStartDate : DEFAULT_SETTINGS.trainingStartDate,
    trainingEndDate:typeof settings.trainingEndDate === 'string' ? settings.trainingEndDate : DEFAULT_SETTINGS.trainingEndDate,
    dueSoonDays:Number.isFinite(dueSoonDays) && dueSoonDays >= 0 ? Math.floor(dueSoonDays) : DEFAULT_SETTINGS.dueSoonDays
  };
}

function normalizeCompletedAt(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return null;
  const legacyDate = value.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?$/);
  if (legacyDate) return new Date(Date.UTC(Number(legacyDate[1]), Number(legacyDate[2]) - 1, Number(legacyDate[3]))).toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function normalizeTaskState(taskState = {}) {
  if (!taskState || typeof taskState !== 'object' || Array.isArray(taskState)) taskState = {};
  const status = Object.values(TASK_STATUS).includes(taskState.status)
    ? taskState.status
    : taskState.completed
      ? TASK_STATUS.COMPLETED
      : taskState.started || taskState.memo
        ? TASK_STATUS.IN_PROGRESS
        : TASK_STATUS.NOT_STARTED;
  return { status, completedAt:normalizeCompletedAt(taskState.completedAt), memo:typeof taskState.memo === 'string' ? taskState.memo : '' };
}

function normalizeTaskEntries(tasks = {}) {
  const normalized = {};
  Object.entries(tasks).forEach(([id, taskState]) => {
    const migratedId = LEGACY_TASK_ID_MAP[id] || id;
    normalized[migratedId] = { ...(normalized[migratedId] || {}), ...normalizeTaskState(taskState) };
  });
  return normalized;
}

function normalizeBudget(budget = {}) {
  const plans = {};
  if (budget.plans && typeof budget.plans === 'object' && !Array.isArray(budget.plans)) {
    Object.entries(budget.plans).forEach(([categoryId, amount]) => {
      const number = Number(amount);
      plans[categoryId] = Number.isInteger(number) && number >= 0 ? number : 0;
    });
  }
  const transactions = Array.isArray(budget.transactions) ? budget.transactions.filter(transaction => transaction && typeof transaction === 'object').map((transaction, index) => ({
    id:typeof transaction.id === 'string' && transaction.id ? transaction.id : `TX-MIGRATED-${String(index + 1).padStart(4, '0')}`,
    categoryId:typeof transaction.categoryId === 'string' ? transaction.categoryId : '',
    amount:Number.isInteger(Number(transaction.amount)) && Number(transaction.amount) >= 0 ? Number(transaction.amount) : 0,
    status:TRANSACTION_STATUSES.includes(transaction.status) ? transaction.status : 'PLANNED',
    date:typeof transaction.date === 'string' ? transaction.date : '',
    description:typeof transaction.description === 'string' ? transaction.description : '',
    taskId:typeof transaction.taskId === 'string' ? transaction.taskId : '',
    settlementStatus:SETTLEMENT_STATUSES.includes(transaction.settlementStatus) ? transaction.settlementStatus : 'NOT_REQUIRED',
    memo:typeof transaction.memo === 'string' ? transaction.memo : '',
    createdAt:typeof transaction.createdAt === 'string' ? transaction.createdAt : new Date().toISOString(),
    updatedAt:typeof transaction.updatedAt === 'string' ? transaction.updatedAt : new Date().toISOString()
  })) : [];
  return { plans, transactions };
}

function normalizeState(saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return createEmptyState();
  if (saved.version === STORAGE_VERSION && saved.projectId === PROJECT_ID) {
    const tasks = saved.tasks && typeof saved.tasks === 'object' && !Array.isArray(saved.tasks) ? saved.tasks : {};
    return { version:STORAGE_VERSION, projectId:PROJECT_ID, settings:normalizeSettings(saved.settings), tasks:normalizeTaskEntries(tasks), budget:normalizeBudget(saved.budget) };
  }
  if ((saved.version === 3 || saved.version === 2 || saved.version === 1) && saved.tasks && typeof saved.tasks === 'object' && !Array.isArray(saved.tasks)) {
    return { ...createEmptyState(), settings:normalizeSettings(saved.settings), tasks:normalizeTaskEntries(saved.tasks) };
  }
  if (!('version' in saved) && !('projectId' in saved)) return { ...createEmptyState(), tasks:normalizeTaskEntries(saved) };
  return createEmptyState();
}

function readStoredState() {
  const keys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch { /* Continue with the next legacy key when a value is malformed. */ }
  }
  return null;
}

function persistState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Storage may be unavailable in private browsing. */ }
}

export function loadState() {
  try {
    const saved = readStoredState();
    const state = normalizeState(saved);
    if (!saved || saved.version !== STORAGE_VERSION || saved.projectId !== PROJECT_ID || !saved.settings) persistState(state);
    return state;
  } catch { return createEmptyState(); }
}

export function replaceState(saved) {
  const state = normalizeState(saved);
  persistState(state);
  return state;
}

export function resetState() {
  const state = createEmptyState();
  persistState(state);
  return state;
}

export function getTaskState(state, taskId) {
  return state?.tasks?.[taskId] || { status:TASK_STATUS.NOT_STARTED, completedAt:null, memo:'' };
}

// Keep only user state for tasks present in a newly applied master list.
// New task IDs intentionally have no entry and therefore use the default state.
export function reconcileTaskStates(state, nextTasks = []) {
  const knownIds = new Set(nextTasks.filter(task => task?.id).map(task => task.id));
  const tasks = Object.fromEntries(Object.entries(state?.tasks || {}).filter(([taskId]) => knownIds.has(taskId)));
  return { ...state, version:STORAGE_VERSION, projectId:PROJECT_ID, tasks };
}

export function saveSettings(settings) {
  const state = loadState();
  state.settings = normalizeSettings(settings);
  persistState(state);
  return state.settings;
}

export function saveTaskState(taskId, patch) {
  const state = loadState();
  state.tasks[taskId] = { ...getTaskState(state, taskId), ...patch };
  persistState(state);
  return state.tasks[taskId];
}

export function saveBudgetPlans(plans) {
  const state = loadState();
  state.budget.plans = normalizeBudget({ plans }).plans;
  persistState(state);
  return state.budget;
}

export function saveTransaction(transaction) {
  const state = loadState();
  const now = new Date().toISOString();
  const next = normalizeBudget({ transactions:[{ ...transaction, createdAt:transaction.createdAt || now, updatedAt:now }] }).transactions[0];
  const index = state.budget.transactions.findIndex(item => item.id === next.id);
  if (index >= 0) state.budget.transactions[index] = next;
  else state.budget.transactions.push(next);
  persistState(state);
  return next;
}

export function cancelTransaction(transactionId) {
  const state = loadState();
  const transaction = state.budget.transactions.find(item => item.id === transactionId);
  if (!transaction) return null;
  transaction.status = 'CANCELLED';
  transaction.updatedAt = new Date().toISOString();
  persistState(state);
  return transaction;
}

export function completeSettlement(transactionId) {
  const state = loadState();
  const transaction = state.budget.transactions.find(item => item.id === transactionId);
  if (!transaction) return null;
  transaction.settlementStatus = 'COMPLETED';
  transaction.updatedAt = new Date().toISOString();
  persistState(state);
  return transaction;
}
