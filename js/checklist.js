import { parseCsv } from './csv.js';
import { CHECKLIST_STATUS, getChecklistState } from './storage.js';
import { createOperationalTasks, loadChecklistMetadata, mergeChecklistMetadata, validateChecklistMetadata } from './checklist-metadata.js';

export const CHECKLIST_HEADERS = Object.freeze(['구간', '업무', '비고', 'key']);
export const CHECKLIST_SECTION_ORDER = Object.freeze([
  'D-30 ~ D-25', 'D-25 ~ D-20', 'D-20 ~ D-10', 'D-7 ~ D-3', 'D-3',
  '1일차', '2일차(글쓰기 이론)', '3일차', '4일차', '5일차', '6일차',
  '7일차(글쓰기 실습)', '8일차', '9일차(현장교육)', '10일차', '종료 후'
]);
export const CHECKLIST_EXPECTED_COUNTS = Object.freeze({
  'D-30 ~ D-25':2, 'D-25 ~ D-20':2, 'D-20 ~ D-10':3, 'D-7 ~ D-3':8, 'D-3':8,
  '1일차':16, '2일차(글쓰기 이론)':7, '3일차':7, '4일차':7, '5일차':11,
  '6일차':6, '7일차(글쓰기 실습)':7, '8일차':11, '9일차(현장교육)':6,
  '10일차':12, '종료 후':4
});
export const CHECKLIST_EXPECTED_TOTAL = 117;
export const CHECKLIST_THREE_CHECK_NOTE = '3회 체크';

const SENSITIVE_PATTERNS = Object.freeze([
  { label:'주민등록번호', pattern:/\b\d{6}[-\s]?\d{7}\b/ },
  { label:'전화번호', pattern:/(?:\+82[-\s]?)?01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/ },
  { label:'계좌번호', pattern:/(?:계좌|account)[^\n]{0,12}\d[\d\s-]{7,24}/i },
  { label:'이메일', pattern:/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i }
]);

function asText(value) { return value === null || value === undefined ? '' : String(value); }

export function parseChecklistCsv(text = '') {
  const parsed = parseCsv(text);
  const errors = [...parsed.errors];
  const headerIndex = Object.fromEntries((parsed.headers || []).map((header, index) => [header, index]));
  const missingHeaders = CHECKLIST_HEADERS.filter(header => !Object.prototype.hasOwnProperty.call(headerIndex, header));
  if (missingHeaders.length) errors.push(`업무목록.csv 필수 컬럼이 없습니다: ${missingHeaders.join(', ')}`);
  const rows = missingHeaders.length ? [] : (parsed.rows || []).map(({ values, rowNumber }) => ({
    section:asText(values[headerIndex['구간']]),
    work:asText(values[headerIndex['업무']]),
    note:asText(values[headerIndex['비고']]),
    key:asText(values[headerIndex.key]).trim(),
    rowNumber
  }));
  return { headers:parsed.headers || [], rows, errors };
}

export function validateChecklistRows(rows = [], parseErrors = []) {
  const errors = [...parseErrors];
  const empty = { section:0, work:0, key:0 };
  const duplicateKeys = [];
  const seenKeys = new Set();
  const counts = {};
  const sections = [];
  let threeCheck = 0;
  (rows || []).forEach(row => {
    const rowNumber = row?.rowNumber || 0;
    const section = asText(row?.section);
    const work = asText(row?.work);
    const key = asText(row?.key).trim();
    if (!section.trim()) { empty.section += 1; errors.push(`업무목록.csv ${rowNumber}행: 구간이 비어 있습니다.`); }
    if (!work.trim()) { empty.work += 1; errors.push(`업무목록.csv ${rowNumber}행: 업무가 비어 있습니다.`); }
    if (!key) { empty.key += 1; errors.push(`업무목록.csv ${rowNumber}행: key가 비어 있습니다.`); }
    if (key && seenKeys.has(key)) { duplicateKeys.push(key); errors.push(`업무목록.csv ${rowNumber}행: key가 중복됩니다 (${key}).`); }
    if (key) seenKeys.add(key);
    if (section && !Object.prototype.hasOwnProperty.call(counts, section)) { counts[section] = 0; sections.push(section); }
    if (section) counts[section] += 1;
    if (asText(row?.note) === CHECKLIST_THREE_CHECK_NOTE) threeCheck += 1;
  });
  const expectedMismatches = [];
  if (rows.length !== CHECKLIST_EXPECTED_TOTAL) expectedMismatches.push(`전체 업무 ${rows.length}건 (기대값 ${CHECKLIST_EXPECTED_TOTAL}건)`);
  CHECKLIST_SECTION_ORDER.forEach(section => {
    if (counts[section] !== CHECKLIST_EXPECTED_COUNTS[section]) expectedMismatches.push(`${section} ${counts[section] || 0}건 (기대값 ${CHECKLIST_EXPECTED_COUNTS[section]}건)`);
  });
  if (sections.length !== CHECKLIST_SECTION_ORDER.length) expectedMismatches.push(`구간 ${sections.length}개 (기대값 ${CHECKLIST_SECTION_ORDER.length}개)`);
  return {
    valid:errors.length === 0,
    errors,
    rows:[...(rows || [])],
    total:rows.length,
    sections,
    counts,
    empty,
    duplicateKeys,
    uniqueKeys:seenKeys.size,
    threeCheck,
    expectedMismatches
  };
}

export function groupChecklistItems(rows = []) {
  const groups = [];
  const groupMap = new Map();
  (rows || []).forEach(item => {
    if (!groupMap.has(item.section)) {
      const group = { section:item.section, items:[] };
      groupMap.set(item.section, group);
      groups.push(group);
    }
    groupMap.get(item.section).items.push(item);
  });
  return groups;
}

