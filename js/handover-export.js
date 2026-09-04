import { CHECKLIST_STATUS } from './storage.js';
import { getHandoverSnapshot } from './handover.js';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character]));
}

function statusLabel(status) {
  return ({
    [CHECKLIST_STATUS.NOT_STARTED]:'미착수',
    [CHECKLIST_STATUS.IN_PROGRESS]:'진행중',
    [CHECKLIST_STATUS.COMPLETED]:'완료',
    [CHECKLIST_STATUS.NOT_APPLICABLE]:'해당없음'
  })[status] || '미착수';
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('ko-KR', { dateStyle:'medium', timeStyle:'short' }).format(date);
}

function formatDateOnly(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function renderItem(entry, includeMemo = true) {
  return `<li><div><span class="section">${escapeHtml(entry.item.section)}</span><strong>${escapeHtml(entry.item.work)}</strong></div><span class="status status-${escapeHtml(entry.status.toLowerCase())}">${escapeHtml(statusLabel(entry.status))}</span>${includeMemo && entry.memo ? `<p>메모 · ${escapeHtml(entry.memo)}</p>` : ''}</li>`;
}

function renderEntries(entries, empty = '해당 업무가 없습니다.') {
  return entries.length ? `<ul class="handover-list">${entries.map(entry => renderItem(entry)).join('')}</ul>` : `<p class="empty">${escapeHtml(empty)}</p>`;
}

function renderHistory(entries) {
  if (!entries.length) return '<p class="empty">최근 변경 이력이 없습니다.</p>';
  return `<ul class="history-list">${entries.map(entry => `<li><time>${escapeHtml(formatDate(entry.at))}</time><div><span class="section">${escapeHtml(entry.section)}</span><strong>${escapeHtml(entry.work)}</strong><p>${escapeHtml(entry.change)}</p></div></li>`).join('')}</ul>`;
}

function renderSections(snapshot) {
  return snapshot.sectionProgress.map(section => `<details class="section-block"><summary><strong>${escapeHtml(section.section)}</strong><span>${section.stats.complete} / ${section.stats.applicable} 완료 · ${section.stats.percent}%</span></summary><ul class="status-list">${snapshot.allItems.filter(entry => entry.item.section === section.section).map(entry => `<li><span class="status status-${escapeHtml(entry.status.toLowerCase())}">${escapeHtml(statusLabel(entry.status))}</span><span>${escapeHtml(entry.item.work)}</span>${entry.memo ? `<small>메모 · ${escapeHtml(entry.memo)}</small>` : ''}</li>`).join('')}</ul></details>`).join('');
}

export function getHandoverReportFilename(date = new Date()) {
  return `수습기자_기본교육_인수인계_${formatDateOnly(date)}.html`;
}

export function buildHandoverReportHtml(items = [], groups = [], state, generatedAt = new Date()) {
  const snapshot = getHandoverSnapshot(items, groups, state, { historyLimit:10 });
  const trainingName = state?.settings?.trainingName || '수습기자 기본교육';
  const note = snapshot.handover.note || '종합 인수인계 메모가 없습니다.';
  const nextTask = snapshot.nextTask ? renderEntries([snapshot.nextTask]) : '<p class="empty">현재 추천할 다음 업무가 없습니다.</p>';
  return `<!doctype html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(trainingName)} 인수인계 보고서</title>
<style>
:root{color-scheme:light;font-family:Arial,"Malgun Gothic",sans-serif;color:#263b4d;background:#f4f7f9}*{box-sizing:border-box}body{margin:0;padding:32px 18px;line-height:1.55}main{max-width:1080px;margin:0 auto;background:#fff;padding:34px;border:1px solid #dbe5eb;border-radius:12px}h1{margin:5px 0;color:#15324d;font-size:28px}h2{margin:28px 0 12px;color:#204a62;font-size:19px}h3{margin:0;color:#204a62;font-size:15px}.eyebrow{margin:0;color:#5c9c89;font-size:11px;font-weight:700;letter-spacing:.12em}.muted,.empty{color:#718392;font-size:13px}.meta{padding-bottom:18px;border-bottom:1px solid #e4ebef}.meta p{margin:6px 0}.metrics{display:grid;grid-template-columns:repeat(6,1fr);gap:9px}.metric{padding:14px;border:1px solid #dfe8ed;border-radius:8px;background:#fbfdfe}.metric span{display:block;color:#748795;font-size:11px}.metric strong{display:block;margin-top:5px;color:#1d5169;font-size:20px}.metric.progress{color:#fff;background:#20445d}.metric.progress span,.metric.progress strong{color:#fff}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.panel{padding:18px;border:1px solid #dfE8ed;border-radius:9px;background:#fff}.warning{border-color:#efd5c8;background:#fff9f5}.warning h3{color:#9a5947}.handover-list,.history-list,.status-list{padding:0;margin:0;list-style:none}.handover-list li{display:grid;grid-template-columns:1fr auto;gap:4px 12px;padding:10px 0;border-top:1px solid #edf1f3}.handover-list li:first-child,.history-list li:first-child{border-top:0}.section{display:block;color:#7591a0;font-size:11px}.handover-list strong,.history-list strong{display:block;color:#35566a;font-size:13px}.handover-list p,.history-list p{grid-column:1/-1;margin:2px 0 0;color:#6d7f8c;font-size:12px;white-space:pre-wrap}.status{display:inline-block;align-self:start;padding:2px 7px;border-radius:4px;color:#6c7b86;background:#eef2f4;font-size:11px;white-space:nowrap}.status-completed{color:#287358;background:#e7f5ee}.status-in_progress{color:#a2682e;background:#fff0dc}.status-not_applicable{color:#71808a;background:#edf1f3}.status-not_started{color:#8a5f54;background:#fff3ef}.history-list li{display:grid;grid-template-columns:125px 1fr;gap:10px;padding:10px 0;border-top:1px solid #edf1f3}.history-list time{color:#748b99;font-size:11px}.history-list p{margin-top:1px}.section-block{margin:8px 0;border:1px solid #e2e9ed;border-radius:7px;overflow:hidden}.section-block summary{display:flex;justify-content:space-between;gap:10px;padding:11px 13px;background:#f7fafb;cursor:pointer}.section-block summary span{color:#6d8290;font-size:11px}.status-list{padding:5px 13px 11px}.status-list li{display:grid;grid-template-columns:auto 1fr;gap:7px;padding:7px 0;border-top:1px solid #eff3f5;font-size:12px}.status-list li:first-child{border-top:0}.status-list small{grid-column:2;color:#718392;font-size:11px}.note{padding:14px;border:1px solid #dce8ee;border-radius:7px;background:#f8fbfc;white-space:pre-wrap;font-size:13px}.source{margin-top:24px;padding:12px 14px;color:#67808f;background:#f6f9fa;border-radius:7px;font-size:11px}.footer{margin-top:28px;color:#81919d;font-size:11px}@media(max-width:760px){body{padding:12px 8px}main{padding:20px 15px}.metrics{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}.history-list li{grid-template-columns:1fr}.handover-list li{grid-template-columns:1fr}.status{justify-self:start}}
</style></head><body><main>
<header class="meta"><p class="eyebrow">HANDOVER REPORT / V0.11</p><h1>${escapeHtml(trainingName)} 인수인계 보고서</h1><p class="muted">생성일 · ${escapeHtml(formatDate(generatedAt))}</p></header>
<h2>현재 상황</h2><div class="panel"><h3>현재 진행구간 · ${escapeHtml(snapshot.currentSection)}</h3><div class="metrics" style="margin-top:14px"><div class="metric"><span>전체 업무</span><strong>${snapshot.stats.total}</strong></div><div class="metric"><span>적용 업무</span><strong>${snapshot.stats.applicable}</strong></div><div class="metric"><span>완료</span><strong>${snapshot.stats.complete}</strong></div><div class="metric"><span>진행중</span><strong>${snapshot.stats.progress}</strong></div><div class="metric"><span>미완료</span><strong>${snapshot.stats.incomplete}</strong></div><div class="metric"><span>해당없음</span><strong>${snapshot.stats.notApplicable}</strong></div></div><div class="metric progress" style="margin-top:9px"><span>전체 진행률</span><strong>${snapshot.stats.percent}%</strong></div></div>
<div class="grid"><section><h2>먼저 확인할 업무</h2><div class="panel">${renderEntries(snapshot.firstItems, '우선 확인할 업무가 없습니다.')}</div></section><section><h2>다음 업무</h2><div class="panel">${nextTask}</div></section></div>
<div class="grid"><section><h2>진행중 업무 전체</h2><div class="panel">${renderEntries(snapshot.inProgress)}</div></section><section><h2>이전 구간 미완료 업무</h2><div class="panel warning">${snapshot.previousIncomplete.length ? renderEntries(snapshot.previousIncomplete) : '<p class="empty">이전 구간 미완료 업무가 없습니다.</p>'}</div></section></div>
<h2>메모가 있는 미완료 업무</h2><div class="panel">${renderEntries(snapshot.memoIncomplete, '메모가 있는 미완료 업무가 없습니다.')}</div>
<h2>최근 처리</h2><div class="panel">${renderHistory(snapshot.recentHistory)}</div>
<h2>종합 인수인계 메모</h2><div class="note">${escapeHtml(note)}</div>
<h2>구간별 진행현황</h2><div>${renderSections(snapshot)}</div>
<h2>전체 체크리스트 상태</h2><div>${renderSections(snapshot)}</div>
<p class="source">체크리스트 원본 · 업무목록.csv · 업무 수 ${snapshot.source.rowCount}건 · key 수 ${snapshot.source.keyCount}개 · 식별 checksum ${snapshot.source.checksum}</p>
<p class="footer">이 문서는 읽기용 인수인계 보고서입니다. 상태 복원과 PC 이동에는 운영데이터 JSON 백업파일을 사용하세요. 업무 메모가 포함될 수 있으므로 외부 공유 전에 내용을 확인하세요.</p>
</main></body></html>`;
}
