import assert from 'node:assert/strict';
import {
  getBudgetSummary,
  getCategoryAvailableAmount,
  getPendingSettlementAmount,
  getPendingSettlementTransactions,
  getTotalAvailableAmount,
  getTotalCommittedAmount,
  getTotalPaidAmount,
  validateTransaction
} from '../js/budget.js';

const categories = [
  { id: 'LECTURER', name: '강사료', active: true, sortOrder: 10 },
  { id: 'ETC', name: '기타', active: true, sortOrder: 999 }
];
const tasks = [{ id: 'FIN-003', title: '교육비 정산' }];
const budget = {
  plans: { LECTURER: 8_000_000 },
  transactions: [
    { id: 'TX-0001', categoryId: 'LECTURER', amount: 1_000_000, status: 'COMMITTED', date: '2026-11-01', description: '확정 강사료', settlementStatus: 'NOT_REQUIRED' },
    { id: 'TX-0002', categoryId: 'LECTURER', amount: 2_000_000, status: 'PAID', date: '2026-11-02', description: '지급 강사료', taskId: 'FIN-003', settlementStatus: 'PENDING' },
    { id: 'TX-0003', categoryId: 'LECTURER', amount: 1_000_000, status: 'CANCELLED', date: '2026-11-03', description: '취소 강사료', settlementStatus: 'NOT_REQUIRED' }
  ]
};

assert.equal(getTotalCommittedAmount(budget), 1_000_000);
assert.equal(getTotalPaidAmount(budget), 2_000_000);
assert.equal(getTotalAvailableAmount(budget), 5_000_000);
assert.equal(getCategoryAvailableAmount(budget, 'LECTURER'), 5_000_000);
assert.equal(getPendingSettlementTransactions(budget).length, 1);
assert.equal(getPendingSettlementAmount(budget), 2_000_000);
assert.deepEqual(getBudgetSummary(budget, categories), {
  totalPlanned: 8_000_000,
  totalCommitted: 1_000_000,
  totalPaid: 2_000_000,
  totalAvailable: 5_000_000,
  executionRate: 25,
  pendingSettlementCount: 1,
  pendingSettlementAmount: 2_000_000,
  isOverBudget: false,
  overBudgetAmount: 0,
  byCategory: [
    { categoryId: 'LECTURER', planned: 8_000_000, committed: 1_000_000, paid: 2_000_000, available: 5_000_000 },
    { categoryId: 'ETC', planned: 0, committed: 0, paid: 0, available: 0 }
  ]
});

const overrun = { plans: { LECTURER: 1_000_000 }, transactions: budget.transactions.slice(1, 2) };
assert.equal(getBudgetSummary(overrun).isOverBudget, true);
assert.equal(getBudgetSummary(overrun).overBudgetAmount, 1_000_000);
assert.equal(getBudgetSummary({ plans: {}, transactions: [] }).executionRate, 0);

assert.equal(validateTransaction({
  categoryId: 'LECTURER', amount: 1000, status: 'PAID', date: '2026-11-04', description: '검증용', settlementStatus: 'COMPLETED', taskId: 'FIN-003'
}, categories, tasks).valid, true);
assert.equal(validateTransaction({
  categoryId: 'UNKNOWN', amount: -1, status: 'INVALID', date: '2026-02-30', description: '', settlementStatus: 'PENDING', taskId: 'MISSING'
}, categories, tasks).valid, false);

console.log('budget.test.js: PASS');
