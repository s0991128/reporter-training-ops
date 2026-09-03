export const STORAGE_KEY = 'trainee-reporter-training-state-v3';
export const STORAGE_VERSION = 3;
export const PROJECT_ID = 'reporter-training-ops';
export const TASK_STATUS = Object.freeze({ NOT_STARTED:'NOT_STARTED', IN_PROGRESS:'IN_PROGRESS', COMPLETED:'COMPLETED' });
export const DEFAULT_SETTINGS = Object.freeze({ trainingName:'', trainingStartDate:'', trainingEndDate:'', dueSoonDays:3 });

const LEGACY_TASK_ID_MAP = Object.freeze({ 'END-001':'CLS-001', 'END-003':'CLS-002', 'BUD-001':'FIN-001', 'BUD-002':'FIN-002', 'BUD-003':'FIN-003' });
const LEGACY_STORAGE_KEYS = ['trainee-reporter-training-state-v2', 'trainee-reporter-training-state-v1'];

function createEmptyState() {
  return { version:STORAGE_VERSION, projectId:PROJECT_ID, settings:{ ...DEFAULT_SETTINGS }, tasks:{} };
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

function normalizeState(saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return createEmptyState();
  if (saved.version === STORAGE_VERSION && saved.projectId === PROJECT_ID) {
    const tasks = saved.tasks && typeof saved.tasks === 'object' && !Array.isArray(saved.tasks) ? saved.tasks : {};
    return { version:STORAGE_VERSION, projectId:PROJECT_ID, settings:normalizeSettings(saved.settings), tasks:normalizeTaskEntries(tasks) };
  }
  if ((saved.version === 2 || saved.version === 1) && saved.tasks && typeof saved.tasks === 'object' && !Array.isArray(saved.tasks)) {
    return { ...createEmptyState(), tasks:normalizeTaskEntries(saved.tasks) };
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

export function getTaskState(state, taskId) {
  return state?.tasks?.[taskId] || { status:TASK_STATUS.NOT_STARTED, completedAt:null, memo:'' };
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
