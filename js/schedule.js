const DAY_MS = 24 * 60 * 60 * 1000;

export const SCHEDULE_STATUS = Object.freeze({ NO_DATE:'NO_DATE', UPCOMING:'UPCOMING', DUE_SOON:'DUE_SOON', DUE_TODAY:'DUE_TODAY', OVERDUE:'OVERDUE', COMPLETED:'COMPLETED' });

function parseLocalDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function startOfDay(value) {
  const date = parseLocalDate(value);
  return date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()) : null;
}

function addDays(date, days) {
  const result = startOfDay(date);
  if (!result || !Number.isFinite(Number(days))) return null;
  result.setDate(result.getDate() + Number(days));
  return result;
}

function getState(states, taskId) {
  if (states?.tasks && typeof states.tasks === 'object') return states.tasks[taskId] || {};
  return states?.[taskId] || {};
}

export function calculateTaskDate(task, settings = {}) {
  const timing = task?.timing;
  if (!timing || timing.type === 'MANUAL') return null;
  const value = Number(timing.value);
  if (timing.type === 'D_DAY') return addDays(settings.trainingStartDate, value);
  if (timing.type === 'TRAINING_DAY') return addDays(settings.trainingStartDate, value - 1);
  if (timing.type === 'END_DAY') return parseLocalDate(settings.trainingEndDate);
  if (timing.type === 'AFTER_END') return addDays(settings.trainingEndDate, value);
  return null;
}

export function getDaysDifference(dateA, dateB) {
  const first = startOfDay(dateA);
  const second = startOfDay(dateB);
  return first && second ? Math.round((second.getTime() - first.getTime()) / DAY_MS) : null;
}

export function getScheduleStatus(task, taskState = {}, settings = {}, today = new Date()) {
  if (taskState.status === 'COMPLETED') return SCHEDULE_STATUS.COMPLETED;
  const taskDate = calculateTaskDate(task, settings);
  if (!taskDate) return SCHEDULE_STATUS.NO_DATE;
  const daysUntilDue = getDaysDifference(today, taskDate);
  if (daysUntilDue < 0) return SCHEDULE_STATUS.OVERDUE;
  if (daysUntilDue === 0) return SCHEDULE_STATUS.DUE_TODAY;
  const dueSoonDays = Number.isFinite(Number(settings.dueSoonDays)) && Number(settings.dueSoonDays) >= 0 ? Number(settings.dueSoonDays) : 3;
  if (daysUntilDue <= dueSoonDays) return SCHEDULE_STATUS.DUE_SOON;
  return SCHEDULE_STATUS.UPCOMING;
}

function filterByScheduleStatus(tasks, states, settings, status, today) {
  return tasks.filter(task => getScheduleStatus(task, getState(states, task.id), settings, today) === status);
}

export function getTasksDueToday(tasks, states, settings, today = new Date()) {
  return filterByScheduleStatus(tasks, states, settings, SCHEDULE_STATUS.DUE_TODAY, today);
}

export function getTasksDueThisWeek(tasks, states, settings, today = new Date()) {
  const current = startOfDay(today);
  if (!current) return [];
  const mondayOffset = (current.getDay() + 6) % 7;
  const monday = addDays(current, -mondayOffset);
  const sunday = addDays(monday, 6);
  return tasks.filter(task => {
    if (getScheduleStatus(task, getState(states, task.id), settings, today) === SCHEDULE_STATUS.COMPLETED) return false;
    const taskDate = calculateTaskDate(task, settings);
    return taskDate && taskDate >= monday && taskDate <= sunday;
  });
}

export function getOverdueTasks(tasks, states, settings, today = new Date()) {
  return filterByScheduleStatus(tasks, states, settings, SCHEDULE_STATUS.OVERDUE, today);
}

export function getDueSoonTasks(tasks, states, settings, today = new Date()) {
  return filterByScheduleStatus(tasks, states, settings, SCHEDULE_STATUS.DUE_SOON, today);
}

export function formatTaskDate(date) {
  const value = startOfDay(date);
  if (!value) return '';
  const pad = number => String(number).padStart(2, '0');
  return `${value.getFullYear()}.${pad(value.getMonth() + 1)}.${pad(value.getDate())}`;
}
