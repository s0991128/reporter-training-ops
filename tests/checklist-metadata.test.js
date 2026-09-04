import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseChecklistCsv } from '../js/checklist.js';
import { createOperationalTasks, mergeChecklistMetadata, validateChecklistMetadata } from '../js/checklist-metadata.js';
import { handleTaskEvent } from '../js/tasks.js';
import { getTaskState, loadState } from '../js/storage.js';

const csv = await readFile(new URL('../업무목록.csv', import.meta.url), 'utf8');
const metadata = JSON.parse(await readFile(new URL('../data/checklist-metadata.json', import.meta.url), 'utf8'));
const parsed = parseChecklistCsv(csv);
const report = validateChecklistMetadata(metadata, parsed.rows);

assert.equal(report.valid, true, report.errors.join('\n'));
assert.equal(Object.keys(metadata.items).length, 117);
const items = mergeChecklistMetadata(parsed.rows, metadata);
const tasks = createOperationalTasks(items);
assert.equal(items.length, 117);
assert.equal(tasks.length, 117);
assert.equal(new Set(tasks.map(task => task.id)).size, 117);
assert.equal(tasks[0].id, 'task-113');
assert.equal(tasks[0].title, '수습기자 기본교육 일정을 작성하여 보고한다.');
assert.equal(tasks.find(task => task.id === 'task-94').phase, '종료처리');
assert.equal(tasks.find(task => task.id === 'task-97').phase, '정산');
assert.equal(tasks.find(task => task.id === 'task-95').phase, '결과보고');
assert.equal(tasks.find(task => task.id === 'task-2').metadataReviewStatus, 'PENDING_REVIEW');
assert.equal(tasks.find(task => task.id === 'task-2').required, null);
assert.equal(tasks.find(task => task.id === 'task-38').conditional, true);
assert.equal(tasks.every(task => task.sourceKey === task.id && task.metadataReviewStatus === 'PENDING_REVIEW'), true);

const originalLocalStorage = globalThis.localStorage;
const storedValues = new Map();
globalThis.localStorage = { getItem(key) { return storedValues.get(key) || null; }, setItem(key, value) { storedValues.set(key, value); } };
const state = loadState();
const card = { dataset:{ taskId:'task-1' }, querySelector() { return null; } };
const completionEvent = { type:'change', target:{ dataset:{ action:'complete' }, checked:true, closest() { return card; } } };
handleTaskEvent(completionEvent, state, () => {}, [{ id:'task-1', dependencies:[] }]);
assert.equal(getTaskState(state, 'task-1').status, 'COMPLETED');
assert.equal(state.tasks['task-1'], undefined);
assert.equal(JSON.parse(storedValues.get('trainee-reporter-training-state-v6')).tasks['task-1'], undefined);
const memoEvent = { type:'input', target:{ dataset:{ action:'memo-input' }, value:'회신 대기', closest() { return card; } } };
handleTaskEvent(memoEvent, state, () => {}, [{ id:'task-1', dependencies:[] }]);
assert.equal(getTaskState(state, 'task-1').memo, '회신 대기');
assert.equal(JSON.parse(storedValues.get('trainee-reporter-training-state-v6')).tasks['task-1'], undefined);
globalThis.localStorage = originalLocalStorage;

console.log('checklist-metadata.test.js: PASS');
