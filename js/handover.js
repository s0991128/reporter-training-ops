import { CHECKLIST_STATUS } from './storage.js';
import { getChecklistItemState, getChecklistStats, getCurrentChecklistSection } from './checklist.js';

export const HANDOVER_HISTORY_LIMIT = 200;

function asText(value) { return value === null || value === undefined ? '' : String(value); }

function isIncomplete(status) {
  return status !== CHECKLIST_STATUS.COMPLETED && status !== CHECKLIST_STATUS.NOT_APPLICABLE;
}

function enrichItem(item, state) {
  const itemState = getChecklistItemState(item, state);
  return { item, state:itemState, status:itemState.status, memo:itemState.memo || '', updatedAt:itemState.updatedAt || null };
}

function flattenGroups(groups = []) {
  return groups.flatMap(group => group.items || []);
}

function uniqueByKey(items) {
  const seen = new Set();
  return items.filter(entry => {
    const key = entry.item?.key || entry.key;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sectionIndex(groups, section) {
  return groups.findIndex(group => group.section === section);
}

function withReason(item, state, priority, reason) {
  return { ...enrichItem(item, state), priority, reason };
}

function getPreviousIncomplete(groups, state, currentSection) {
  const index = sectionIndex(groups, currentSection);
  if (index <= 0) return [];
  return groups.slice(0, index).flatMap(group => (group.items || [])
    .filter(item => isIncomplete(enrichItem(item, state).status))
    .map(item => withReason(item, state, 1, '이전 구간 미완료')));
}

function getInProgress(items, state) {
  return items.filter(item => enrichItem(item, state).status === CHECKLIST_STATUS.IN_PROGRESS)
    .map(item => withReason(item, state, 2, '진행중'));
}

function getMemoIncomplete(items, state) {
  return items.filter(item => {
    const entry = enrichItem(item, state);
    return isIncomplete(entry.status) && Boolean(entry.memo.trim());
  }).map(item => withReason(item, state, 3, '메모가 있는 미완료 업무'));
}

function getCurrentIncomplete(groups, state, currentSection) {
  const group = groups.find(candidate => candidate.section === currentSection);
  return (group?.items || []).filter(item => isIncomplete(enrichItem(item, state).status))
    .map(item => withReason(item, state, 4, '현재 진행구간 미완료'));
}

export function getNextHandoverTask(groups = [], state, currentSection = getCurrentChecklistSection(groups, state)) {
  const index = sectionIndex(groups, currentSection);
  if (index < 0) return null;
  const currentGroup = groups[index];
  const currentNotStarted = (currentGroup?.items || []).find(item => enrichItem(item, state).status === CHECKLIST_STATUS.NOT_STARTED);
  if (currentNotStarted) return withReason(currentNotStarted, state, 5, '현재 구간의 다음 미착수 업무');
  const currentStats = getChecklistStats(currentGroup?.items || [], state);
  if (currentStats.progress > 0 || currentStats.pending > 0) return null;
  for (const group of groups.slice(index + 1)) {
    const next = (group.items || []).find(item => enrichItem(item, state).status !== CHECKLIST_STATUS.NOT_APPLICABLE);
    if (next) return withReason(next, state, 5, '다음 구간의 첫 적용 업무');
  }
  return null;
}

export function getHandoverSourceIdentity(items = []) {
  const keys = items.map(item => asText(item?.key));
  let hash = 2166136261;
  for (const character of keys.join('\u001f')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return {
    rowCount:items.length,
    keyCount:new Set(keys.filter(Boolean)).size,
    checksum:(hash >>> 0).toString(16).padStart(8, '0')
  };
}

export function getHandoverStats(items = [], state) {
  const checklistStats = getChecklistStats(items, state);
  return {
    total:checklistStats.total,
    applicable:checklistStats.applicable,
    complete:checklistStats.complete,
    progress:checklistStats.progress,
    notStarted:checklistStats.pending,
    incomplete:checklistStats.progress + checklistStats.pending,
    notApplicable:checklistStats.notApplicable,
    percent:checklistStats.percent
  };
}

export function getHandoverHistory(state, items = [], limit = 10) {
  const itemMap = new Map(items.map(item => [item.key, item]));
  const statusLabel = status => ({
    [CHECKLIST_STATUS.NOT_STARTED]:'미착수',
    [CHECKLIST_STATUS.IN_PROGRESS]:'진행중',
    [CHECKLIST_STATUS.COMPLETED]:'완료',
    [CHECKLIST_STATUS.NOT_APPLICABLE]:'해당없음'
  }[status] || status || '');
  return (Array.isArray(state?.checklistHistory) ? state.checklistHistory : [])
    .slice(-HANDOVER_HISTORY_LIMIT)
    .reverse()
    .map(entry => {
      const item = itemMap.get(entry.taskKey);
      if (!item) return null;
      const change = entry.type === 'STATUS_CHANGED'
        ? `${statusLabel(entry.from)} → ${statusLabel(entry.to)}`
        : entry.type === 'SUBCHECK_CHANGED' ? '세부 체크 변경' : '메모 수정';
      return { ...entry, item, section:item.section, work:item.work, change };
    })
    .filter(Boolean)
    .slice(0, Math.max(0, limit));
}

export function getHandoverSnapshot(items = [], groups = [], state, { historyLimit = 10 } = {}) {
  const currentSection = getCurrentChecklistSection(groups, state);
  const allItems = flattenGroups(groups).length ? flattenGroups(groups) : items;
  const previousIncomplete = getPreviousIncomplete(groups, state, currentSection);
  const inProgress = getInProgress(allItems, state);
  const memoIncomplete = getMemoIncomplete(allItems, state);
  const memoCompleted = allItems.filter(item => {
    const entry = enrichItem(item, state);
    return entry.status === CHECKLIST_STATUS.COMPLETED && Boolean(entry.memo.trim());
  }).map(item => withReason(item, state, 6, '완료 업무 메모'));
  const currentIncomplete = getCurrentIncomplete(groups, state, currentSection);
  const nextTask = getNextHandoverTask(groups, state, currentSection);
  const firstItems = uniqueByKey([
    ...previousIncomplete,
    ...inProgress,
    ...memoIncomplete,
    ...currentIncomplete,
    ...(nextTask ? [nextTask] : [])
  ]);
  return {
    source:getHandoverSourceIdentity(items),
    currentSection,
    currentSectionIndex:sectionIndex(groups, currentSection),
    stats:getHandoverStats(items, state),
    firstItems,
    previousIncomplete,
    inProgress,
    memoIncomplete,
    memoCompleted,
    nextTask,
    recentHistory:getHandoverHistory(state, items, historyLimit),
    historyCount:Array.isArray(state?.checklistHistory) ? Math.min(state.checklistHistory.length, HANDOVER_HISTORY_LIMIT) : 0,
    sectionProgress:groups.map(group => ({ section:group.section, stats:getHandoverStats(group.items || [], state) })),
    allItems:allItems.map(item => enrichItem(item, state)),
    handover:state?.handover || { note:'', updatedAt:null }
  };
}
