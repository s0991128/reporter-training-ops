import { getChecklistItemState, getChecklistStats, isThreeCheckItem } from './checklist.js';
import { CHECKLIST_STATUS } from './storage.js';

function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character])); }

function statusLabel(status) {
  return ({
    [CHECKLIST_STATUS.NOT_STARTED]:'미착수',
    [CHECKLIST_STATUS.IN_PROGRESS]:'진행중',
    [CHECKLIST_STATUS.COMPLETED]:'완료',
    [CHECKLIST_STATUS.NOT_APPLICABLE]:'해당없음'
  })[status] || '미착수';
}

function formatCompletedAt(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ko-KR', { dateStyle:'medium', timeStyle:'short' }).format(date);
}

function renderItem(item, state) {
  const itemState = getChecklistItemState(item, state);
  const threeCheck = isThreeCheckItem(item);
  const disabled = itemState.status === CHECKLIST_STATUS.NOT_APPLICABLE ? 'disabled' : '';
  const checks = threeCheck ? itemState.checks.map((checked, index) => `<label class="checklist-mini-check"><input type="checkbox" data-checklist-action="detail-check" data-checklist-index="${index}" ${checked ? 'checked' : ''} ${disabled} /> ${index + 1}차</label>`).join('') : '';
  const completionControl = threeCheck
    ? `<div class="checklist-three-checks" aria-label="3회 체크">${checks}</div>`
    : `<label class="checklist-complete-control"><input type="checkbox" data-checklist-action="status-check" ${itemState.status === CHECKLIST_STATUS.COMPLETED ? 'checked' : ''} ${disabled} /> 완료</label>`;
  const notApplicableLabel = itemState.status === CHECKLIST_STATUS.NOT_APPLICABLE ? '적용 업무로 되돌리기' : '해당없음';
  return `<article class="checklist-item checklist-status-${itemState.status.toLowerCase()}" data-checklist-key="${escapeHtml(item.key)}">
    <div class="checklist-item-copy"><div class="checklist-item-heading"><span class="checklist-key">${escapeHtml(item.key)}</span><span class="checklist-status-label">${statusLabel(itemState.status)}</span></div><p class="checklist-work">${escapeHtml(item.work)}</p>${item.note ? `<p class="checklist-note">비고 · ${escapeHtml(item.note)}</p>` : ''}${itemState.completedAt ? `<p class="checklist-completed-at">마지막 완료 ${escapeHtml(formatCompletedAt(itemState.completedAt))}</p>` : ''}</div>
    <div class="checklist-item-controls">${completionControl}<button type="button" class="checklist-na-button" data-checklist-action="toggle-na">${notApplicableLabel}</button></div>
    <label class="checklist-memo"><span>인수인계 메모</span><textarea data-checklist-action="memo" maxlength="300" placeholder="강사 회신 대기 중 · 내일 오전 재확인 등">${escapeHtml(itemState.memo)}</textarea></label>
  </article>`;
}

export function renderChecklistSummary(container, items, state) {
  if (!container) return getChecklistStats(items, state);
  const stats = getChecklistStats(items, state);
  const values = { total:stats.total, complete:stats.complete, progress:stats.progress, pending:stats.pending, notApplicable:stats.notApplicable, percent:`${stats.percent}%` };
  Object.entries(values).forEach(([key, value]) => { const element = container.querySelector(`[data-checklist-summary="${key}"]`); if (element) element.textContent = value; });
  const bar = container.querySelector('[data-checklist-progress]');
  if (bar) bar.style.width = `${stats.percent}%`;
  const caption = container.querySelector('[data-checklist-caption]');
  if (caption) caption.textContent = stats.total ? `적용 업무 ${stats.applicable}건 중 ${stats.complete}건 완료` : '업무목록.csv를 불러오는 중입니다.';
  return stats;
}

export function renderChecklistNavigation(container, groups, state, activeSection = '전체') {
  if (!container) return;
  const overallStats = getChecklistStats(groups.flatMap(group => group.items), state);
  container.innerHTML = [`<button type="button" class="checklist-section-nav ${activeSection === '전체' ? 'active' : ''}" data-checklist-section="전체"><span>전체 구간</span><strong>${overallStats.complete} / ${overallStats.applicable}</strong></button>`, ...groups.map(group => {
    const stats = getChecklistStats(group.items, state);
    return `<button type="button" class="checklist-section-nav ${activeSection === group.section ? 'active' : ''}" data-checklist-section="${escapeHtml(group.section)}"><span>${escapeHtml(group.section)}</span><strong>${stats.complete} / ${stats.applicable}</strong></button>`;
  })].join('');
}

export function renderChecklistGroups(container, groups, filteredItems, state, activeSection = '전체') {
  if (!container) return;
  const visibleKeys = new Set(filteredItems.map(item => item.key));
  const visibleGroups = groups.map(group => ({ ...group, items:group.items.filter(item => visibleKeys.has(item.key)) })).filter(group => group.items.length);
  if (!visibleGroups.length) { container.innerHTML = '<div class="checklist-empty">조건에 맞는 업무가 없습니다.<br /><small>검색어 또는 상태 필터를 조정해 보세요.</small></div>'; return; }
  container.innerHTML = visibleGroups.map(group => {
    const stats = getChecklistStats(group.items, state);
    return `<details class="checklist-group" data-checklist-group="${escapeHtml(group.section)}" open><summary><span><strong>${escapeHtml(group.section)}</strong><small>${stats.complete} / ${stats.applicable} 완료</small></span><span class="checklist-group-arrow">⌄</span></summary><div class="checklist-group-items">${group.items.map(item => renderItem(item, state)).join('')}</div></details>`;
  }).join('');
}

export function renderChecklistError(container, error) {
  if (!container) return;
  const report = error?.report;
  const details = report?.errors?.length ? `<ul>${report.errors.slice(0, 8).map(message => `<li>${escapeHtml(message)}</li>`).join('')}</ul>` : '';
  container.innerHTML = `<div class="checklist-validation-error"><strong>업무목록.csv 검증 오류</strong><p>${escapeHtml(error?.message || '업무목록.csv를 불러올 수 없습니다.')}</p>${details}</div>`;
}
