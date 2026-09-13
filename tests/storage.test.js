import assert from 'node:assert/strict';
import { restoreBackup, resetAllUserData, validateBackup } from '../js/backup.js';
import { CHECKLIST_STATUS, DEFAULT_SETTINGS, PROJECT_ID, STORAGE_KEY, STORAGE_VERSION, loadState, saveBudgetPlans, saveChecklistState, saveHandoverNote, saveSettings } from '../js/storage.js';

const originalLocalStorage = globalThis.localStorage;

function installStorage(entries = []) {
  const values = new Map(entries);
  globalThis.localStorage = {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
  return values;
}

function createLegacyState(overrides = {}) {
  return {
    version:6,
    projectId:PROJECT_ID,
    settings:{ ...DEFAULT_SETTINGS },
    tasks:{},
    checklist:{},
    checklistHistory:[],
    handover:{ note:'', updatedAt:null },
    budget:{ plans:{}, transactions:[] },
    ...overrides
  };
}

function assertCleanV7State(state) {
  assert.equal(state.version, STORAGE_VERSION);
  assert.equal(state.projectId, PROJECT_ID);
  assert.deepEqual(state.settings, DEFAULT_SETTINGS);
  assert.deepEqual(state.tasks, {});
  assert.deepEqual(state.checklist, {});
  assert.deepEqual(state.checklistHistory, []);
  assert.deepEqual(state.handover, { note:'', updatedAt:null });
  assert.deepEqual(state.budget, { plans:{}, transactions:[] });
}

const legacyCases = [
  createLegacyState({ checklist:{ 'task-1':{ status:CHECKLIST_STATUS.COMPLETED, completedAt:'2026-09-01T00:00:00.000Z', updatedAt:null, memo:'완료 테스트', checks:[] } } }),
  createLegacyState({ settings:{ trainingName:'기존 교육', trainingStartDate:'2026-09-01', trainingEndDate:'2026-09-05', dueSoonDays:7 } }),
  createLegacyState({ budget:{ plans:{ LECTURER:1000 }, transactions:[] } }),
  createLegacyState({ handover:{ note:'기존 인수인계 메모', updatedAt:'2026-09-01T00:00:00.000Z' } })
];

legacyCases.forEach((legacyState, index) => {
  const values = installStorage([['trainee-reporter-training-state-v6', JSON.stringify(legacyState)]]);
  const state = loadState();
  assertCleanV7State(state);
  assert.equal(values.get('trainee-reporter-training-state-v6'), JSON.stringify(legacyState));
  assert.ok(values.get(STORAGE_KEY), `legacy case ${index + 1} must write a v7 state`);
});

let values = installStorage();
let state = loadState();
saveChecklistState('task-1', { status:CHECKLIST_STATUS.IN_PROGRESS, memo:'진행 확인', checks:[] });
state = loadState();
assert.equal(state.checklist['task-1'].status, CHECKLIST_STATUS.IN_PROGRESS);
assert.equal(state.checklist['task-1'].memo, '진행 확인');

saveChecklistState('task-2', { status:CHECKLIST_STATUS.COMPLETED, completedAt:'2026-09-02T00:00:00.000Z', memo:'완료 메모', checks:[] });
saveBudgetPlans({ LECTURER:8000000 });
saveSettings({ trainingName:'수습기자 기본교육', trainingStartDate:'2026-09-01', trainingEndDate:'2026-09-10', dueSoonDays:5 });
saveHandoverNote('다음 담당자 확인 메모');
state = loadState();
assert.equal(state.version, STORAGE_VERSION);
assert.equal(state.checklist['task-2'].status, CHECKLIST_STATUS.COMPLETED);
assert.equal(state.checklist['task-2'].memo, '완료 메모');
assert.equal(state.budget.plans.LECTURER, 8000000);
assert.equal(state.settings.trainingName, '수습기자 기본교육');
assert.equal(state.handover.note, '다음 담당자 확인 메모');
assert.ok(values.get(STORAGE_KEY));

const v6Backup = {
  backupVersion:1,
  application:PROJECT_ID,
  applicationVersion:'0.14',
  exportedAt:'2026-09-03T00:00:00.000Z',
  data:createLegacyState({
    tasks:{ 'PRE-001':{ status:'COMPLETED', completedAt:'2026-09-01T00:00:00.000Z', memo:'수동 복원' } },
    checklist:{ 'task-1':{ status:CHECKLIST_STATUS.IN_PROGRESS, completedAt:null, updatedAt:'2026-09-02T00:00:00.000Z', memo:'체크리스트 복원', checks:[] } },
    handover:{ note:'복원된 메모', updatedAt:'2026-09-02T00:00:00.000Z' },
    budget:{ plans:{ LECTURER:2000 }, transactions:[] }
  })
};
assert.equal(validateBackup(v6Backup, [{ id:'PRE-001' }]).valid, true);
const restored = restoreBackup(v6Backup, [{ id:'PRE-001' }]);
assert.equal(restored.success, true);
assert.equal(restored.state.version, STORAGE_VERSION);
assert.equal(restored.state.tasks['PRE-001'].memo, '수동 복원');
assert.equal(loadState().handover.note, '복원된 메모');

const reset = resetAllUserData();
assertCleanV7State(reset);
assertCleanV7State(loadState());

globalThis.localStorage = originalLocalStorage;
console.log('storage.test.js: PASS');
