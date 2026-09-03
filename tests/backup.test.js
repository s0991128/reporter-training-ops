import assert from 'node:assert/strict';
import {
  APPLICATION_VERSION,
  BACKUP_VERSION,
  createBackup,
  exportBackup,
  generateBackupFilename,
  previewBackup,
  validateBackup
} from '../js/backup.js';

const state = {
  version: 4,
  projectId: 'reporter-training-ops',
  settings: { trainingName: '테스트 교육', trainingStartDate: '2026-09-01', trainingEndDate: '2026-09-10', dueSoonDays: 3 },
  tasks: {
    'PRE-001': { status: 'COMPLETED', completedAt: '2026-09-01T01:02:03.000Z', memo: '인수인계 메모' },
    'PRE-002': { status: 'IN_PROGRESS', completedAt: null, memo: '' }
  },
  budget: {
    plans: { LECTURER: 8_000_000 },
    transactions: [{ id: 'TX-0001', categoryId: 'LECTURER', amount: 800_000, status: 'PAID', date: '2026-09-03', description: '강의 운영비', taskId: 'PRE-002', settlementStatus: 'PENDING', memo: '증빙 확인', createdAt: '2026-09-03T01:00:00.000Z', updatedAt: '2026-09-03T01:00:00.000Z' }]
  }
};
const tasks = [{ id: 'PRE-001' }, { id: 'PRE-002' }];
const backup = createBackup(state, new Date('2026-09-03T01:35:00.000Z'));

assert.equal(backup.backupVersion, BACKUP_VERSION);
assert.equal(backup.application, 'reporter-training-ops');
assert.equal(backup.applicationVersion, APPLICATION_VERSION);
assert.equal(backup.data.tasks['PRE-001'].title, undefined);
assert.equal(validateBackup(backup, tasks).valid, true);
const preview = previewBackup(backup, tasks);
assert.equal(preview.valid, true);
assert.equal(preview.exportedAt, '2026-09-03T01:35:00.000Z');
assert.match(preview.exportedAtLabel, /2026.*9.*3.*10:35/);
assert.equal(preview.trainingName, '테스트 교육');
assert.equal(preview.taskCount, 2);
assert.equal(preview.completedCount, 1);
assert.equal(preview.categoryCount, 1);
assert.equal(preview.transactionCount, 1);

let clicked = false;
let downloadedJson = '';
globalThis.localStorage = { getItem() { return null; }, setItem() {} };
globalThis.document = {
  body: { appendChild() {} },
  createElement() { return { style: {}, click() { clicked = true; }, remove() {} }; }
};
globalThis.Blob = class MockBlob {
  constructor(parts) { downloadedJson = parts.join(''); }
};
globalThis.URL = { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} };
const exported = exportBackup(state);
assert.equal(exported.downloaded, true);
assert.equal(clicked, true);
assert.equal(JSON.parse(downloadedJson).data.budget.transactions[0].amount, 800_000);
assert.match(exported.filename, /^reporter-training-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);

assert.match(generateBackupFilename(new Date(2026, 8, 3, 10, 5)), /^reporter-training-backup-2026-09-03-1005\.json$/);
assert.equal(validateBackup({ ...backup, application: 'other-app' }, tasks).valid, false);
assert.equal(validateBackup({ ...backup, data: null }, tasks).valid, false);
assert.equal(validateBackup({ ...backup, data: { ...backup.data, version: 7 } }, tasks).valid, false);
assert.equal(validateBackup({ ...backup, data: { ...backup.data, tasks: { ...backup.data.tasks, 'PRE-999': { status: 'COMPLETED', memo: '' } } } }, tasks).warnings.length, 1);
assert.equal(validateBackup({ ...backup, data: { ...backup.data, budget: { plans: {}, transactions: 'invalid' } } }, tasks).valid, false);
assert.equal(validateBackup({ ...backup, data: { ...backup.data, accountNumber: 'not allowed' } }, tasks).valid, false);

const oldBackup = { ...backup, data: { version: 3, projectId: 'reporter-training-ops', settings: state.settings, tasks: state.tasks } };
assert.equal(validateBackup(oldBackup, tasks).valid, true);

console.log('backup.test.js: PASS');
