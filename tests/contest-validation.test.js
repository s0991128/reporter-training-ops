import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createBackup, restoreBackup, validateBackup } from '../js/backup.js';
import {
  CHECKLIST_EXPECTED_TOTAL,
  CHECKLIST_SECTION_ORDER,
  getChecklistItemState,
  getCurrentChecklistSection,
  groupChecklistItems,
  isThreeCheckItem,
  parseChecklistCsv,
  validateChecklistRows
} from '../js/checklist.js';
import { createOperationalTasks, mergeChecklistMetadata, validateChecklistMetadata } from '../js/checklist-metadata.js';
import { getHandoverSnapshot, getHandoverSourceIdentity } from '../js/handover.js';
import { CHECKLIST_STATUS } from '../js/storage.js';

const fixtureUrl = name => new URL(`./fixtures/${name}`, import.meta.url);
const csvText = await fs.readFile(new URL('../업무목록.csv', import.meta.url), 'utf8');
const metadata = JSON.parse(await fs.readFile(new URL('../data/checklist-metadata.json', import.meta.url), 'utf8'));
const fixture = JSON.parse(await fs.readFile(fixtureUrl('contest-handover-state.json'), 'utf8'));
const demoFixture = JSON.parse(await fs.readFile(fixtureUrl('contest-demo-handover-state.json'), 'utf8'));
const futureFixture = JSON.parse(await fs.readFile(fixtureUrl('contest-future-section-state.json'), 'utf8'));
const beforeText = await fs.readFile(fixtureUrl('contest-before-state.txt'), 'utf8');

const parsed = parseChecklistCsv(csvText);
const csvReport = validateChecklistRows(parsed.rows, parsed.errors);
const metadataReport = validateChecklistMetadata(metadata, parsed.rows);
const items = mergeChecklistMetadata(parsed.rows, metadata);
const tasks = createOperationalTasks(items);
const groups = groupChecklistItems(items);
const itemMap = new Map(items.map(item => [item.key, item]));

assert.equal(fixture.synthetic, true);
assert.equal(demoFixture.synthetic, true);
assert.equal(demoFixture.fixtureType, 'clean-demo');
assert.equal(futureFixture.synthetic, true);
assert.equal(csvReport.valid, true, csvReport.errors.join('\n'));
assert.equal(csvReport.total, 117);
assert.equal(csvReport.total, CHECKLIST_EXPECTED_TOTAL);
assert.deepEqual(csvReport.sections, CHECKLIST_SECTION_ORDER);
assert.equal(csvReport.sections.length, 16);
assert.equal(csvReport.uniqueKeys, 117);
assert.equal(csvReport.duplicateKeys.length, 0);
assert.deepEqual(csvReport.empty, { section:0, work:0, key:0 });
assert.equal(csvReport.threeCheck, 10);
assert.equal(csvReport.expectedMismatches.length, 0);
assert.equal(metadataReport.valid, true, metadataReport.errors.join('\n'));

const sourceKeys = new Set(parsed.rows.map(row => row.key));
const metadataKeys = Object.keys(metadata.items);
const metadataOrphans = metadataKeys.filter(key => !sourceKeys.has(key));
const metadataMissing = [...sourceKeys].filter(key => !Object.prototype.hasOwnProperty.call(metadata.items, key));
assert.equal(metadataKeys.length, 117);
assert.equal(metadataOrphans.length, 0);
assert.equal(metadataMissing.length, 0);
assert.equal(items.length, 117);
assert.equal(tasks.length, 117);
assert.deepEqual(getHandoverSourceIdentity(items), { rowCount:117, keyCount:117, checksum:'1e2944ee' });

const workFrequency = Object.fromEntries(items.map(item => [item.work, (items.filter(candidate => candidate.work === item.work).length)]));
const candidatePatterns = {
  conditional:/있는 경우|요청이 있었던 경우|요구한|누락된 경우/,
  privacy:/주민등록번호|전화번호|계좌번호|이메일|개인정보/,
  timing:/최소\s*\d+일차~최대\s*\d+일차|\d+일차~\d+일차|매일|주말/,
  dependency:/완료|확정|수령|퇴실한 후|받는다|받고|전달하고|회수/,
  budget:/견적|구매|결제|세금계산서|정산|지출결의|사례비|인쇄|임차|숙박|경품/
};
const candidateCounts = Object.fromEntries(Object.entries(candidatePatterns).map(([label, pattern]) => [label, items.filter(item => pattern.test(item.work)).length]));
candidateCounts.repeat = items.filter(item => workFrequency[item.work] > 1).length;
const generalCandidateCount = items.filter(item => !Object.entries(candidatePatterns).some(([, pattern]) => pattern.test(item.work)) && workFrequency[item.work] === 1).length;
assert.deepEqual(candidateCounts, { conditional:13, privacy:1, timing:5, dependency:30, budget:21, repeat:48 });
assert.equal(generalCandidateCount, 34);

