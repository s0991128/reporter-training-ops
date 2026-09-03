export const TRANSACTION_STATUS = Object.freeze({ PLANNED:'PLANNED', COMMITTED:'COMMITTED', PAID:'PAID', CANCELLED:'CANCELLED' });
export const SETTLEMENT_STATUS = Object.freeze({ NOT_REQUIRED:'NOT_REQUIRED', PENDING:'PENDING', COMPLETED:'COMPLETED' });
const TRANSACTION_STATUS_VALUES = Object.values(TRANSACTION_STATUS);
const SETTLEMENT_STATUS_VALUES = Object.values(SETTLEMENT_STATUS);

function getBudget(source = {}) { return source?.budget && typeof source.budget === 'object' ? source.budget : source || {}; }
function getPlans(source) { const plans = getBudget(source).plans; return plans && typeof plans === 'object' && !Array.isArray(plans) ? plans : {}; }
function getTransactions(source) { return Array.isArray(getBudget(source).transactions) ? getBudget(source).transactions : []; }
function isValidAmount(amount) { return amount !== '' && amount !== null && amount !== undefined && Number.isInteger(Number(amount)) && Number(amount) >= 0; }
function countableTransactions(source) { return getTransactions(source).filter(transaction => transaction.status !== TRANSACTION_STATUS.CANCELLED && isValidAmount(transaction.amount)); }
function sumAmounts(transactions) { return transactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0); }

export function getTotalPlannedBudget(source = {}) { return Object.values(getPlans(source)).filter(isValidAmount).reduce((sum, amount) => sum + Number(amount), 0); }
export function getCategoryPlannedBudget(source, categoryId) { return isValidAmount(getPlans(source)[categoryId]) ? Number(getPlans(source)[categoryId]) : 0; }
export function getCategoryCommittedAmount(source, categoryId) { return sumAmounts(countableTransactions(source).filter(transaction => transaction.categoryId === categoryId && transaction.status === TRANSACTION_STATUS.COMMITTED)); }
export function getCategoryPaidAmount(source, categoryId) { return sumAmounts(countableTransactions(source).filter(transaction => transaction.categoryId === categoryId && transaction.status === TRANSACTION_STATUS.PAID)); }
export function getCategoryAvailableAmount(source, categoryId) { return getCategoryPlannedBudget(source, categoryId) - getCategoryCommittedAmount(source, categoryId) - getCategoryPaidAmount(source, categoryId); }
export function getTotalCommittedAmount(source = {}) { return sumAmounts(countableTransactions(source).filter(transaction => transaction.status === TRANSACTION_STATUS.COMMITTED)); }
export function getTotalPaidAmount(source = {}) { return sumAmounts(countableTransactions(source).filter(transaction => transaction.status === TRANSACTION_STATUS.PAID)); }
export function getTotalAvailableAmount(source = {}) { return getTotalPlannedBudget(source) - getTotalCommittedAmount(source) - getTotalPaidAmount(source); }
export function getExecutionRate(source = {}) { const total = getTotalPlannedBudget(source); return total > 0 ? (getTotalPaidAmount(source) / total) * 100 : 0; }
export function getPendingSettlementTransactions(source = {}) { return getTransactions(source).filter(transaction => transaction.status === TRANSACTION_STATUS.PAID && transaction.settlementStatus === SETTLEMENT_STATUS.PENDING); }
export function getPendingSettlementAmount(source = {}) { return sumAmounts(getPendingSettlementTransactions(source)); }
export function getTransactionsByTask(source, taskId) { return getTransactions(source).filter(transaction => transaction.taskId === taskId); }

export function getBudgetSummary(source = {}, categories = []) {
  const categoryIds = categories.length ? categories.map(category => category.id) : Object.keys(getPlans(source));
  const byCategory = categoryIds.map(categoryId => ({ categoryId, planned:getCategoryPlannedBudget(source, categoryId), committed:getCategoryCommittedAmount(source, categoryId), paid:getCategoryPaidAmount(source, categoryId), available:getCategoryAvailableAmount(source, categoryId) }));
  const available = getTotalAvailableAmount(source);
  return { totalPlanned:getTotalPlannedBudget(source), totalCommitted:getTotalCommittedAmount(source), totalPaid:getTotalPaidAmount(source), totalAvailable:available, executionRate:getExecutionRate(source), pendingSettlementCount:getPendingSettlementTransactions(source).length, pendingSettlementAmount:getPendingSettlementAmount(source), isOverBudget:available < 0, overBudgetAmount:Math.max(0, -available), byCategory };
}

