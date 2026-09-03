import { PHASES, PHASE_INDEX } from './constants.js';
import { REQUIRED_FIELDS, validateTasks } from './validator.js';

function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function nonEmpty(value) { return typeof value === 'string' && value.trim().length > 0; }
function roundPercent(value) { return Math.round(value * 10) / 10; }
function percentage(complete, total) { return total ? roundPercent((complete / total) * 100) : 100; }

export function getQualityWarnings(tasks = []) {
  const warnings = [];
  tasks.forEach(task => {
    if (!task || typeof task !== 'object') return;
    const label = task.id || 'ID 없음';
    const criteria = Array.isArray(task.completionCriteria) ? task.completionCriteria.filter(nonEmpty) : [];
    const handover = isObject(task.handover) ? task.handover : {};
    if (nonEmpty(task.title) && (!nonEmpty(task.description) || task.description.trim().length < 20)) warnings.push({ taskId:label, type:'DESCRIPTION_SHORT', message:`${label}: 업무 설명이 짧습니다.` });
    if (task.required === true && criteria.length === 0) warnings.push({ taskId:label, type:'REQUIRED_NO_CRITERIA', message:`${label}: 필수 업무에 완료기준이 없습니다.` });
    if (task.riskLevel === 'HIGH' && criteria.length === 0) warnings.push({ taskId:label, type:'HIGH_NO_CRITERIA', message:`${label}: HIGH 위험 업무에 완료기준이 없습니다.` });
    if (task.riskLevel === 'HIGH' && !nonEmpty(task.assigneeRole)) warnings.push({ taskId:label, type:'HIGH_NO_ASSIGNEE', message:`${label}: HIGH 위험 업무에 담당역할이 없습니다.` });
    if (task.budget?.related === true && !nonEmpty(task.budget.category)) warnings.push({ taskId:label, type:'BUDGET_NO_CATEGORY', message:`${label}: 예산 관련 업무에 예산항목이 없습니다.` });
    if (task.aiCheck?.enabled === true && (!Array.isArray(task.aiCheck.keywords) || task.aiCheck.keywords.filter(nonEmpty).length === 0)) warnings.push({ taskId:label, type:'AI_NO_KEYWORDS', message:`${label}: AI 점검이 켜져 있지만 키워드가 없습니다.` });
    if (nonEmpty(task.description) && criteria.some(criteriaItem => nonEmpty(criteriaItem) && criteriaItem.trim() === task.description.trim())) warnings.push({ taskId:label, type:'DESCRIPTION_EQUALS_CRITERIA', message:`${label}: 업무 설명과 완료기준이 같습니다.` });
    if (![handover.caution, handover.knowhow, handover.previousIssue].some(nonEmpty)) warnings.push({ taskId:label, type:'HANDOVER_EMPTY', message:`${label}: 인수인계 정보가 비어 있습니다.` });
  });
  return warnings;
}

export function getDataQualityMetrics(tasks = []) {
  const total = tasks.length;
  const metrics = [
    { key:'requiredFields', label:'필수 필드', complete:tasks.filter(task => REQUIRED_FIELDS.every(field => Object.prototype.hasOwnProperty.call(task || {}, field))).length },
    { key:'descriptions', label:'업무 설명', complete:tasks.filter(task => nonEmpty(task?.description)).length },
    { key:'completionCriteria', label:'완료기준', complete:tasks.filter(task => Array.isArray(task?.completionCriteria) && task.completionCriteria.some(nonEmpty)).length },
    { key:'assignees', label:'담당역할', complete:tasks.filter(task => nonEmpty(task?.assigneeRole)).length },
    { key:'scheduleInfo', label:'일정 정보', complete:tasks.filter(task => isObject(task?.timing) && nonEmpty(task.timing.type) && nonEmpty(task.timing.label)).length },
    { key:'handoverInfo', label:'인수인계 정보', complete:tasks.filter(task => [task?.handover?.caution, task?.handover?.knowhow, task?.handover?.previousIssue].some(nonEmpty)).length }
  ];
  return metrics.map(metric => ({ ...metric, total, percent:percentage(metric.complete, total) }));
}

export function getDependencyReferences(tasks = [], taskId) {
  return tasks.filter(task => Array.isArray(task?.dependencies) && task.dependencies.includes(taskId));
}

export function getValidationReport(tasks = []) {
  const validation = validateTasks(tasks);
  const errorsByTaskId = new Map();
  validation.errors.forEach(error => {
    const match = error.match(/^tasks\[\d+\](?: \(([^)]+)\))?/);
    if (match?.[1]) errorsByTaskId.set(match[1], [...(errorsByTaskId.get(match[1]) || []), error]);
  });
  return { ...validation, errorsByTaskId };
}

export function getDataSummary(tasks = []) {
  const validation = getValidationReport(tasks);
  const warnings = getQualityWarnings(tasks);
  const phaseCounts = Object.fromEntries(PHASES.map(phase => [phase, tasks.filter(task => task?.phase === phase).length]));
  const orderedTasks = [...tasks].sort((first, second) => (PHASE_INDEX[first?.phase] ?? 99) - (PHASE_INDEX[second?.phase] ?? 99) || (first?.sortOrder ?? 0) - (second?.sortOrder ?? 0) || String(first?.id || '').localeCompare(String(second?.id || '')));
  return {
    total:tasks.length,
    required:tasks.filter(task => task?.required === true).length,
    optional:tasks.filter(task => task?.required === false).length,
    highRisk:tasks.filter(task => task?.riskLevel === 'HIGH').length,
    withDependencies:tasks.filter(task => Array.isArray(task?.dependencies) && task.dependencies.length > 0).length,
    active:tasks.filter(task => task?.active !== false).length,
    inactive:tasks.filter(task => task?.active === false).length,
    phaseCounts,
    validation,
    validationErrors:validation.errors.length,
    warnings,
    warningCount:warnings.length,
    qualityMetrics:getDataQualityMetrics(orderedTasks)
  };
}