const state = {
  version:6,
  projectId:'reporter-training-ops',
  settings:{ trainingName:'공모전 synthetic 교육', trainingStartDate:'2026-09-01', trainingEndDate:'2026-09-10', dueSoonDays:3 },
  tasks:{},
  checklist:{},
  checklistHistory:fixture.history,
  handover:{ note:fixture.handoverNote, updatedAt:'2026-09-03T00:05:00.000Z' },
  budget:{ plans:{}, transactions:[] }
};

function putChecklistState(target, key, status, memo = '', checks = []) {
  assert.ok(itemMap.has(key), `Unknown fixture key: ${key}`);
  target.checklist[key] = {
    status,
    completedAt:status === CHECKLIST_STATUS.COMPLETED ? '2026-09-03T00:00:00.000Z' : null,
    updatedAt:'2026-09-03T00:05:00.000Z',
    memo,
    checks
  };
}

fixture.completed.forEach(key => putChecklistState(state, key, CHECKLIST_STATUS.COMPLETED, '', isThreeCheckItem(itemMap.get(key)) ? [true, true, true] : []));
fixture.inProgress.forEach(entry => putChecklistState(state, entry.key, CHECKLIST_STATUS.IN_PROGRESS, entry.memo, entry.checks || []));
fixture.unfinished.forEach(entry => putChecklistState(state, entry.key, CHECKLIST_STATUS.NOT_STARTED, entry.memo || '', []));
fixture.notApplicable.forEach(key => putChecklistState(state, key, CHECKLIST_STATUS.NOT_APPLICABLE, '', []));

const fixtureKeys = [
  ...fixture.completed,
  ...fixture.inProgress.map(entry => entry.key),
  ...fixture.unfinished.map(entry => entry.key),
  ...fixture.notApplicable
];
assert.equal(new Set(fixtureKeys).size, fixtureKeys.length);
assert.equal(fixture.completed.length, 39);
assert.equal(fixture.inProgress.length, 3);
assert.equal(fixture.unfinished.length, 2);
assert.equal(fixture.notApplicable.length, 2);
assert.equal(Object.values(state.checklist).filter(entry => entry.status === CHECKLIST_STATUS.COMPLETED).length, 39);

const snapshot = getHandoverSnapshot(items, groups, state, { historyLimit:10 });
assert.equal(snapshot.currentSection, '2일차(글쓰기 이론)');
assert.deepEqual(snapshot.stats, { total:117, applicable:115, complete:39, progress:3, notStarted:73, incomplete:76, notApplicable:2, percent:34 });
assert.deepEqual(snapshot.previousIncomplete.map(entry => entry.item.key), ['task-10', 'task-11']);
assert.deepEqual(snapshot.inProgress.map(entry => entry.item.key), ['task-37', 'task-38', 'task-39']);
assert.deepEqual(snapshot.memoIncomplete.map(entry => entry.item.key), ['task-10', 'task-37', 'task-38', 'task-39']);
assert.equal(snapshot.nextTask, null);
assert.deepEqual(snapshot.recentHistory.map(entry => entry.taskKey), ['task-37', 'task-37', 'task-38', 'task-37', 'task-10']);
const priorityKeys = new Set(snapshot.firstItems.map(entry => entry.item.key));
['task-10', 'task-11', 'task-37', 'task-38', 'task-39'].forEach(key => assert.ok(priorityKeys.has(key), `Missing handover priority: ${key}`));

const demoState = structuredClone(state);
demoState.checklist = {};
demoState.checklistHistory = demoFixture.history;
demoState.handover = { note:demoFixture.handoverNote, updatedAt:'2026-09-03T00:05:00.000Z' };
demoFixture.completed.forEach(key => putChecklistState(demoState, key, CHECKLIST_STATUS.COMPLETED, '', isThreeCheckItem(itemMap.get(key)) ? [true, true, true] : []));
demoFixture.inProgress.forEach(entry => putChecklistState(demoState, entry.key, CHECKLIST_STATUS.IN_PROGRESS, entry.memo, entry.checks || []));
demoFixture.unfinished.forEach(entry => putChecklistState(demoState, entry.key, CHECKLIST_STATUS.NOT_STARTED, entry.memo || '', []));
demoFixture.notApplicable.forEach(key => putChecklistState(demoState, key, CHECKLIST_STATUS.NOT_APPLICABLE, '', []));

