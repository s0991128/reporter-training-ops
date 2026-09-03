import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PHASES, PHASE_PREFIXES } from '../js/constants.js';
import { csvRowsToTasks, parseCsv, tasksToCsv } from '../js/csv.js';
import { getDataQualityMetrics, getQualityWarnings, getValidationReport } from '../js/data-quality.js';
import { createBlankTask, createTaskAdminSession, commitAdminEdit, filterAdminTasks, getTimingLabel, removeAdminTask, startAdminEdit, suggestNextTaskId, validateAdminEdit } from '../js/task-admin.js';
import { loadState, reconcileTaskStates } from '../js/storage.js';

const tasks = JSON.parse(await fs.readFile(new URL('../data/tasks.json', import.meta.url), 'utf8'));
const validation = getValidationReport(tasks);
assert.equal(tasks.length, 20);
assert.equal(validation.valid, true, validation.errors.join('\n'));
assert.deepEqual(Object.fromEntries(PHASES.map(phase => [phase, tasks.filter(task => task.phase === phase).length])), {
  사전준비:6, 교육운영:6, 종료처리:2, 정산:3, 결과보고:3
});
assert.equal(new Set(tasks.map(task => task.id)).size, 20);
tasks.forEach(task => {
  const prefix = task.id.split('-')[0];
  assert.equal(PHASE_PREFIXES[prefix], task.phase);
  assert.ok(Array.isArray(task.completionCriteria));
  assert.ok(Array.isArray(task.dependencies));
  assert.ok(typeof task.sortOrder === 'number');
});

const csv = tasksToCsv(tasks);
assert.match(csv, /^\uFEFFid,phase,timing_type/);
const roundTrip = csvRowsToTasks(parseCsv(csv));
assert.equal(roundTrip.errors.length, 0);
assert.deepEqual(roundTrip.tasks, tasks);
const quoted = JSON.parse(JSON.stringify(tasks));
quoted[0].title = '쉼표, 줄바꿈 테스트';
quoted[0].description = '첫 줄 설명\n둘째 줄 설명';
quoted[0].handover.caution = '따옴표 "와 쉼표, 포함';
assert.deepEqual(csvRowsToTasks(parseCsv(tasksToCsv(quoted))).tasks[0], quoted[0]);

assert.equal(validateAdminEdit(tasks, { ...tasks[0], title:'중복 ID' }).valid, false);
assert.equal(getValidationReport([{ ...tasks[0], phase:'교육운영' }]).valid, false);
assert.equal(getValidationReport([{ ...tasks[0], id:'OPS-999' }]).valid, false);
assert.equal(getValidationReport([{ ...tasks[0], dependencies:['PRE-999'] }]).valid, false);
assert.equal(getValidationReport([{ ...tasks[0], dependencies:['PRE-001'] }]).valid, false);
assert.match(getValidationReport([
  { ...tasks[0], dependencies:['PRE-002'] },
  { ...tasks[1], dependencies:['PRE-001'] }
]).errors.join('\n'), /Dependency cycle/);

const warningTask = { ...tasks[0], description:'짧음', required:true, completionCriteria:[], riskLevel:'HIGH', assigneeRole:'', budget:{ related:true, category:null }, aiCheck:{ enabled:true, keywords:[] }, handover:{ caution:'', knowhow:'', previousIssue:'' } };
const warnings = getQualityWarnings([warningTask]);
assert.ok(warnings.some(warning => warning.type === 'REQUIRED_NO_CRITERIA'));
assert.ok(warnings.some(warning => warning.type === 'HIGH_NO_ASSIGNEE'));
assert.ok(warnings.some(warning => warning.type === 'BUDGET_NO_CATEGORY'));
assert.equal(getDataQualityMetrics(tasks).every(metric => metric.percent === 100), true);

assert.equal(suggestNextTaskId(tasks, '사전준비'), 'PRE-007');
assert.equal(getTimingLabel('D_DAY', -7), 'D-7');
assert.equal(getTimingLabel('TRAINING_DAY', 2), '교육 2일차');
const session = createTaskAdminSession(tasks);
startAdminEdit(session, 'PRE-001');
const edited = { ...session.draft, title:'수정된 업무명' };
assert.equal(commitAdminEdit(session, edited, 'PRE-001').success, true);
assert.equal(session.tasks.find(task => task.id === 'PRE-001').title, '수정된 업무명');
const newTask = createBlankTask(session.tasks, '결과보고');
assert.equal(newTask.id, 'RPT-004');
assert.equal(removeAdminTask(tasks, 'PRE-001').success, false);
const inactive = { ...tasks[19], active:false };
assert.equal(filterAdminTasks([...tasks.slice(0, 19), inactive]).length, 19);
assert.equal(filterAdminTasks([...tasks.slice(0, 19), inactive], { showInactive:true }).length, 20);

const state = { version:4, projectId:'reporter-training-ops', tasks:{ 'PRE-001':{ status:'COMPLETED', completedAt:'2026-09-01T00:00:00.000Z', memo:'유지' }, 'OLD-001':{ status:'COMPLETED', completedAt:null, memo:'' } } };
const reconciled = reconcileTaskStates(state, [{ id:'PRE-001' }, { id:'PRE-007' }]);
assert.deepEqual(Object.keys(reconciled.tasks), ['PRE-001']);
assert.equal(reconciled.tasks['PRE-001'].memo, '유지');

const originalLocalStorage = globalThis.localStorage;
const storedValues = new Map([['trainee-reporter-training-state-v3', JSON.stringify({ version:3, projectId:'reporter-training-ops', settings:{ trainingName:'이전 교육' }, tasks:{ 'PRE-001':{ completed:true, completedAt:'2026. 9. 1.', memo:'이전 메모' } } })]]);
globalThis.localStorage = { getItem(key) { return storedValues.get(key) || null; }, setItem(key, value) { storedValues.set(key, value); } };
const migrated = loadState();
assert.equal(migrated.version, 5);
assert.equal(migrated.tasks['PRE-001'].status, 'COMPLETED');
assert.equal(migrated.tasks['PRE-001'].memo, '이전 메모');
assert.equal(JSON.parse(storedValues.get('trainee-reporter-training-state-v5')).tasks['PRE-001'].title, undefined);
globalThis.localStorage = originalLocalStorage;

const preview = (await import('../js/task-admin.js')).buildCsvImportPreview(csv);
assert.equal(preview.validTasks.length, 20);
assert.equal(preview.errors.length, 0);
console.log('task-master.test.js: PASS');
