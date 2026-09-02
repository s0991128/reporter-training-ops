const STORAGE_KEY = 'trainee-reporter-training-state-v1';

export function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch { return {}; }
}

export function saveTaskState(taskId, patch) {
  const state = loadState();
  state[taskId] = { ...(state[taskId] || {}), ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state[taskId];
}
