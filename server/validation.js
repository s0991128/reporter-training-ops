import { DEFAULT_LIMITS, getConfig } from './config.js';

const SUPPORTED_EXTENSIONS = new Set(['txt', 'md', 'csv', 'json']);
const GAP_TYPES = new Set(['NEW_TASK', 'ENRICH_EXISTING', 'DUPLICATE']);
const GAP_CONFIDENCES = new Set(['HIGH', 'MEDIUM', 'LOW']);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getExtension(filename = '') {
  return String(filename).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
}

const SENSITIVE_PATTERNS = Object.freeze([
  { code:'resident-number', regex:/(?<!\d)\d{6}[-\s]?\d{7}(?!\d)/g },
  { code:'phone-number', regex:/(?<!\d)(?:01[016789]|02|0[3-6][1-5])[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/g },
  { code:'email', regex:/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi }
]);

export function findSensitivePatterns(value = '') {
  const text = String(value);
  return SENSITIVE_PATTERNS.filter(pattern => {
    pattern.regex.lastIndex = 0;
    return pattern.regex.test(text);
  }).map(pattern => pattern.code);
}

function normalizeTask(task = {}) {
  const handover = isRecord(task.handover) ? task.handover : {};
  const aiCheck = isRecord(task.aiCheck) ? task.aiCheck : {};
  return {
    id:cleanString(task.id),
    phase:cleanString(task.phase),
    title:cleanString(task.title),
    description:cleanString(task.description),
    completionCriteria:Array.isArray(task.completionCriteria) ? task.completionCriteria.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean).slice(0, 30) : [],
    handover:{ caution:cleanString(handover.caution), knowhow:cleanString(handover.knowhow) },
    tags:Array.isArray(task.tags) ? task.tags.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean).slice(0, 30) : [],
    aiCheck:{ keywords:Array.isArray(aiCheck.keywords) ? aiCheck.keywords.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean).slice(0, 30) : [] }
  };
}

export function validateRequestPayload(payload, config = getConfig()) {
  const limits = config.limits || DEFAULT_LIMITS;
  const errors = [];
  if (!isRecord(payload)) return { valid:false, errors:['요청 본문이 JSON 객체가 아닙니다.'] };
  if (!Array.isArray(payload.sources) || payload.sources.length === 0) errors.push('분석자료가 필요합니다.');
  if (Array.isArray(payload.sources) && payload.sources.length > limits.maxFiles) errors.push(`분석자료는 최대 ${limits.maxFiles}개까지 사용할 수 있습니다.`);
  if (!Array.isArray(payload.tasks)) errors.push('업무 목록 형식이 올바르지 않습니다.');
  if (Array.isArray(payload.tasks) && payload.tasks.length > limits.maxTasks) errors.push(`업무 목록은 최대 ${limits.maxTasks}건까지 사용할 수 있습니다.`);

  const sources = [];
  let totalChars = 0;
  const sourceNames = new Set();
  const sensitivePatterns = new Set();
  if (Array.isArray(payload.sources)) payload.sources.forEach((source, index) => {
    if (!isRecord(source)) { errors.push(`분석자료 ${index + 1}번째 형식이 올바르지 않습니다.`); return; }
    const filename = cleanString(source.filename);
    const content = typeof source.content === 'string' ? source.content : '';
    const extension = getExtension(filename);
    if (!filename || filename.length > 200 || !SUPPORTED_EXTENSIONS.has(extension)) errors.push(`분석자료 ${index + 1}번째 파일 형식을 확인해 주세요.`);
    if (!content) errors.push(`분석자료 ${index + 1}번째 내용이 비어 있습니다.`);
    if (content.length > limits.maxFileChars) errors.push(`분석자료 ${index + 1}번째 파일이 너무 큽니다.`);
    totalChars += content.length;
    sourceNames.add(filename);
    findSensitivePatterns(content).forEach(code => sensitivePatterns.add(code));
    sources.push({ filename, content });
  });
  if (totalChars > limits.maxTotalChars) errors.push('분석자료 전체 용량이 너무 큽니다.');

  const tasks = [];
  if (Array.isArray(payload.tasks)) payload.tasks.forEach((task, index) => {
    if (!isRecord(task)) { errors.push(`업무 ${index + 1}번째 형식이 올바르지 않습니다.`); return; }
    const normalized = normalizeTask(task);
    if (!normalized.id || !normalized.title) errors.push(`업무 ${index + 1}번째 필수 항목이 없습니다.`);
    tasks.push(normalized);
    findSensitivePatterns(JSON.stringify(normalized)).forEach(code => sensitivePatterns.add(code));
  });

  return {
    valid:errors.length === 0 && sensitivePatterns.size === 0,
    errors,
    sensitivePatterns:[...sensitivePatterns],
    sourceNames,
    payload:{ sources, tasks }
  };
}