const demoSnapshot = getHandoverSnapshot(items, groups, demoState, { historyLimit:10 });
assert.equal(getChecklistItemState(itemMap.get('task-10'), demoState).status, CHECKLIST_STATUS.NOT_STARTED);
assert.equal(demoState.checklistHistory.some(entry => entry.taskKey === 'task-10'), false);
assert.equal(demoSnapshot.currentSection, demoFixture.expected.currentSection);
assert.equal(demoSnapshot.stats.percent, demoFixture.expected.progressPercent);
assert.deepEqual(demoSnapshot.previousIncomplete.map(entry => entry.item.key), demoFixture.expected.previousIncomplete);
assert.deepEqual(demoSnapshot.inProgress.map(entry => entry.item.key), demoFixture.expected.inProgress);
assert.deepEqual(demoSnapshot.memoIncomplete.map(entry => entry.item.key), demoFixture.expected.memoIncomplete);
assert.deepEqual(demoSnapshot.firstItems.slice(0, 3).map(entry => entry.item.key), demoFixture.expected.topThree);

const currentIndex = snapshot.currentSectionIndex;
const nextThree = groups.slice(currentIndex + 1).flatMap(group => group.items)
  .filter(item => getChecklistItemState(item, state).status !== CHECKLIST_STATUS.NOT_APPLICABLE)
  .slice(0, 3)
  .map(item => item.key);
assert.deepEqual(nextThree, ['task-42', 'task-43', 'task-44']);

const futureState = {
  ...state,
  checklist:{
    'task-42':{ status:CHECKLIST_STATUS.COMPLETED, completedAt:'2026-09-03T00:00:00.000Z', updatedAt:'2026-09-03T00:00:00.000Z', memo:'', checks:[true, true, true] },
    'task-113':{ status:CHECKLIST_STATUS.NOT_STARTED, completedAt:null, updatedAt:null, memo:'', checks:[] }
  },
  checklistHistory:[],
  handover:{ note:'', updatedAt:null }
};
assert.equal(futureFixture.completed[0], 'task-42');
assert.equal(futureFixture.unfinished[0], 'task-113');
assert.equal(getCurrentChecklistSection(groups, futureState), '3일차');

const backup = createBackup(state, new Date('2026-09-03T01:35:00.000Z'));
assert.equal(validateBackup(backup, tasks).valid, true);
const restored = restoreBackup(backup, tasks);
assert.equal(restored.success, true);
assert.deepEqual(restored.state.checklist, state.checklist);
assert.deepEqual(restored.state.checklistHistory, state.checklistHistory);
assert.deepEqual(restored.state.handover, state.handover);
assert.deepEqual(restored.state.settings, state.settings);

assert.match(beforeText, /SYNTHETIC PROXY BENCHMARK/);
assert.match(beforeText, /NOT_APPLICABLE/);
assert.match(beforeText, /checks=1\/3/);
assert.doesNotMatch(beforeText, /\b\d{6}[-\s]?\d{7}\b/);
assert.doesNotMatch(beforeText, /\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/);
assert.doesNotMatch(beforeText, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);

console.log(JSON.stringify({
  contestValidation:'PASS',
  source:{ rows:csvReport.total, sections:csvReport.sections.length, threeCheck:csvReport.threeCheck, keyCount:csvReport.uniqueKeys, checksum:getHandoverSourceIdentity(items).checksum },
  metadata:{ keys:metadataKeys.length, orphan:metadataOrphans.length, missing:metadataMissing.length },
  structuralErrors:0,
  candidates:{ general:generalCandidateCount, ...candidateCounts },
  syntheticHandover:{ completed:39, inProgress:3, previousIncomplete:2, memoIncomplete:4, notApplicable:2, progressPercent:snapshot.stats.percent, currentSection:snapshot.currentSection, nextTask:snapshot.nextTask?.item?.key || null, nextThree },
  futureSectionObserved:getCurrentChecklistSection(groups, futureState),
  backupRestoreFidelity:100
}));
