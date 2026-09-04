import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { loadChecklist } from '../js/checklist.js';
import { getHandoverSnapshot, getHandoverSourceIdentity } from '../js/handover.js';
import { buildHandoverReportHtml, getHandoverReportFilename } from '../js/handover-export.js';
import { CHECKLIST_STATUS, loadState, saveChecklistState, saveHandoverNote } from '../js/storage.js';

const csvText = await fs.readFile(new URL('../업무목록.csv', import.meta.url), 'utf8');
const csvUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(csvText)}`;
const checklist = await loadChecklist(csvUrl);
const state = { version:6, projectId:'reporter-training-ops', settings:{ trainingName:'테스트 교육' }, tasks:{}, checklist:{}, checklistHistory:[], handover:{ note:'', updatedAt:null }, budget:{ plans:{}, transactions:[] } };
const firstGroup = checklist.groups[0];
const secondGroup = checklist.groups[1];
const firstTask = firstGroup.items[0];
const secondTask = secondGroup.items[0];

assert.deepEqual(getHandoverSourceIdentity(checklist.items), { rowCount:117, keyCount:117, checksum:getHandoverSourceIdentity(checklist.items).checksum });
let snapshot = getHandoverSnapshot(checklist.items, checklist.groups, state);
assert.equal(snapshot.currentSection, 'D-30 ~ D-25');
assert.deepEqual(snapshot.stats, { total:117, applicable:117, complete:0, progress:0, notStarted:117, incomplete:117, notApplicable:0, percent:0 });
assert.equal(snapshot.nextTask.item.key, firstTask.key);

state.checklist[firstGroup.items[0].key] = { status:CHECKLIST_STATUS.COMPLETED, completedAt:'2026-09-03T00:00:00.000Z', updatedAt:null, memo:'', checks:[] };
state.checklist[firstGroup.items[1].key] = { status:CHECKLIST_STATUS.COMPLETED, completedAt:'2026-09-03T00:00:00.000Z', updatedAt:null, memo:'', checks:[] };
snapshot = getHandoverSnapshot(checklist.items, checklist.groups, state);
assert.equal(snapshot.currentSection, secondGroup.section);
assert.equal(snapshot.nextTask.item.key, secondTask.key);

for (const group of checklist.groups.slice(1, 5)) {
  for (const item of group.items) state.checklist[item.key] = { status:CHECKLIST_STATUS.COMPLETED, completedAt:'2026-09-03T00:00:00.000Z', updatedAt:null, memo:'', checks:[] };
}
delete state.checklist[firstTask.key];
state.checklist[checklist.groups[5].items[0].key] = { status:CHECKLIST_STATUS.COMPLETED, completedAt:'2026-09-03T00:00:00.000Z', updatedAt:null, memo:'', checks:[] };
snapshot = getHandoverSnapshot(checklist.items, checklist.groups, state);
assert.equal(snapshot.currentSection, checklist.groups[5].section);
assert.equal(snapshot.previousIncomplete.length, 1);
assert.equal(snapshot.firstItems.filter(entry => entry.item.key === firstTask.key).length, 1);

state.checklist[secondTask.key] = { status:CHECKLIST_STATUS.IN_PROGRESS, completedAt:null, updatedAt:'2026-09-03T01:00:00.000Z', memo:'업체 회신 대기', checks:[] };
snapshot = getHandoverSnapshot(checklist.items, checklist.groups, state);
assert.equal(snapshot.inProgress.some(entry => entry.item.key === secondTask.key), true);
assert.equal(snapshot.memoIncomplete.some(entry => entry.item.key === secondTask.key), true);
assert.equal(snapshot.firstItems.filter(entry => entry.item.key === secondTask.key).length, 1);

const originalLocalStorage = globalThis.localStorage;
const storedValues = new Map();
globalThis.localStorage = { getItem(key) { return storedValues.get(key) || null; }, setItem(key, value) { storedValues.set(key, value); } };
const savedState = loadState();
assert.equal(savedState.version, 6);
const savedEntry = saveChecklistState('task-history', { status:CHECKLIST_STATUS.IN_PROGRESS, memo:'확인 필요', checks:[] });
assert.ok(savedEntry.updatedAt);
let stored = loadState();
assert.equal(stored.checklistHistory.length, 2);
assert.equal(stored.checklistHistory.some(entry => entry.type === 'STATUS_CHANGED'), true);
assert.equal(stored.checklistHistory.some(entry => entry.type === 'MEMO_UPDATED'), true);
saveHandoverNote('다음 담당자가 확인할 메모');
stored = loadState();
assert.equal(stored.handover.note, '다음 담당자가 확인할 메모');
assert.ok(stored.handover.updatedAt);
for (let index = 0; index < 210; index += 1) saveChecklistState('task-history', { status:index % 2 ? CHECKLIST_STATUS.NOT_STARTED : CHECKLIST_STATUS.IN_PROGRESS, memo:'' });
assert.equal(loadState().checklistHistory.length, 200);
globalThis.localStorage = originalLocalStorage;

const reportHtml = buildHandoverReportHtml(checklist.items, checklist.groups, { ...state, handover:{ note:'다음 담당자 메모', updatedAt:null } }, new Date('2026-09-03T06:42:00.000Z'));
assert.match(reportHtml, /HANDOVER REPORT \/ V0\.11/);
assert.match(reportHtml, /업무목록\.csv/);
assert.match(reportHtml, /117건/);
assert.match(reportHtml, /다음 담당자 메모/);
assert.match(getHandoverReportFilename(new Date('2026-09-03T06:42:00.000Z')), /수습기자_기본교육_인수인계_2026-09-03\.html/);

console.log('handover.test.js: PASS');
