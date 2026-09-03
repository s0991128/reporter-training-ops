import { PHASE_INDEX, SEVERITY_ORDER } from './constants.js';
import { TASK_STATUS, getTaskState } from './storage.js';
import { calculateTaskDate, getScheduleStatus, SCHEDULE_STATUS } from './schedule.js';
import { getBudgetSummary, getPendingSettlementTransactions, getTransactionsByTask, TRANSACTION_STATUS, SETTLEMENT_STATUS } from './budget.js';

const DEFAULT_SEVERITY = Object.freeze({ BLOCKED:'MEDIUM', OVERDUE_REQUIRED:'HIGH', HIGH_RISK:'MEDIUM', DUE_SOON_CRITICAL:'HIGH', PHASE_WARNING:'MEDIUM', BUDGET_OVER:'HIGH', SETTLEMENT_PENDING:'HIGH', BUDGET_TASK_MISMATCH:'MEDIUM' });
const RISK_ORDER = Object.freeze({ HIGH:0, MEDIUM:1, LOW:2 });

function isCompleted(states, taskId) {
  return getTaskState(states, taskId).status === TASK_STATUS.COMPLETED;
}

function createAlert(task, type, message, severity, extra = {}) {
  return { taskId:task.id, taskTitle:task.title, type, message, severity:getAlertSeverity({ type, severity }), ...extra };
}

function getTaskMap(tasks) {
  return new Map(tasks.filter(task => task && typeof task.id === 'string').map(task => [task.id, task]));
}

export function getIncompleteDependencies(task, allTasks = [], allStates = {}) {
  const taskMap = getTaskMap(allTasks);
  return (Array.isArray(task?.dependencies) ? task.dependencies : [])
    .filter(dependencyId => !isCompleted(allStates, dependencyId))
    .map(dependencyId => taskMap.get(dependencyId) || { id:dependencyId, title:'업무 정보 없음', required:false, riskLevel:'LOW' });
}

export function isTaskBlocked(task, allTasks = [], allStates = {}) {
  return getIncompleteDependencies(task, allTasks, allStates).length > 0;
}

function getDependencySeverity(dependencies, allStates, settings, today) {
  const hasImportantDependency = dependencies.some(dependency => dependency.required || dependency.riskLevel === 'HIGH');
  const hasOverdueRequiredDependency = dependencies.some(dependency => dependency.required && getScheduleStatus(dependency, getTaskState(allStates, dependency.id), settings, today) === SCHEDULE_STATUS.OVERDUE);
  if (hasOverdueRequiredDependency) return 'CRITICAL';
  return hasImportantDependency ? 'HIGH' : 'MEDIUM';
}

export function getTaskAlerts(task, taskState = {}, allTasks = [], allStates = {}, settings = {}, today = new Date(), budget = null) {
  if (!task) return [];
  const alerts = [];
  const budgetData = budget || allStates?.budget || {};
  if (taskState.status !== TASK_STATUS.COMPLETED) {
    const incompleteDependencies = getIncompleteDependencies(task, allTasks, allStates);
    if (incompleteDependencies.length) {
      alerts.push(createAlert(task, 'BLOCKED', '선행업무 미완료', getDependencySeverity(incompleteDependencies, allStates, settings, today), {
        dependencyIds:incompleteDependencies.map(dependency => dependency.id),
        dependencies:incompleteDependencies
      }));
    }

    const scheduleStatus = getScheduleStatus(task, taskState, settings, today);
    if (task.required && scheduleStatus === SCHEDULE_STATUS.OVERDUE) {
      const severity = task.riskLevel === 'HIGH' ? 'CRITICAL' : 'HIGH';
      alerts.push(createAlert(task, 'OVERDUE_REQUIRED', '기한이 지난 필수 업무입니다.', severity, { scheduleStatus }));
    }
    if (task.required && task.riskLevel === 'HIGH' && [SCHEDULE_STATUS.DUE_SOON, SCHEDULE_STATUS.DUE_TODAY].includes(scheduleStatus)) {
      alerts.push(createAlert(task, 'DUE_SOON_CRITICAL', scheduleStatus === SCHEDULE_STATUS.DUE_TODAY ? '오늘 마감인 고위험 필수 업무입니다.' : '마감이 임박한 고위험 필수 업무입니다.', 'HIGH', { scheduleStatus }));
    }
    if (task.riskLevel === 'HIGH') {
      alerts.push(createAlert(task, 'HIGH_RISK', '고위험 업무이므로 완료 기준을 확인하세요.', 'MEDIUM', { scheduleStatus }));
    }
  }

  const linkedTransactions = getTransactionsByTask(budgetData, task.id).filter(transaction => transaction.status !== TRANSACTION_STATUS.CANCELLED);
  if (task.budget?.related && taskState.status === TASK_STATUS.COMPLETED && !linkedTransactions.length) {
    alerts.push(createAlert(task, 'BUDGET_TASK_MISMATCH', '관련 지출내역을 확인하세요.', 'MEDIUM'));
  }
  linkedTransactions.filter(transaction => transaction.status === TRANSACTION_STATUS.PAID && transaction.settlementStatus === SETTLEMENT_STATUS.PENDING).forEach(transaction => {
    alerts.push(createAlert(task, 'SETTLEMENT_PENDING', '지급은 완료되었지만 정산이 남아 있습니다.', 'HIGH', { transactionId:transaction.id, amount:transaction.amount }));
  });
  return alerts;
}