function validateSimilarTask(item, taskIds, limits) {
  if (!isRecord(item)) return '유사업무 결과 형식이 올바르지 않습니다.';
  const taskId = cleanString(item.taskId);
  const title = cleanString(item.title);
  const similarity = item.similarity;
  if (!taskId || !taskIds.has(taskId)) return '유사업무 ID가 현재 업무 목록에 없습니다.';
  if (!title || title.length > 200) return '유사업무 제목이 올바르지 않습니다.';
  if (similarity !== null && (!Number.isFinite(Number(similarity)) || Number(similarity) < 0 || Number(similarity) > 1)) return '유사업무 유사도가 올바르지 않습니다.';
  return null;
}

export function validateLlmResults(value, payload, config = getConfig()) {
  const limits = config.limits || DEFAULT_LIMITS;
  const errors = [];
  const results = isRecord(value) ? value.results : null;
  if (!Array.isArray(results)) return { valid:false, errors:['AI 응답의 결과 목록이 배열이 아닙니다.'] };
  if (results.length > limits.maxFiles * 100) errors.push('AI 응답 결과가 너무 많습니다.');
  const sourceNames = new Set((payload?.sources || []).map(source => source.filename));
  const taskIds = new Set((payload?.tasks || []).map(task => task.id));
  const normalized = [];
  results.forEach((result, index) => {
    if (!isRecord(result)) { errors.push(`AI 응답 ${index + 1}번째가 객체가 아닙니다.`); return; }
    const type = cleanString(result.type);
    const confidence = cleanString(result.confidence);
    const candidate = cleanString(result.candidate);
    const reason = cleanString(result.reason);
    const source = isRecord(result.source) ? result.source : {};
    const filename = cleanString(source.filename);
    const excerpt = cleanString(source.excerpt);
    if (!GAP_TYPES.has(type)) errors.push(`AI 응답 ${index + 1}번째 업무 분류가 올바르지 않습니다.`);
    if (!GAP_CONFIDENCES.has(confidence)) errors.push(`AI 응답 ${index + 1}번째 확인 수준이 올바르지 않습니다.`);
    if (!candidate || candidate.length > limits.maxCandidateChars) errors.push(`AI 응답 ${index + 1}번째 후보 문장이 올바르지 않습니다.`);
    if (!reason || reason.length > limits.maxReasonChars) errors.push(`AI 응답 ${index + 1}번째 근거 설명이 올바르지 않습니다.`);
    if (!filename || !sourceNames.has(filename)) errors.push(`AI 응답 ${index + 1}번째 근거 파일이 분석자료에 없습니다.`);
    if (!excerpt || excerpt.length > limits.maxExcerptChars) errors.push(`AI 응답 ${index + 1}번째 근거 문장이 없습니다.`);
    const similarTasks = Array.isArray(result.similarTasks) ? result.similarTasks : null;
    if (!similarTasks) errors.push(`AI 응답 ${index + 1}번째 유사업무 목록이 배열이 아닙니다.`);
    else similarTasks.slice(0, 5).forEach(item => {
      const error = validateSimilarTask(item, taskIds, limits);
      if (error) errors.push(`AI 응답 ${index + 1}번째 ${error}`);
    });
    normalized.push({
      id:`GAP-REMOTE-${String(index + 1).padStart(3, '0')}`,
      type,
      confidence,
      candidate,
      source:{ filename, excerpt },
      similarTasks:(similarTasks || []).slice(0, 5).map(item => ({ taskId:cleanString(item.taskId), title:cleanString(item.title), similarity:item.similarity === null ? null : Number(item.similarity) })),
      reason,
      status:'REVIEW'
    });
  });
  return { valid:errors.length === 0, errors, results:normalized };
}

export { GAP_TYPES, GAP_CONFIDENCES, SUPPORTED_EXTENSIONS };
