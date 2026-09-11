import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const checklistUi = readFileSync(new URL('../js/checklist-ui.js', import.meta.url), 'utf8');

assert.match(html, /data-view="OPERATIONS">업무관리/);
assert.match(html, /data-view="HANDOVER">인수인계/);
assert.match(html, /data-view="GAP">AI 누락점검/);
assert.match(html, /data-view="BUDGET">예산·정산/);
assert.match(html, /id="management-menu-button"[^>]*>관리/);
assert.match(html, /id="operations-view"/);
assert.match(html, /id="task-admin-view"/);
assert.doesNotMatch(html, /id="checklist-button"/);
assert.doesNotMatch(html, /id="dashboard-button"/);
assert.match(app, /function showView\(viewName\)/);
assert.match(checklistUi, /class="checklist-list"/);
assert.match(checklistUi, /data-checklist-action="toggle-details"/);

console.log('ux-navigation.test.js passed');