export function validateBudgetCategories(categories) {
  const errors = [];
  if (!Array.isArray(categories)) return { valid:false, errors:['예산항목은 배열이어야 합니다.'] };
  const ids = new Set();
  categories.forEach((category, index) => {
    if (!category || typeof category !== 'object') { errors.push(`categories[${index}]가 객체가 아닙니다.`); return; }
    if (typeof category.id !== 'string' || !category.id) errors.push(`categories[${index}]의 id가 없습니다.`);
    if (ids.has(category.id)) errors.push(`예산항목 ID '${category.id}'가 중복됩니다.`);
    ids.add(category.id);
    if (typeof category.name !== 'string' || !category.name) errors.push(`categories[${index}]의 name이 없습니다.`);
    if (typeof category.active !== 'boolean') errors.push(`categories[${index}].active는 불리언이어야 합니다.`);
    if (typeof category.sortOrder !== 'number') errors.push(`categories[${index}].sortOrder는 숫자여야 합니다.`);
  });
  return { valid:errors.length === 0, errors };
}

export async function loadBudgetCategories(url = './data/budget-categories.json') {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`예산항목 로드 실패: HTTP ${response.status}`);
  const categories = await response.json();
  const validation = validateBudgetCategories(categories);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  return categories.filter(category => category.active).sort((first, second) => first.sortOrder - second.sortOrder);
}

export function validateTransaction(transaction, categories = [], tasks = []) {
  const errors = [];
  if (!transaction || typeof transaction !== 'object') return { valid:false, errors:['지출 데이터가 객체가 아닙니다.'] };
  if (!categories.some(category => category.id === transaction.categoryId)) errors.push('유효한 예산항목을 선택해 주세요.');
  if (!isValidAmount(transaction.amount)) errors.push('금액은 0 이상의 정수여야 합니다.');
  if (!TRANSACTION_STATUS_VALUES.includes(transaction.status)) errors.push('유효한 지출 상태를 선택해 주세요.');
  if (!SETTLEMENT_STATUS_VALUES.includes(transaction.settlementStatus)) errors.push('유효한 정산 상태를 선택해 주세요.');
  if (transaction.taskId && !tasks.some(task => task.id === transaction.taskId)) errors.push('관련 업무를 찾을 수 없습니다.');
  if (typeof transaction.description !== 'string' || !transaction.description.trim()) errors.push('지출 내용을 입력해 주세요.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transaction.date || '')) errors.push('날짜를 YYYY-MM-DD 형식으로 입력해 주세요.');
  else { const [year, month, day] = transaction.date.split('-').map(Number); const date = new Date(year, month - 1, day); if (Number.isNaN(date.getTime()) || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) errors.push('존재하는 날짜를 입력해 주세요.'); }
  return { valid:errors.length === 0, errors };
}

export function formatAmount(amount) { return `${Math.round(Number(amount) || 0).toLocaleString('ko-KR')}원`; }
export function createTransactionId(transactions = []) { const used = new Set(transactions.map(transaction => transaction.id)); let number = transactions.length + 1; while (used.has(`TX-${String(number).padStart(4, '0')}`)) number += 1; return `TX-${String(number).padStart(4, '0')}`; }
export function getTaskBudgetSummary(source, taskId) {
  const transactions = getTransactionsByTask(source, taskId).filter(transaction => transaction.status !== TRANSACTION_STATUS.CANCELLED);
  return { count:transactions.length, paid:sumAmounts(transactions.filter(transaction => transaction.status === TRANSACTION_STATUS.PAID)), committed:sumAmounts(transactions.filter(transaction => transaction.status === TRANSACTION_STATUS.COMMITTED)), transactions };
}
