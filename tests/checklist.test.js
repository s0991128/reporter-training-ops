import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  CHECKLIST_EXPECTED_COUNTS,
  CHECKLIST_EXPECTED_TOTAL,
  CHECKLIST_SECTION_ORDER,
  CHECKLIST_THREE_CHECK_NOTE,
  filterChecklistItems,
  findChecklistSensitivePatterns,
  getCurrentChecklistSection,
  getChecklistItemState,
  getChecklistStats,
  groupChecklistItems,
  parseChecklistCsv,
  validateChecklistRows
} from '../js/checklist.js';
import { loadState, saveChecklistState } from '../js/storage.js';

const csvText = await fs.readFile(new URL('../업무목록.csv', import.meta.url), 'utf8');
const parsed = parseChecklistCsv(csvText);
const report = validateChecklistRows(parsed.rows, parsed.errors);

assert.equal(report.valid, true, report.errors.join('\n'));
assert.equal(report.total, CHECKLIST_EXPECTED_TOTAL);
assert.equal(report.sections.length, CHECKLIST_SECTION_ORDER.length);
assert.deepEqual(report.sections, CHECKLIST_SECTION_ORDER);
assert.deepEqual(Object.fromEntries(CHECKLIST_SECTION_ORDER.map(section => [section, report.counts[section]])), CHECKLIST_EXPECTED_COUNTS);
assert.deepEqual(report.empty, { section:0, work:0, key:0 });
assert.equal(report.duplicateKeys.length, 0);
assert.equal(report.uniqueKeys, 117);
assert.equal(report.threeCheck, 10);
assert.equal(report.expectedMismatches.length, 0);

const grouped = groupChecklistItems(parsed.rows);
assert.equal(grouped.length, 16);
assert.equal(grouped.reduce((sum, group) => sum + group.items.length, 0), 117);

const quoted = parseChecklistCsv('구간,업무,비고,key\nD-3,"인쇄·제작, 물품 제작, 물품 구매, 버스 임차, 숙박 관련 견적을 요청한다.",,task-quoted');
assert.equal(quoted.errors.length, 0);
assert.equal(quoted.rows[0].work, '인쇄·제작, 물품 제작, 물품 구매, 버스 임차, 숙박 관련 견적을 요청한다.');

const repeated = parseChecklistCsv('구간,업무,비고,key\n1일차,같은 업무,,task-a\n2일차,같은 업무,,task-b');
assert.equal(validateChecklistRows(repeated.rows, repeated.errors).valid, true);
assert.equal(new Set(repeated.rows.map(row => row.key)).size, 2);

const threeCheckItem = { section:'1일차', work:'반복 확인', note:CHECKLIST_THREE_CHECK_NOTE, key:'task-three' };
const standardItem = { section:'1일차', work:'일반 확인', note:'', key:'task-standard' };
let state = { checklist:{} };
assert.equal(getChecklistItemState(threeCheckItem, state).status, 'NOT_STARTED');
state = { checklist:{ 'task-three':{ status:'IN_PROGRESS', completedAt:null, memo:'', checks:[true, false, false] }, 'task-standard':{ status:'COMPLETED', completedAt:'2026-09-03T00:00:00.000Z', memo:'', checks:[] } } };
assert.equal(getChecklistItemState(threeCheckItem, state).status, 'IN_PROGRESS');
assert.equal(getChecklistItemState({ ...threeCheckItem, key:'task-three' }, { checklist:{ 'task-three':{ status:'IN_PROGRESS', completedAt:null, memo:'', checks:[true, true, true] } } }).status, 'COMPLETED');
assert.equal(getChecklistStats([threeCheckItem, standardItem], state).complete, 1);
assert.equal(getChecklistStats([threeCheckItem, standardItem], state).progress, 1);
assert.equal(getCurrentChecklistSection([{ section:'1일차', items:[threeCheckItem, standardItem] }], state), '1일차');
assert.equal(getChecklistStats([{ ...standardItem, key:'task-na' }], { checklist:{ 'task-na':{ status:'NOT_APPLICABLE', completedAt:null, memo:'', checks:[] } } }).percent, 0);
assert.equal(filterChecklistItems([threeCheckItem, standardItem], state, { query:'일반' }).length, 1);
assert.deepEqual(findChecklistSensitivePatterns('담당자 010-1234-5678 확인'), ['전화번호']);
assert.deepEqual(findChecklistSensitivePatterns('contact@example.com'), ['이메일']);

const originalLocalStorage = globalThis.localStorage;
const storedValues = new Map([['trainee-reporter-training-state-v4', JSON.stringify({ version:4, projectId:'reporter-training-ops', settings:{ trainingName:'기존 교육' }, tasks:{ 'PRE-001':{ status:'COMPLETED', completedAt:null, memo:'기존 상태' } }, budget:{ plans:{ TEST:1000 }, transactions:[] } })]]);
globalThis.localStorage = { getItem(key) { return storedValues.get(key) || null; }, setItem(key, value) { storedValues.set(key, value); } };
const migrated = loadState();
assert.equal(migrated.version, 5);
assert.equal(migrated.tasks['PRE-001'].memo, '기존 상태');
assert.equal(migrated.budget.plans.TEST, 1000);
assert.deepEqual(migrated.checklist, {});
const saved = saveChecklistState('task-three', { status:'IN_PROGRESS', checks:[true, false, false], memo:'회신 대기' });
assert.equal(saved.status, 'IN_PROGRESS');
assert.deepEqual(JSON.parse(storedValues.get('trainee-reporter-training-state-v5')).checklist['task-three'].checks, [true, false, false]);
assert.equal(JSON.parse(storedValues.get('trainee-reporter-training-state-v5')).tasks['PRE-001'].memo, '기존 상태');
globalThis.localStorage = originalLocalStorage;

console.log('checklist.test.js: PASS');
