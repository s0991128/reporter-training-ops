import { formatAmount, getBudgetSummary, getTaskBudgetSummary, TRANSACTION_STATUS } from './budget.js';

const STATUS_LABELS = Object.freeze({ PLANNED:'지급 예정', COMMITTED:'집행확정', PAID:'지급완료', CANCELLED:'취소' });
const SETTLEMENT_LABELS = Object.freeze({ NOT_REQUIRED:'정산 불필요', PENDING:'미정산', COMPLETED:'정산완료' });

function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character])); }
function categoryName(categories, categoryId) { return categories.find(category => category.id === categoryId)?.name || categoryId || '미지정'; }
function taskLabel(tasks, taskId) { const task = tasks.find(item => item.id === taskId); return task ? `${task.id} ${task.title}` : '관련 업무 없음'; }

export function renderBudgetPanel(state, categories = [], tasks = []) {
  const summary = getBudgetSummary(state, categories);
  document.querySelector('#detail-budget-planned').textContent = formatAmount(summary.totalPlanned);
  document.querySelector('#detail-budget-committed').textContent = formatAmount(summary.totalCommitted);
  document.querySelector('#detail-budget-paid').textContent = formatAmount(summary.totalPaid);
  document.querySelector('#detail-budget-available').textContent = formatAmount(summary.totalAvailable);
  document.querySelector('#detail-budget-pending').textContent = `${summary.pendingSettlementCount}건 / ${formatAmount(summary.pendingSettlementAmount)}`;

  document.querySelector('#budget-plan-fields').innerHTML = categories.map(category => `<label>${escapeHtml(category.name)}<input type="number" min="0" step="1" value="${summary.byCategory.find(item => item.categoryId === category.id)?.planned || 0}" data-plan-category="${escapeHtml(category.id)}" /></label>`).join('');
  document.querySelector('#budget-category-table').innerHTML = `<div class="budget-table-row budget-table-head"><span>항목</span><span>계획예산</span><span>집행확정</span><span>지급완료</span><span>가용잔액</span><span>집행률</span></div>${summary.byCategory.map(item => `<div class="budget-table-row"><span>${escapeHtml(categoryName(categories, item.categoryId))}</span><span>${formatAmount(item.planned)}</span><span>${formatAmount(item.committed)}</span><span>${formatAmount(item.paid)}</span><span class="${item.available < 0 ? 'budget-negative' : ''}">${formatAmount(item.available)}</span><span>${item.planned ? `${(item.paid / item.planned * 100).toFixed(1)}%` : '0.0%'}</span></div>`).join('')}`;

  const transactions = [...(state.budget?.transactions || [])].sort((first, second) => String(second.date).localeCompare(String(first.date)) || String(second.updatedAt).localeCompare(String(first.updatedAt)));
  document.querySelector('#transaction-count').textContent = `${transactions.length}건`;
  document.querySelector('#transaction-list').innerHTML = transactions.length ? transactions.map(transaction => `<article class="transaction-row ${transaction.status === TRANSACTION_STATUS.CANCELLED ? 'is-cancelled' : ''}"><div class="transaction-main"><strong>${escapeHtml(transaction.description || '내용 없음')}</strong><span>${escapeHtml(categoryName(categories, transaction.categoryId))} · ${escapeHtml(transaction.date)}</span><small>${escapeHtml(taskLabel(tasks, transaction.taskId))}</small></div><div class="transaction-amount">${formatAmount(transaction.amount)}</div><span class="transaction-status status-${transaction.status.toLowerCase()}">${STATUS_LABELS[transaction.status] || transaction.status}</span><span class="settlement-status settlement-${transaction.settlementStatus.toLowerCase()}">${SETTLEMENT_LABELS[transaction.settlementStatus] || transaction.settlementStatus}</span><div class="transaction-actions"><button type="button" data-budget-action="edit" data-transaction-id="${escapeHtml(transaction.id)}">수정</button>${transaction.status !== TRANSACTION_STATUS.CANCELLED ? `<button type="button" data-budget-action="cancel" data-transaction-id="${escapeHtml(transaction.id)}">취소</button>` : ''}${transaction.status === TRANSACTION_STATUS.PAID && transaction.settlementStatus === 'PENDING' ? `<button type="button" data-budget-action="settle" data-transaction-id="${escapeHtml(transaction.id)}">정산 완료</button>` : ''}</div></article>`).join('') : '<p class="budget-empty">등록된 지출이 없습니다.</p>';
}

export function renderTaskBudget(task, budget, categories = []) {
  if (!task.budget?.related) return '';
  const summary = getTaskBudgetSummary(budget, task.id);
  const label = task.budget.category || categoryName(categories, '');
  if (!summary.count) return `<div class="task-budget task-budget-empty"><span>예산항목</span><b>${escapeHtml(label)}</b></div>`;
  return `<div class="task-budget"><span>관련 지출</span><b>${summary.count}건 / 지급완료 ${formatAmount(summary.paid)}</b></div>`;
}