export async function loadChecklist(url = './업무목록.csv', metadataUrl = './data/checklist-metadata.json') {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`업무목록.csv 로드 실패: HTTP ${response.status}`);
  const parsed = parseChecklistCsv(await response.text());
  const report = validateChecklistRows(parsed.rows, parsed.errors);
  if (!report.valid) {
    const error = new Error('업무목록.csv 검증 오류');
    error.report = report;
    throw error;
  }
  const metadata = await loadMetadataForEnvironment(metadataUrl);
  const metadataReport = validateChecklistMetadata(metadata, report.rows);
  if (!metadataReport.valid) {
    const error = new Error('체크리스트 메타데이터와 업무목록.csv 연결 오류');
    error.report = { ...report, metadataReport };
    throw error;
  }
  const items = mergeChecklistMetadata(report.rows, metadata);
  return { ...report, report, metadata, metadataReport, items, tasks:createOperationalTasks(items), groups:groupChecklistItems(items) };
}

export function isThreeCheckItem(item) { return asText(item?.note) === CHECKLIST_THREE_CHECK_NOTE; }

export function normalizeChecklistChecks(item, entry = {}) {
  if (!isThreeCheckItem(item)) return [];
  const checks = Array.isArray(entry.checks) ? entry.checks : [];
  return [0, 1, 2].map(index => checks[index] === true);
}

export function getChecklistItemState(item, state) {
  const entry = getChecklistState(state, item.key);
  const checks = normalizeChecklistChecks(item, entry);
  if (entry.status === CHECKLIST_STATUS.NOT_APPLICABLE) return { ...entry, checks };
  if (isThreeCheckItem(item)) {
    const status = checks.every(Boolean)
      ? CHECKLIST_STATUS.COMPLETED
      : checks.some(Boolean)
        ? CHECKLIST_STATUS.IN_PROGRESS
        : entry.memo
          ? CHECKLIST_STATUS.IN_PROGRESS
          : CHECKLIST_STATUS.NOT_STARTED;
    return { ...entry, status, checks };
  }
  return { ...entry, checks:[] };
}

async function loadMetadataForEnvironment(url) {
  try {
    return await loadChecklistMetadata(url);
  } catch (error) {
    if (typeof process === 'undefined' || !process.versions?.node || !String(url).startsWith('.') || !/Failed to parse URL|Invalid URL/.test(error?.message || '')) throw error;
    const { readFile } = await import('node:fs/promises');
    const metadata = JSON.parse(await readFile(new URL('../data/checklist-metadata.json', import.meta.url), 'utf8'));
    return metadata;
  }
}

export function getChecklistStats(items = [], state) {
  const stats = { total:items.length, complete:0, progress:0, pending:0, notApplicable:0, applicable:items.length, percent:0 };
  items.forEach(item => {
    const status = getChecklistItemState(item, state).status;
    if (status === CHECKLIST_STATUS.COMPLETED) stats.complete += 1;
    else if (status === CHECKLIST_STATUS.IN_PROGRESS) stats.progress += 1;
    else if (status === CHECKLIST_STATUS.NOT_APPLICABLE) stats.notApplicable += 1;
    else stats.pending += 1;
  });
  stats.applicable = stats.total - stats.notApplicable;
  stats.percent = stats.applicable ? Math.round((stats.complete / stats.applicable) * 100) : 0;
  return stats;
}

export function getCurrentChecklistSection(groups = [], state) {
  const firstIncompleteIndex = groups.findIndex(group => {
    const stats = getChecklistStats(group.items, state);
    return stats.pending > 0 || stats.progress > 0;
  });
  if (firstIncompleteIndex < 0) return groups.length ? '모든 구간 완료' : '미착수';
  const laterTouchedIndex = groups.reduce((latestIndex, group, index) => {
    if (index <= firstIncompleteIndex) return latestIndex;
    const touched = (group.items || []).some(item => {
      const itemState = getChecklistItemState(item, state);
      return itemState.status === CHECKLIST_STATUS.COMPLETED || itemState.status === CHECKLIST_STATUS.IN_PROGRESS || Boolean(itemState.memo);
    });
    return touched ? index : latestIndex;
  }, -1);
  return groups[laterTouchedIndex >= 0 ? laterTouchedIndex : firstIncompleteIndex]?.section || '미착수';
}

export function findChecklistSensitivePatterns(value = '') {
  const text = asText(value);
  return SENSITIVE_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label);
}

export function filterChecklistItems(items = [], state, { query = '', filter = 'all', section = '전체' } = {}) {
  const normalizedQuery = asText(query).trim().toLocaleLowerCase('ko-KR');
  return items.filter(item => {
    const itemState = getChecklistItemState(item, state);
    const searchable = [item.section, item.work, item.note, item.phase, item.metadata?.category, item.metadata?.assigneeRole, itemState.memo].map(asText).join('\n').toLocaleLowerCase('ko-KR');
    const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
    const matchesSection = section === '전체' || item.section === section;
    const matchesFilter = filter === 'all'
      || (filter === 'incomplete' && itemState.status !== CHECKLIST_STATUS.COMPLETED && itemState.status !== CHECKLIST_STATUS.NOT_APPLICABLE)
      || (filter === 'completed' && itemState.status === CHECKLIST_STATUS.COMPLETED)
      || (filter === 'in_progress' && itemState.status === CHECKLIST_STATUS.IN_PROGRESS)
      || (filter === 'not_applicable' && itemState.status === CHECKLIST_STATUS.NOT_APPLICABLE);
    return matchesQuery && matchesSection && matchesFilter;
  });
}
