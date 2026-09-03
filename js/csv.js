export const CSV_HEADERS = Object.freeze([
  'id', 'phase', 'timing_type', 'timing_value', 'timing_label', 'category', 'title', 'description',
  'required', 'assigneeRole', 'estimatedMinutes', 'completionCriteria', 'riskLevel', 'dependencies',
  'documents', 'handover_caution', 'handover_knowhow', 'handover_previousIssue', 'budget_related',
  'budget_category', 'tags', 'active', 'sortOrder'
]);

function valueOrEmpty(value) { return value === null || value === undefined ? '' : String(value); }
function splitPipe(value) { return valueOrEmpty(value).split('|').map(item => item.trim()).filter(Boolean); }
function parseBoolean(value, field, errors, rowNumber) {
  const normalized = valueOrEmpty(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  errors.push(`CSV ${rowNumber}행: ${field}는 true 또는 false여야 합니다.`);
  return false;
}
function parseInteger(value, field, errors, rowNumber, { nullable = false, minimum = null } = {}) {
  const normalized = valueOrEmpty(value).trim();
  if (nullable && normalized === '') return null;
  if (!/^-?\d+$/.test(normalized)) {
    errors.push(`CSV ${rowNumber}행: ${field}는 정수여야 합니다.`);
    return 0;
  }
  const number = Number(normalized);
  if (!Number.isSafeInteger(number) || (minimum !== null && number < minimum)) {
    errors.push(`CSV ${rowNumber}행: ${field} 값이 허용 범위를 벗어났습니다.`);
    return 0;
  }
  return number;
}

function parseDocuments(value) {
  return splitPipe(value).map(item => {
    const separator = item.lastIndexOf('::');
    if (separator < 0) return { name:item, required:true };
    return { name:item.slice(0, separator).trim(), required:item.slice(separator + 2).trim().toLowerCase() !== 'optional' };
  }).filter(document => document.name);
}

function documentToCsvValue(document) {
  if (!document || typeof document !== 'object' || !document.name) return '';
  return `${document.name}::${document.required ? 'required' : 'optional'}`;
}

export function parseCsv(text = '') {
  const source = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  const errors = [];
  let row = [];
  let field = '';
  let quoted = false;
  let rowNumber = 1;

  const pushRow = () => {
    if (row.length === 0 && field === '') { rowNumber += 1; return; }
    row.push(field);
    if (row.some(value => value.trim() !== '')) rows.push({ values:row, rowNumber });
    row = [];
    field = '';
    rowNumber += 1;
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"' && field === '') { quoted = true; continue; }
    if (character === ',') { row.push(field); field = ''; continue; }
    if (character === '\r' || character === '\n') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      pushRow();
      continue;
    }
    field += character;
  }
  if (quoted) errors.push('CSV 파일의 따옴표가 닫히지 않았습니다.');
  if (field !== '' || row.length) pushRow();

  const headerRow = rows.shift();
  const headers = (headerRow?.values || []).map((header, index) => index === 0 ? header.replace(/^\uFEFF/, '').trim() : header.trim());
  if (!headers.length) errors.push('CSV 헤더가 없습니다.');
  return { headers, rows, errors };
}

export function csvRowsToTasks(parsed) {
  const errors = [...(parsed?.errors || [])];
  const tasks = [];
  const rowMap = [];
  if (!Array.isArray(parsed?.headers) || parsed.headers.join(',') !== CSV_HEADERS.join(',')) {
    errors.push(`CSV 헤더는 다음 순서와 일치해야 합니다: ${CSV_HEADERS.join(', ')}`);
    return { tasks, rowMap, errors };
  }

  (parsed.rows || []).forEach(({ values, rowNumber }) => {
    const rowErrors = [];
    const row = Object.fromEntries(CSV_HEADERS.map((header, index) => [header, values[index] ?? '']));
    if (values.length > CSV_HEADERS.length) rowErrors.push(`CSV ${rowNumber}행: 열 수가 너무 많습니다.`);
    const task = {
      id:row.id.trim(), phase:row.phase.trim(),
      timing:{ type:row.timing_type.trim(), value:parseInteger(row.timing_value, 'timing_value', rowErrors, rowNumber, { nullable:true }), label:row.timing_label.trim() },
      category:row.category.trim(), title:row.title.trim(), description:row.description.trim(),
      required:parseBoolean(row.required, 'required', rowErrors, rowNumber), assigneeRole:row.assigneeRole.trim(),
      estimatedMinutes:parseInteger(row.estimatedMinutes, 'estimatedMinutes', rowErrors, rowNumber, { minimum:0 }),
      completionCriteria:splitPipe(row.completionCriteria), riskLevel:row.riskLevel.trim(), dependencies:splitPipe(row.dependencies),
      documents:parseDocuments(row.documents),
      handover:{ caution:row.handover_caution.trim(), knowhow:row.handover_knowhow.trim(), previousIssue:row.handover_previousIssue.trim() },
      budget:{ related:parseBoolean(row.budget_related, 'budget_related', rowErrors, rowNumber), category:row.budget_category.trim() || null },
      repeat:{ enabled:false, rule:null }, aiCheck:{ enabled:false, keywords:[] }, tags:splitPipe(row.tags),
      active:parseBoolean(row.active, 'active', rowErrors, rowNumber), sortOrder:parseInteger(row.sortOrder, 'sortOrder', rowErrors, rowNumber, { minimum:0 })
    };
    if (!task.id) rowErrors.push(`CSV ${rowNumber}행: id가 비어 있습니다.`);
    tasks.push(task);
    rowMap.push({ rowNumber, task, errors:rowErrors });
    errors.push(...rowErrors);
  });
  return { tasks, rowMap, errors };
}

export function taskToCsvRow(task) {
  return CSV_HEADERS.map(header => {
    const values = {
      id:task.id, phase:task.phase, timing_type:task.timing?.type, timing_value:task.timing?.value,
      timing_label:task.timing?.label, category:task.category, title:task.title, description:task.description,
      required:task.required, assigneeRole:task.assigneeRole, estimatedMinutes:task.estimatedMinutes,
      completionCriteria:Array.isArray(task.completionCriteria) ? task.completionCriteria.join('|') : '',
      riskLevel:task.riskLevel, dependencies:Array.isArray(task.dependencies) ? task.dependencies.join('|') : '',
      documents:Array.isArray(task.documents) ? task.documents.map(documentToCsvValue).filter(Boolean).join('|') : '',
      handover_caution:task.handover?.caution, handover_knowhow:task.handover?.knowhow, handover_previousIssue:task.handover?.previousIssue,
      budget_related:task.budget?.related, budget_category:task.budget?.category, tags:Array.isArray(task.tags) ? task.tags.join('|') : '',
      active:task.active, sortOrder:task.sortOrder
    };
    return valueOrEmpty(values[header]);
  });
}

function escapeCsv(value) {
  const text = valueOrEmpty(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function tasksToCsv(tasks = []) {
  const rows = [CSV_HEADERS, ...tasks.map(taskToCsvRow)];
  return `\uFEFF${rows.map(row => row.map(escapeCsv).join(',')).join('\r\n')}\r\n`;
}

export function downloadTextFile(content, filename, mimeType = 'text/plain;charset=utf-8') {
  if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
  const blob = new Blob([content], { type:mimeType });
  const link = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
  return true;
}

export function getDateFilename(prefix, extension, date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  const pad = number => String(number).padStart(2, '0');
  return `${prefix}-${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}.${extension}`;
}
