import { PHASES, PHASE_PREFIXES } from './constants.js';

const RISK_LEVELS = ['HIGH', 'MEDIUM', 'LOW'];
const TIMING_TYPES = ['D_DAY', 'TRAINING_DAY', 'END_DAY', 'AFTER_END', 'MANUAL'];
const CATEGORIES = ['기획', '교육과정', '강사', '교육생', '시설', '숙박', '교통', '식사', '물품', '안내', '행정', '계약', '예산', '정산', '설문', '성과', '결과보고', '기타'];
const REQUIRED_FIELDS = ['id', 'phase', 'timing', 'category', 'title', 'description', 'required', 'assigneeRole', 'estimatedMinutes', 'completionCriteria', 'riskLevel', 'dependencies', 'documents', 'handover', 'budget', 'repeat', 'aiCheck', 'tags', 'active', 'sortOrder'];
const ID_PATTERN = /^(PRE|OPS|CLS|FIN|RPT)-[0-9]{3}$/;

export function validateTasks(tasks) {
  const errors = [];
  if (!Array.isArray(tasks)) return { valid:false, errors:['최상위 데이터는 배열이어야 합니다.'] };
  const ids = new Set();
  tasks.forEach((task, index) => {
    const label = `tasks[${index}]${task?.id ? ` (${task.id})` : ''}`;
    if (!task || typeof task !== 'object' || Array.isArray(task)) { errors.push(`${label}: 업무 객체가 아닙니다.`); return; }
    REQUIRED_FIELDS.forEach(field => { if (!(field in task)) errors.push(`${label}: 필수 필드 '${field}'가 없습니다.`); });
    if (ids.has(task.id)) errors.push(`${label}: ID '${task.id}'가 중복됩니다.`);
    ids.add(task.id);
    if (typeof task.id !== 'string' || !ID_PATTERN.test(task.id)) errors.push(`${label}: id는 PRE/OPS/CLS/FIN/RPT-000 형식이어야 합니다.`);
    const prefix = typeof task.id === 'string' ? task.id.split('-')[0] : '';
    if (PHASE_PREFIXES[prefix] && task.phase !== PHASE_PREFIXES[prefix]) errors.push(`${label}: ID prefix '${prefix}'와 phase '${task.phase}'가 일치하지 않습니다.`);
    if (!PHASES.includes(task.phase)) errors.push(`${label}: phase '${task.phase}'가 허용값이 아닙니다.`);
    if (!CATEGORIES.includes(task.category)) errors.push(`${label}: category '${task.category}'가 허용값이 아닙니다.`);
    if (!RISK_LEVELS.includes(task.riskLevel)) errors.push(`${label}: riskLevel '${task.riskLevel}'가 허용값이 아닙니다.`);
    if (!task.timing || !TIMING_TYPES.includes(task.timing.type)) errors.push(`${label}: timing.type '${task.timing?.type}'가 허용값이 아닙니다.`);
    if (task.timing && (!('value' in task.timing) || !('label' in task.timing))) errors.push(`${label}: timing은 value와 label을 포함해야 합니다.`);
    if (!Array.isArray(task.completionCriteria)) errors.push(`${label}: completionCriteria는 배열이어야 합니다.`);
    if (!Array.isArray(task.dependencies)) errors.push(`${label}: dependencies는 배열이어야 합니다.`);
    if (Array.isArray(task.dependencies)) task.dependencies.forEach(dependency => {
      if (dependency === task.id) errors.push(`${label}: 자기 자신을 dependency로 지정할 수 없습니다.`);
      if (!ids.has(dependency) && !tasks.some(candidate => candidate?.id === dependency)) errors.push(`${label}: dependency '${dependency}'를 찾을 수 없습니다.`);
    });
    if (typeof task.required !== 'boolean') errors.push(`${label}: required는 불리언이어야 합니다.`);
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
