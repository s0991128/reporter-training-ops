import { getChecklistItemState, getChecklistStats, isThreeCheckItem } from './checklist.js';
import { CHECKLIST_STATUS } from './storage.js';
import { formatKoreanDateTime } from './datetime.js';

function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character])); }

function statusLabel(status) {
  return ({ [CHECKLIST_STATUS.NOT_STARTED]:'미착수', [CHECKLIST_STATUS.IN_PROGRESS]:'진행중', [CHECKLIST_STATUS.COMPLETED]:'완료', [CHECKLIST_STATUS.NOT_APPLICABLE]:'해당없음' })[status] || '미착수';
}

function renderStatusControl(itemState, reviewPending, threeCheck) {
  if (threeCheck) return `<span class="checklist-three-count">${itemState.checks.filter(Boolean).length}/3</span>`;
  return `<select data-checklist-action="status-select" aria-label="업무 상태"><option value="NOT_STARTED" ${itemState.status === CHECKLIST_STATUS.NOT_STARTED ? 'selected' : ''}>미착수</option><option value="IN_PROGRESS" ${itemState.status === CHECKLIST_STATUS.IN_PROGRESS ? 'selected' : ''}>진행중</option><option value="COMPLETED" ${itemState.status === CHECKLIST_STATUS.COMPLETED ? 'selected' : ''}>완료</option><option value="NOT_APPLICABLE" ${itemState.status === CHECKLIST_STATUS.NOT_APPLICABLE ? 'selected' : ''}>해당없음</option></select>`;
}

function renderItem(item, state, expandedKey) {
  const itemState = getChecklistItemState(item, state);
  const threeCheck = isThreeCheckItem(item);
  const metadata = item.metadata || {};
  const reviewPending = metadata.reviewStatus === 'PENDING_REVIEW';
  const expanded = expandedKey === item.key;
  const disabled = reviewPending || itemState.status === CHECKLIST_STATUS.NOT_APPLICABLE ? 'disabled' : '';
  const detailChecks = threeCheck ? itemState.checks.map((checked, index) => `<label class="checklist-mini-check"><input type="checkbox" data-checklist-action="detail-check" data-checklist-index="${index}" ${checked ? 'checked' : ''} ${disabled} /> ${index + 1}차</label>`).join('') : '';
  const memoLabel = itemState.memo ? '메모 있음' : '메모';
  const dependencyText = metadata.dependencies?.length ? `선행 ${metadata.dependencies.join(', ')}` : '선행업무 미등록';
  return `<article class="checklist-row checklist-status-${itemState.status.toLowerCase()}" data-checklist-key="${escapeHtml(item.key)}"><div class="checklist-row-main"><span class="checklist-section-label">${escapeHtml(item.section)}</span><button type="button" class="checklist-work-button" data-checklist-action="toggle-details" aria-expanded="${expanded}">${escapeHtml(item.work)}</button><span class="checklist-status-cell">${renderStatusControl(itemState, reviewPending, threeCheck)}</span><span class="checklist-check-cell">${threeCheck ? '3회 체크' : statusLabel(itemState.status)}</span><button type="button" class="checklist-memo-button" data-checklist-action="toggle-details" aria-expanded="${expanded}">${memoLabel}</button></div>${expanded ? `<div class="checklist-row-detail"><div class="checklist-detail-meta"><span>${escapeHtml(item.key)}</span><span>${escapeHtml(item.phase)} · ${escapeHtml(metadata.category || '기타')} · 담당 ${escapeHtml(metadata.assigneeRole || '검토 필요')}</span><span>${escapeHtml(dependencyText)}</span>${reviewPending ? '<span class="checklist-review-label">메타데이터 검토 필요</span>' : ''}</div>${item.note ? `<p class="checklist-note">비고 · ${escapeHtml(item.note)}</p>` : ''}${itemState.completedAt ? `<p class="checklist-completed-at">마지막 완료 ${escapeHtml(formatKoreanDateTime(itemState.completedAt))}</p>` : ''}${threeCheck ? `<div class="checklist-three-checks" aria-label="3회 체크">${detailChecks}</div>` : ''}<label class="checklist-memo"><span>인수인계 메모</span><textarea data-checklist-action="memo" maxlength="300" placeholder="강사 회신 대기 중 · 내일 오전 재확인 등">${escapeHtml(itemState.memo)}</textarea></label></div>` : ''}</article>`;
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
  container.innerHTML = `<option value="전체">전체</option>${groups.map(group => { const stats = getChecklistStats(group.items, state); return `<option value="${escapeHtml(group.section)}">${escapeHtml(group.section)} · ${stats.complete}/${stats.applicable}</option>`; }).join('')}`;
  container.value = activeSection;
}

export function renderChecklistGroups(container, groups, filteredItems, state, activeSection = '전체', expandedKey = null) {
  if (!container) return;
  if (!filteredItems.length) { container.innerHTML = '<div class="checklist-empty">조건에 맞는 업무가 없습니다.<br /><small>검색어 또는 상태 필터를 조정해 보세요.</small></div>'; return; }
  const visibleKeys = new Set(filteredItems.map(item => item.key));
  const renderedGroups = groups.map(group => ({ ...group, items:group.items.filter(item => visibleKeys.has(item.key)) })).filter(group => group.items.length);
  const showSectionHeadings = activeSection === '전체' || activeSection === '현재+다음';
  const rows = showSectionHeadings
    ? renderedGroups.map((group, index) => `<section class="checklist-section-block"><h3>${escapeHtml(activeSection === '현재+다음' && index > 0 ? `${group.section} · 다음 구간 미리보기` : group.section)}</h3>${group.items.map(item => renderItem(item, state, expandedKey)).join('')}</section>`).join('')
    : filteredItems.map(item => renderItem(item, state, expandedKey)).join('');
  container.innerHTML = `<div class="checklist-list" role="list"><div class="checklist-list-head" aria-hidden="true"><span>구간</span><span>업무</span><span>상태</span><span>3회 체크</span><span>메모</span></div>${rows}</div>`;
}

export function renderChecklistError(container, error) {
  if (!container) return;
  const report = error?.report;
  const details = report?.errors?.length ? `<ul>${report.errors.slice(0, 8).map(message => `<li>${escapeHtml(message)}</li>`).join('')}</ul>` : '';
  container.innerHTML = `<div class="checklist-validation-error"><strong>업무목록.csv 검증 오류</strong><p>${escapeHtml(error?.message || '업무목록.csv를 불러올 수 없습니다.')}</p>${details}</div>`;
}
