import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const checklistUi = readFileSync(new URL('../js/checklist-ui.js', import.meta.url), 'utf8');

assert.match(html, /data-view="OPERATIONS">교육운영/);
assert.match(html, /<title>수습기자 기본교육 운영<\/title>/);
assert.doesNotMatch(html, /수습기자 기본교육 운영 미니리더/);
assert.match(html, /data-checklist-summary="current"/);
assert.match(html, /data-checklist-summary="percent"/);
assert.match(html, /checklist-kpi-card/);
assert.match(html, /checklist-kpi-label">진행중/);
assert.match(html, /id="settings-button"[^>]*>교육일정/);
assert.match(html, /data-view="BUDGET">예산·정산/);
assert.match(html, /id="management-menu-button"[^>]*>더보기/);
assert.match(html, /id="task-admin-button"[^>]*>업무기준 관리/);
assert.match(html, /id="handover-button"[^>]*data-view="HANDOVER"/);
assert.match(html, /id="gap-analysis-button"[^>]*data-view="GAP"/);
assert.match(html, /id="operations-view"/);
assert.doesNotMatch(html, /<h2 id="checklist-title">교육운영<\/h2>/);
assert.match(html, /class="checklist-current-label"/);
assert.match(html, /class="checklist-meta-line"/);
assert.match(html, /id="task-admin-view"/);
assert.doesNotMatch(html, /id="checklist-button"/);
assert.doesNotMatch(html, /id="dashboard-button"/);
assert.match(app, /function showView\(viewName\)/);
assert.match(checklistUi, /class="checklist-list"/);
assert.match(checklistUi, /checklist-section-block/);
assert.match(checklistUi, /data-checklist-action="toggle-details"/);
assert.match(app, /function renderChecklistSteps/);
assert.match(app, /checklist-step-current/);
assert.match(app, /data-checklist-section-select/);
assert.match(app, /function renderChecklistPrioritySummary/);
assert.match(checklistUi, /다음 구간 미리보기/);

console.log('ux-navigation.test.js passed');
