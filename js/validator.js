import { PHASES, PHASE_PREFIXES } from './constants.js';

export const RISK_LEVELS = Object.freeze(['HIGH', 'MEDIUM', 'LOW']);
export const TIMING_TYPES = Object.freeze(['D_DAY', 'TRAINING_DAY', 'END_DAY', 'AFTER_END', 'MANUAL']);
export const CATEGORIES = Object.freeze(['기획', '교육과정', '강사', '교육생', '시설', '숙박', '교통', '식사', '물품', '안내', '행정', '계약', '예산', '정산', '설문', '성과', '결과보고', '기타']);
export const REQUIRED_FIELDS = Object.freeze(['id', 'phase', 'timing', 'category', 'title', 'description', 'required', 'assigneeRole', 'estimatedMinutes', 'completionCriteria', 'riskLevel', 'dependencies', 'documents', 'handover', 'budget', 'repeat', 'aiCheck', 'tags', 'active', 'sortOrder']);
export const ID_PATTERN = /^(PRE|OPS|CLS|FIN|RPT)-[0-9]{3}$/;

function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function hasOwn(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
function isNonNegativeInteger(value) { return Number.isInteger(value) && value >= 0; }

export function validateTasks(tasks) {
  const errors = [];
  if (!Array.isArray(tasks)) return { valid:false, errors:['최상위 데이터는 배열이어야 합니다.'] };
  const ids = new Set();
  tasks.forEach((task, index) => {
    const label = `tasks[${index}]${task?.id ? ` (${task.id})` : ''}`;
    if (!task || typeof task !== 'object' || Array.isArray(task)) { errors.push(`${label}: 업무 객체가 아닙니다.`); return; }
    REQUIRED_FIELDS.forEach(field => { if (!(field in task)) errors.push(`${label}: 필수 필드 '${field}'가 없습니다.`); });
    if (typeof task.id === 'string' && ids.has(task.id)) errors.push(`${label}: ID '${task.id}'가 중복됩니다.`);
    if (typeof task.id === 'string') ids.add(task.id);
    if (typeof task.id !== 'string' || !ID_PATTERN.test(task.id)) errors.push(`${label}: id는 PRE/OPS/CLS/FIN/RPT-000 형식이어야 합니다.`);
    const prefix = typeof task.id === 'string' ? task.id.split('-')[0] : '';
    if (PHASE_PREFIXES[prefix] && task.phase !== PHASE_PREFIXES[prefix]) errors.push(`${label}: ID prefix '${prefix}'와 phase '${task.phase}'가 일치하지 않습니다.`);
    if (!PHASES.includes(task.phase)) errors.push(`${label}: phase '${task.phase}'가 허용값이 아닙니다.`);
    if (!CATEGORIES.includes(task.category)) errors.push(`${label}: category '${task.category}'가 허용값이 아닙니다.`);
    if (!RISK_LEVELS.includes(task.riskLevel)) errors.push(`${label}: riskLevel '${task.riskLevel}'가 허용값이 아닙니다.`);
    if (!isObject(task.timing) || !TIMING_TYPES.includes(task.timing.type)) errors.push(`${label}: timing.type '${task.timing?.type}'가 허용값이 아닙니다.`);
    if (isObject(task.timing)) {
      if (!hasOwn(task.timing, 'value') || !hasOwn(task.timing, 'label')) errors.push(`${label}: timing은 value와 label을 포함해야 합니다.`);
      if (!(task.timing.value === null || Number.isInteger(task.timing.value))) errors.push(`${label}: timing.value는 정수 또는 null이어야 합니다.`);
      if (typeof task.timing.label !== 'string') errors.push(`${label}: timing.label은 문자열이어야 합니다.`);
    }
    if (!isNonNegativeInteger(task.estimatedMinutes)) errors.push(`${label}: estimatedMinutes는 0 이상의 정수여야 합니다.`);
    if (!Array.isArray(task.completionCriteria)) errors.push(`${label}: completionCriteria는 배열이어야 합니다.`);
    else if (task.completionCriteria.some(criteria => typeof criteria !== 'string')) errors.push(`${label}: completionCriteria의 항목은 문자열이어야 합니다.`);
    if (!Array.isArray(task.dependencies)) errors.push(`${label}: dependencies는 배열이어야 합니다.`);
    else if (task.dependencies.some(dependency => typeof dependency !== 'string')) errors.push(`${label}: dependencies의 항목은 문자열이어야 합니다.`);
    if (Array.isArray(task.dependencies)) task.dependencies.forEach(dependency => {
      if (dependency === task.id) errors.push(`${label}: 자기 자신을 dependency로 지정할 수 없습니다.`);
      if (!ids.has(dependency) && !tasks.some(candidate => candidate?.id === dependency)) errors.push(`${label}: dependency '${dependency}'를 찾을 수 없습니다.`);
    });
    if (!Array.isArray(task.documents)) errors.push(`${label}: documents는 배열이어야 합니다.`);
    else task.documents.forEach((document, documentIndex) => {
      if (!isObject(document) || typeof document.name !== 'string' || typeof document.required !== 'boolean') errors.push(`${label}: documents[${documentIndex}] 구조가 올바르지 않습니다.`);
    });
    if (!isObject(task.handover)) errors.push(`${label}: handover 구조가 필요합니다.`);
    else ['caution', 'knowhow', 'previousIssue'].forEach(field => { if (typeof task.handover[field] !== 'string') errors.push(`${label}: handover.${field}는 문자열이어야 합니다.`); });
    if (!isObject(task.budget) || typeof task.budget.related !== 'boolean' || !(typeof task.budget.category === 'string' || task.budget.category === null)) errors.push(`${label}: budget 구조가 올바르지 않습니다.`);
    if (!isObject(task.repeat) || typeof task.repeat.enabled !== 'boolean' || !(typeof task.repeat.rule === 'string' || task.repeat.rule === null)) errors.push(`${label}: repeat 구조가 올바르지 않습니다.`);
    if (!isObject(task.aiCheck) || typeof task.aiCheck.enabled !== 'boolean' || !Array.isArray(task.aiCheck.keywords) || task.aiCheck.keywords.some(keyword => typeof keyword !== 'string')) errors.push(`${label}: aiCheck 구조가 올바르지 않습니다.`);
    if (!Array.isArray(task.tags) || task.tags.some(tag => typeof tag !== 'string')) errors.push(`${label}: tags는 문자열 배열이어야 합니다.`);
    if (typeof task.required !== 'boolean') errors.push(`${label}: required는 불리언이어야 합니다.`);
    if (typeof task.title !== 'string' || !task.title.trim()) errors.push(`${label}: title은 비어 있을 수 없습니다.`);
    if (typeof task.description !== 'string' || !task.description.trim()) errors.push(`${label}: description은 비어 있을 수 없습니다.`);
    if (typeof task.assigneeRole !== 'string' || !task.assigneeRole.trim()) errors.push(`${label}: assigneeRole은 비어 있을 수 없습니다.`);
    if (typeof task.active !== 'boolean') errors.push(`${label}: active는 불리언이어야 합니다.`);
    if (typeof task.sortOrder !== 'number' || Number.isNaN(task.sortOrder)) errors.push(`${label}: sortOrder는 숫자여야 합니다.`);
  });
  const taskById = new Map(tasks.filter(task => task && typeof task === 'object' && typeof task.id === 'string').map(task => [task.id, task]));
  const visiting = new Set();
  const visited = new Set();
  const reportedCycles = new Set();
  const path = [];
  function visit(id) {
    if (visiting.has(id)) {
      const cycleStart = path.indexOf(id);
      const cycle = [...path.slice(cycleStart), id];
      const cycleKey = [...cycle.slice(0, -1)].sort().join('|');
      if (!reportedCycles.has(cycleKey)) {
        reportedCycles.add(cycleKey);
        errors.push(`[Validator] Dependency cycle detected: ${cycle.join(' → ')}`);
      }
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    path.push(id);
    const dependencies = taskById.get(id)?.dependencies;
    if (Array.isArray(dependencies)) dependencies.filter(dependency => taskById.has(dependency)).forEach(visit);
    path.pop();
    visiting.delete(id);
    visited.add(id);
  }
  taskById.forEach((task, id) => visit(id));
  return { valid:errors.length === 0, errors };
}
