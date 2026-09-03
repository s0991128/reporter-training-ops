import { parseCsv } from './csv.js';

export const GAP_TYPES = Object.freeze({ NEW_TASK:'NEW_TASK', ENRICH_EXISTING:'ENRICH_EXISTING', DUPLICATE:'DUPLICATE' });
export const GAP_CONFIDENCES = Object.freeze({ HIGH:'HIGH', MEDIUM:'MEDIUM', LOW:'LOW' });
export const GAP_STATUSES = Object.freeze({ REVIEW:'REVIEW', ACCEPTED:'ACCEPTED', IGNORED:'IGNORED' });
export const SUPPORTED_SOURCE_TYPES = Object.freeze({ txt:'text', md:'markdown', csv:'csv', json:'json' });
export const GAP_INPUT_LIMITS = Object.freeze({ maxFiles:5, maxFileChars:200000, maxTotalChars:600000 });

const EXCERPT_LIMIT = 260;
const IGNORED_TOKENS = new Set(['및', '을', '를', '에', '의', '와', '과', '은', '는', '이', '가', '에서', '으로', '로', '후', '등', '수', '위해', '대한', '교육', '업무', '확인', '재확인', '시간', '자료', '내용', '최종', '현황', '가능', '진행', '준비', '운영', '처리', '기준']);
const NOISE_TITLES = new Set(['목차', '차례', '보고서', '인수인계서', '체크리스트']);
const ACTION_HINT_PATTERN = /확정|확인|점검|검토|예약|섭외|신청|제출|안내|정리|준비|공유|수립|재확인|연락|등록|지급|정산/;