export function getPhaseWarnings(tasks = [], states = {}, settings = {}, today = new Date()) {
  const warnings = [];
  tasks.forEach(task => {
    const taskStatus = getTaskState(states, task.id).status;
    if (![TASK_STATUS.IN_PROGRESS, TASK_STATUS.COMPLETED].includes(taskStatus)) return;
    const phaseIndex = PHASE_INDEX[task.phase];
    if (phaseIndex === undefined || phaseIndex === 0) return;
    const incompletePreviousTasks = tasks.filter(candidate => {
      const candidateIndex = PHASE_INDEX[candidate.phase];
      return candidateIndex !== undefined && candidateIndex < phaseIndex && candidate.required && !isCompleted(states, candidate.id);
    });
    if (!incompletePreviousTasks.length) return;
    const previousPhases = [...new Set(incompletePreviousTasks.map(candidate => candidate.phase))];
    warnings.push(createAlert(task, 'PHASE_WARNING', '이전 단계의 필수 업무가 아직 완료되지 않았습니다.', 'MEDIUM', {
      previousPhases,
      incompletePreviousTasks,
      scheduleStatus:getScheduleStatus(task, getTaskState(states, task.id), settings, today)
    }));
  });
  return warnings;
}

export function getAllAlerts(tasks = [], states = {}, settings = {}, today = new Date(), budget = null) {
  const budgetData = budget || states?.budget || {};
  const alerts = tasks.flatMap(task => getTaskAlerts(task, getTaskState(states, task.id), tasks, states, settings, today, budgetData));
  const budgetSummary = getBudgetSummary(budgetData);
  if (budgetSummary.isOverBudget) alerts.push({ taskId:'__BUDGET__', taskTitle:'예산·정산', type:'BUDGET_OVER', message:`예산초과 ${budgetSummary.overBudgetAmount.toLocaleString('ko-KR')}원`, severity:'HIGH', amount:budgetSummary.overBudgetAmount });
  getPendingSettlementTransactions(budgetData).filter(transaction => !tasks.some(task => task.id === transaction.taskId)).forEach(transaction => {
    alerts.push({ taskId:transaction.taskId || transaction.id, taskTitle:transaction.description || transaction.id, type:'SETTLEMENT_PENDING', message:'지급은 완료되었지만 정산이 남아 있습니다.', severity:'HIGH', transactionId:transaction.id, amount:transaction.amount });
  });
  return alerts.concat(getPhaseWarnings(tasks, states, settings, today)).sort((first, second) => {
    const severityDifference = SEVERITY_ORDER.indexOf(getAlertSeverity(first)) - SEVERITY_ORDER.indexOf(getAlertSeverity(second));
    if (severityDifference) return severityDifference;
    const firstTask = tasks.find(task => task.id === first.taskId);
    const secondTask = tasks.find(task => task.id === second.taskId);
    const firstDate = firstTask ? calculateTaskDate(firstTask, settings) : null;
    const secondDate = secondTask ? calculateTaskDate(secondTask, settings) : null;
    if (!firstDate && !secondDate) return (RISK_ORDER[firstTask?.riskLevel] ?? 9) - (RISK_ORDER[secondTask?.riskLevel] ?? 9);
    if (!firstDate) return 1;
    if (!secondDate) return -1;
    return firstDate - secondDate || (RISK_ORDER[firstTask?.riskLevel] ?? 9) - (RISK_ORDER[secondTask?.riskLevel] ?? 9);
  });
}

export function getAlertSeverity(alert = {}) {
  return SEVERITY_ORDER.includes(alert.severity) ? alert.severity : (DEFAULT_SEVERITY[alert.type] || 'LOW');
}

export function getAlertSummary(tasks = [], states = {}, settings = {}, today = new Date(), budget = null) {
  const alerts = getAllAlerts(tasks, states, settings, today, budget);
  const byType = Object.fromEntries(['BLOCKED', 'OVERDUE_REQUIRED', 'HIGH_RISK', 'DUE_SOON_CRITICAL', 'PHASE_WARNING', 'BUDGET_OVER', 'SETTLEMENT_PENDING', 'BUDGET_TASK_MISMATCH'].map(type => [type, new Set()]));
  alerts.forEach(alert => byType[alert.type]?.add(alert.taskId));
  const counts = Object.fromEntries(Object.entries(byType).map(([type, taskIds]) => [type, taskIds.size]));
  const alertedTaskCount = new Set(alerts.map(alert => alert.taskId)).size;
  const priorityTasks = [...new Set(alerts.map(alert => alert.taskId))].map(taskId => {
    const taskAlerts = alerts.filter(alert => alert.taskId === taskId);
    const task = tasks.find(candidate => candidate.id === taskId);
    return { task, alerts:taskAlerts, alert:taskAlerts[0] };
  }).slice(0, 5);
  return {
    total:alertedTaskCount,
    alertCount:alerts.length,
    alerts,
    priorityTasks,
    critical:alerts.filter(alert => getAlertSeverity(alert) === 'CRITICAL').length,
    high:alerts.filter(alert => getAlertSeverity(alert) === 'HIGH').length,
    medium:alerts.filter(alert => getAlertSeverity(alert) === 'MEDIUM').length,
    low:alerts.filter(alert => getAlertSeverity(alert) === 'LOW').length,
    blocked:counts.BLOCKED,
    overdueRequired:counts.OVERDUE_REQUIRED,
    highRisk:counts.HIGH_RISK,
    dueSoonCritical:counts.DUE_SOON_CRITICAL,
    phaseWarnings:counts.PHASE_WARNING,
    budgetOver:counts.BUDGET_OVER,
    settlementPending:counts.SETTLEMENT_PENDING,
    budgetTaskMismatch:counts.BUDGET_TASK_MISMATCH
  };
}

export function getDependencyConfirmationMessage(dependencies = []) {
  const dependencyLines = dependencies.map(dependency => `• ${dependency.id} ${dependency.title}`);
  return ['선행업무가 아직 완료되지 않았습니다.', '', ...dependencyLines, '', '그래도 완료 처리하시겠습니까?'].join('\n');
}