function clamp(value, minimum = 0, maximum = 1) { return Math.min(maximum, Math.max(minimum, value)); }
function roundSimilarity(value) { return Math.round(clamp(value) * 100) / 100; }
function cleanText(value = '') {
  return String(value).replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

export function normalizeText(value = '') {
  return cleanText(value).normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[“”‘’]/g, "'").replace(/[.,!?;:()[\]{}<>]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function tokenizeText(value = '') {
  return [...new Set(normalizeText(value).split(/[^0-9a-zA-Z가-힣]+/).filter(token => token.length >= 2 && !IGNORED_TOKENS.has(token)))];
}

function tokenAffinity(first, second) {
  if (!first || !second) return 0;
  if (first === second) return 1;
  if (first.includes(second) || second.includes(first)) return 0.82;
  if (first.slice(0, 2) === second.slice(0, 2)) return 0.62;
  return 0;
}

function tokenCoverage(tokens, targetTokens) {
  if (!tokens.length || !targetTokens.length) return 0;
  return tokens.reduce((sum, token) => sum + Math.max(...targetTokens.map(target => tokenAffinity(token, target))), 0) / tokens.length;
}

export function calculateTextSimilarity(first = '', second = '') {
  const normalizedFirst = normalizeText(first);
  const normalizedSecond = normalizeText(second);
  if (!normalizedFirst || !normalizedSecond) return 0;
  if (normalizedFirst === normalizedSecond) return 1;
  const firstTokens = tokenizeText(normalizedFirst);
  const secondTokens = tokenizeText(normalizedSecond);
  if (!firstTokens.length || !secondTokens.length) return normalizedFirst.includes(normalizedSecond) || normalizedSecond.includes(normalizedFirst) ? 0.72 : 0;
  const firstCoverage = tokenCoverage(firstTokens, secondTokens);
  const secondCoverage = tokenCoverage(secondTokens, firstTokens);
  const phraseBonus = normalizedFirst.includes(normalizedSecond) || normalizedSecond.includes(normalizedFirst) ? 0.08 : 0;
  return roundSimilarity(clamp(firstCoverage * 0.65 + secondCoverage * 0.35 + phraseBonus));
}

export function getSourceType(filename = '') {
  const extension = String(filename).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return extension ? SUPPORTED_SOURCE_TYPES[extension] || null : null;
}

export function isSupportedSource(filename = '') { return Boolean(getSourceType(filename)); }

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

export function validateGapSources(sources = []) {
  const errors = [];
  const sensitivePatterns = new Set();
  if (!Array.isArray(sources) || !sources.length) errors.push('분석자료를 먼저 추가해 주세요.');
  if (Array.isArray(sources) && sources.length > GAP_INPUT_LIMITS.maxFiles) errors.push(`분석자료는 최대 ${GAP_INPUT_LIMITS.maxFiles}개까지 사용할 수 있습니다.`);
  let totalChars = 0;
  (Array.isArray(sources) ? sources : []).forEach((source, index) => {
    const content = typeof source?.content === 'string' ? source.content : '';
    totalChars += content.length;
    if (!isSupportedSource(source?.filename)) errors.push(`분석자료 ${index + 1}번째 파일 형식을 확인해 주세요.`);
    if (!content) errors.push(`분석자료 ${index + 1}번째 내용이 비어 있습니다.`);
    if (content.length > GAP_INPUT_LIMITS.maxFileChars) errors.push(`분석자료 ${index + 1}번째 파일이 너무 큽니다.`);
    findSensitivePatterns(content).forEach(code => sensitivePatterns.add(code));
  });
  if (totalChars > GAP_INPUT_LIMITS.maxTotalChars) errors.push('분석자료 전체 용량이 너무 큽니다.');
  if (sensitivePatterns.size) errors.push('개인정보 형식이 감지되었습니다.');
  return { valid:errors.length === 0, errors, sensitivePatterns:[...sensitivePatterns] };
}

function splitSentences(value) {
  return cleanText(value).split(/(?<=[.!?。！？])\s+|\r?\n+/).map(cleanText).filter(Boolean);
}

function collectJsonStrings(value, output = []) {
  if (typeof value === 'string') output.push(...splitSentences(value));
  else if (Array.isArray(value)) value.forEach(item => collectJsonStrings(item, output));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => collectJsonStrings(item, output));
  return output;
}

function extractMarkdownUnits(content) {
  const units = [];
  content.split(/\r?\n/).forEach(line => {
    const original = cleanText(line);
    if (!original || /^(```|---+$)/.test(original)) return;
    const isHeading = /^#{1,6}\s+/.test(original);
    const isList = /^(?:[-*+]\s+|\d+[.)]\s+)/.test(original);
    const cleaned = original.replace(/^#{1,6}\s+/, '').replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, '').replace(/^>\s?/, '').replace(/`/g, '').trim();
    const isPageTitle = isHeading && /자료|보고서|문서|목록|페이지/.test(cleaned) && !ACTION_HINT_PATTERN.test(cleaned);
    if (isPageTitle) return;
    if (isHeading || isList) units.push({ candidate:cleaned, excerpt:cleaned });
    else units.push(...splitSentences(cleaned).map(candidate => ({ candidate, excerpt:candidate })));
  });
  return units;
}

function extractCsvUnits(content) {
  const parsed = parseCsv(content);
  return (parsed.rows || []).flatMap(row => {
    const combined = row.values.map(cleanText).filter(Boolean).join(' ');
    return combined ? [{ candidate:combined, excerpt:combined }] : [];
  });
}

function extractUnits(source = {}) {
  const type = source.type || getSourceType(source.filename);
  const content = String(source.content || '');
  if (type === 'markdown') return extractMarkdownUnits(content);
  if (type === 'csv') return extractCsvUnits(content);
  if (type === 'json') {
    try { return collectJsonStrings(JSON.parse(content)).map(candidate => ({ candidate, excerpt:candidate })); }
    catch { return splitSentences(content).map(candidate => ({ candidate, excerpt:candidate })); }
  }
  return splitSentences(content).map(candidate => ({ candidate, excerpt:candidate }));
}

function isCandidate(value, filename = '') {
  const candidate = cleanText(value).replace(/^[-*+]+\s*/, '').replace(/\s+/g, ' ');
  const filenameStem = cleanText(filename).replace(/\.[^.]+$/, '');
  if (Array.from(candidate).length < 3 || !/[0-9A-Za-z가-힣]/.test(candidate)) return false;
  if (NOISE_TITLES.has(candidate) || candidate === filenameStem) return false;
  return true;
}

export function extractCandidatePhrases(source = {}) {
  const seen = new Set();
  return extractUnits(source).map(unit => ({ candidate:cleanText(unit.candidate), excerpt:cleanText(unit.excerpt || unit.candidate) }))
    .filter(unit => isCandidate(unit.candidate, source.filename))
    .filter(unit => { const key = normalizeText(unit.candidate); if (seen.has(key)) return false; seen.add(key); return true; })
    .map(unit => ({ ...unit, excerpt:unit.excerpt.slice(0, EXCERPT_LIMIT) }));
}

function getTaskFields(task = {}) {
  return [task.title, task.description, ...(task.completionCriteria || []), task.handover?.caution, task.handover?.knowhow, ...(task.tags || []), ...(task.aiCheck?.keywords || [])].filter(Boolean).map(String);
}

function getTaskSearchText(task) { return getTaskFields(task).join(' '); }

function getTaskMatch(candidate, task) {
  const fields = getTaskFields(task);
  const candidateNormalized = normalizeText(candidate);
  const exactField = fields.some(field => normalizeText(field) === candidateNormalized || (candidateNormalized.length >= 8 && normalizeText(field).includes(candidateNormalized)));
  const candidateTokens = tokenizeText(candidate);
  const taskTokens = tokenizeText(fields.join(' '));
  return {
    exactField,
    candidateCoverage:tokenCoverage(candidateTokens, taskTokens),
    taskCoverage:tokenCoverage(taskTokens, candidateTokens),
    similarity:calculateTextSimilarity(candidate, getTaskSearchText(task))
  };
}

export function findSimilarTasks(candidate = '', tasks = [], limit = 3) {
  return tasks.map(task => ({ task, similarity:getTaskMatch(candidate, task).similarity }))
    .filter(item => item.task?.id)
    .sort((first, second) => second.similarity - first.similarity || String(first.task.id).localeCompare(String(second.task.id)))
    .slice(0, limit)
    .map(item => ({ taskId:item.task.id, title:item.task.title, similarity:item.similarity }));
}

function getBestTaskMatch(candidate, tasks) {
  return tasks.map(task => ({ task, match:getTaskMatch(candidate, task) }))
    .filter(item => item.task?.id)
    .sort((first, second) => second.match.similarity - first.match.similarity || String(first.task.id).localeCompare(String(second.task.id)))[0] || null;
}

function classifyCandidate(candidate, tasks) {
  const best = getBestTaskMatch(candidate, tasks);
  if (!best) return { type:GAP_TYPES.NEW_TASK, best:null };
  const { match } = best;
  if (match.exactField || (match.similarity >= 0.68 && match.candidateCoverage >= 0.68)) return { type:GAP_TYPES.DUPLICATE, best };
  if (match.similarity >= 0.25 && match.taskCoverage >= 0.18) return { type:GAP_TYPES.ENRICH_EXISTING, best };
  return { type:GAP_TYPES.NEW_TASK, best };
}

function getConfidence(type, best) {
  const similarity = best?.match.similarity || 0;
  if (type === GAP_TYPES.DUPLICATE) return similarity >= 0.78 ? GAP_CONFIDENCES.HIGH : GAP_CONFIDENCES.MEDIUM;
  if (type === GAP_TYPES.ENRICH_EXISTING) return similarity >= 0.42 ? GAP_CONFIDENCES.HIGH : GAP_CONFIDENCES.MEDIUM;
  if (similarity <= 0.15) return GAP_CONFIDENCES.HIGH;
  if (similarity <= 0.32) return GAP_CONFIDENCES.MEDIUM;
  return GAP_CONFIDENCES.LOW;
}

function getReason(type, candidate, best) {
  if (type === GAP_TYPES.DUPLICATE) return '분석자료의 내용이 현재 업무 정의에 이미 반영되어 있을 가능성이 높습니다.';
  if (type === GAP_TYPES.ENRICH_EXISTING) return `현재 유사업무(${best.task.id})는 있으나 분석자료의 추가 절차를 완료기준 또는 주의사항에 보강할 필요가 있습니다.`;
  return '현재 업무 마스터에서 충분히 유사한 업무를 찾지 못했습니다. 신규 업무 여부를 담당자가 확인해야 합니다.';
}

function suggestedTags(candidate) {
  return tokenizeText(candidate).filter(token => token.length >= 2).slice(0, 4);
}

export function validateGapResult(result = {}) {
  const errors = [];
  if (!Object.values(GAP_TYPES).includes(result.type)) errors.push('분석결과 type이 올바르지 않습니다.');
  if (!Object.values(GAP_CONFIDENCES).includes(result.confidence)) errors.push('분석결과 confidence가 올바르지 않습니다.');
  if (!Object.values(GAP_STATUSES).includes(result.status)) errors.push('분석결과 status가 올바르지 않습니다.');
  if (typeof result.candidate !== 'string' || !result.candidate.trim()) errors.push('분석 후보 문장이 없습니다.');
  if (typeof result.reason !== 'string' || !result.reason.trim()) errors.push('분석 근거 설명이 없습니다.');
  if (!result.source || typeof result.source !== 'object') errors.push('분석자료 근거가 없습니다.');
  else {
    if (result.source.sourceId !== undefined && (typeof result.source.sourceId !== 'string' || !result.source.sourceId)) errors.push('분석자료 ID 형식이 올바르지 않습니다.');
    if (typeof result.source.filename !== 'string' || !result.source.filename) errors.push('분석자료 파일명이 없습니다.');
    if (result.type !== GAP_TYPES.DUPLICATE && (typeof result.source.excerpt !== 'string' || !result.source.excerpt.trim())) errors.push('신규·보강 후보에는 근거 문장이 필요합니다.');
  }
  if (!Array.isArray(result.similarTasks)) errors.push('유사업무 목록이 배열이 아닙니다.');
  else result.similarTasks.forEach(item => {
    if (!item || typeof item.taskId !== 'string' || typeof item.title !== 'string' || !Number.isFinite(Number(item.similarity)) || Number(item.similarity) < 0 || Number(item.similarity) > 1) errors.push('유사업무 결과 구조가 올바르지 않습니다.');
  });
  return { valid:errors.length === 0, errors };
}

export function validateGapResults(results = []) {
  if (!Array.isArray(results)) return { valid:false, errors:['분석결과가 배열이 아닙니다.'] };
  const errors = results.flatMap((result, index) => validateGapResult(result).errors.map(error => `results[${index}]: ${error}`));
  return { valid:errors.length === 0, errors };
}

export function analyzeLocalRules({ sources = [], tasks = [] } = {}) {
  const results = [];
  const seenCandidates = new Set();
  sources.forEach((source, sourceIndex) => {
    const sourceId = source.id || `SRC-${String(sourceIndex + 1).padStart(3, '0')}`;
    extractCandidatePhrases(source).forEach(({ candidate, excerpt }) => {
      const candidateKey = normalizeText(candidate);
      if (seenCandidates.has(candidateKey)) return;
      seenCandidates.add(candidateKey);
      const classification = classifyCandidate(candidate, tasks);
      const best = classification.best;
      const result = {
        id:`GAP-${String(results.length + 1).padStart(3, '0')}`,
        type:classification.type,
        confidence:getConfidence(classification.type, best),
        candidate,
        source:{ sourceId, filename:source.filename || '분석자료', excerpt },
        similarTasks:findSimilarTasks(candidate, tasks),
        reason:getReason(classification.type, candidate, best),
        status:GAP_STATUSES.REVIEW,
        suggestedTags:suggestedTags(candidate)
      };
      if (validateGapResult(result).valid) results.push(result);
    });
  });
  return results;
}
