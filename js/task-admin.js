import { PHASES, PHASE_INDEX, PHASE_PREFIXES } from './constants.js';
import { CATEGORIES, RISK_LEVELS, TIMING_TYPES, validateTasks } from './validator.js';
import { csvRowsToTasks, parseCsv } from './csv.js';
import { getDataSummary, getDependencyReferences, getQualityWarnings, getValidationReport } from './data-quality.js';

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character])); }
function nonEmpty(value) { return typeof value === 'string' && value.trim().length > 0; }
function pipeValues(value) { return String(value || '').split('|').map(item => item.trim()).filter(Boolean); }

export function createTaskAdminSession(tasks = []) {
  return { tasks:clone(tasks), originalTasks:clone(tasks), query:'', phaseFilter:'전체', showInactive:false, selectedTaskId:tasks[0]?.id || null, draft:null, draftOriginalId:null, importPreview:null, message:'', messageIsError:false };
}

export function sortAdminTasks(tasks = []) {
  return [...tasks].sort((first, second) => (PHASE_INDEX[first?.phase] ?? 99) - (PHASE_INDEX[second?.phase] ?? 99) || (Number(first?.sortOrder) || 0) - (Number(second?.sortOrder) || 0) || String(first?.id || '').localeCompare(String(second?.id || '')));
}

export function filterAdminTasks(tasks = [], { query = '', phase = '전체', showInactive = false } = {}) {
  const normalized = query.trim().toLocaleLowerCase('ko-KR');
  return sortAdminTasks(tasks.filter(task => {
    const haystack = [task.id, task.phase, task.timing?.label, task.category, task.title, task.description, task.assigneeRole, task.riskLevel, ...(task.tags || [])].join(' ').toLocaleLowerCase('ko-KR');
    return (phase === '전체' || task.phase === phase) && (showInactive || task.active !== false) && (!normalized || haystack.includes(normalized));
  }));
}

export function suggestNextTaskId(tasks = [], phase = PHASES[0]) {
  const prefix = Object.entries(PHASE_PREFIXES).find(([, value]) => value === phase)?.[0] || 'PRE';
  const pattern = new RegExp(`^${prefix}-(\\d{3})$`);
  const maximum = tasks.reduce((max, task) => {
    const match = String(task?.id || '').match(pattern);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${String(maximum + 1).padStart(3, '0')}`;
}

export function getTimingLabel(type, value) {
  const number = Number(value);
  if (type === 'D_DAY' && Number.isInteger(number)) return `D${number > 0 ? '+' : ''}${number}`;
  if (type === 'TRAINING_DAY' && Number.isInteger(number)) return `교육 ${number}일차`;
  if (type === 'END_DAY') return '교육 종료일';
  if (type === 'AFTER_END' && Number.isInteger(number)) return `종료 후 ${number}일`;
  return '수동 일정';
}

export function createBlankTask(tasks = [], phase = PHASES[0]) {
  const maxSortOrder = tasks.reduce((max, task) => Math.max(max, Number(task?.sortOrder) || 0), 0);
  return {
    id:suggestNextTaskId(tasks, phase), phase,
    timing:{ type:'D_DAY', value:-1, label:'D-1' }, category:'기타', title:'', description:'', required:true,
    assigneeRole:'', estimatedMinutes:0, completionCriteria:[''], riskLevel:'LOW', dependencies:[], documents:[],
    handover:{ caution:'', knowhow:'', previousIssue:'' }, budget:{ related:false, category:null },
    repeat:{ enabled:false, rule:null }, aiCheck:{ enabled:false, keywords:[] }, tags:[], active:true, sortOrder:maxSortOrder + 10
  };
}

export function startAdminEdit(session, taskId = null, phase = PHASES[0]) {
  const task = taskId ? session.tasks.find(candidate => candidate.id === taskId) : null;
  session.selectedTaskId = task?.id || null;
  session.draftOriginalId = task?.id || null;
  session.draft = clone(task || createBlankTask(session.tasks, phase));
  return session.draft;
}

export function cancelAdminEdit(session) {
  session.draft = null;
  session.draftOriginalId = null;
}

export function validateAdminEdit(tasks, task, originalId = null) {
  const duplicate = tasks.some(candidate => candidate.id === task.id && candidate.id !== originalId);
  if (duplicate) return { valid:false, errors:[`ID '${task.id}'가 이미 존재합니다.`] };
  const candidateTasks = originalId ? tasks.map(candidate => candidate.id === originalId ? task : candidate) : [...tasks, task];
  return validateTasks(candidateTasks);
}

export function commitAdminEdit(session, task, originalId = session.draftOriginalId) {
  const validation = validateAdminEdit(session.tasks, task, originalId);
  if (!validation.valid) return { success:false, ...validation };
  session.tasks = originalId ? session.tasks.map(candidate => candidate.id === originalId ? clone(task) : candidate) : [...session.tasks, clone(task)];
  session.selectedTaskId = task.id;
  cancelAdminEdit(session);
  return { success:true, errors:[] };
}

export function removeAdminTask(tasks, taskId) {
  const references = getDependencyReferences(tasks, taskId);
  if (references.length) return { success:false, references, errors:[`${taskId}는 다른 업무의 선행업무로 사용 중이어서 삭제할 수 없습니다.`] };
  return { success:true, tasks:tasks.filter(task => task.id !== taskId), references:[], errors:[] };
}

export function setAdminTaskActive(tasks, taskId, active) {
  return tasks.map(task => task.id === taskId ? { ...task, active:Boolean(active) } : task);
}

export function readTaskAdminForm(form) {
  const get = name => form.elements.namedItem(name)?.value ?? '';
  const checked = name => Boolean(form.elements.namedItem(name)?.checked);
  const timingType = get('timingType');
  const timingValue = String(get('timingValue')).trim();
  const task = {
    id:String(get('id')).trim(), phase:String(get('phase')).trim(),
    timing:{ type:timingType, value:timingValue === '' ? null : Number(timingValue), label:String(get('timingLabel')).trim() },
    category:String(get('category')).trim(), title:String(get('title')).trim(), description:String(get('description')).trim(),
    required:checked('required'), assigneeRole:String(get('assigneeRole')).trim(), estimatedMinutes:Number(get('estimatedMinutes')),
    completionCriteria:[...form.querySelectorAll('[data-criteria-input]')].map(input => input.value.trim()).filter(Boolean),
    riskLevel:String(get('riskLevel')).trim(), dependencies:[...form.querySelectorAll('[data-dependency-id]')].map(element => element.dataset.dependencyId),
    documents:[...form.querySelectorAll('[data-document-name]')].map(row => ({ name:row.querySelector('[data-document-name]')?.value.trim() || '', required:Boolean(row.querySelector('[data-document-required]')?.checked) })).filter(document => document.name),
    handover:{ caution:String(get('handoverCaution')).trim(), knowhow:String(get('handoverKnowhow')).trim(), previousIssue:String(get('handoverPreviousIssue')).trim() },
    budget:{ related:checked('budgetRelated'), category:String(get('budgetCategory')).trim() || null },
    repeat:{ enabled:checked('repeatEnabled'), rule:String(get('repeatRule')).trim() || null },
    aiCheck:{ enabled:checked('aiEnabled'), keywords:pipeValues(get('aiKeywords')) }, tags:pipeValues(get('tags')),
    active:checked('active'), sortOrder:Number(get('sortOrder'))
  };
  if (timingType === 'END_DAY') task.timing.value = 0;
  return task;
}

export function populateTaskAdminForm(form, task, tasks = []) {
  const set = (name, value) => { const field = form.elements.namedItem(name); if (field) field.value = value ?? ''; };
  const setChecked = (name, value) => { const field = form.elements.namedItem(name); if (field) field.checked = Boolean(value); };
  set('id', task.id); set('phase', task.phase); set('timingType', task.timing?.type); set('timingValue', task.timing?.value ?? ''); set('timingLabel', task.timing?.label);
  set('category', task.category); set('title', task.title); set('description', task.description); setChecked('required', task.required); set('assigneeRole', task.assigneeRole); set('estimatedMinutes', task.estimatedMinutes);
  set('riskLevel', task.riskLevel); set('handoverCaution', task.handover?.caution); set('handoverKnowhow', task.handover?.knowhow); set('handoverPreviousIssue', task.handover?.previousIssue);
  setChecked('budgetRelated', task.budget?.related); set('budgetCategory', task.budget?.category || ''); setChecked('repeatEnabled', task.repeat?.enabled); set('repeatRule', task.repeat?.rule || ''); setChecked('aiEnabled', task.aiCheck?.enabled); set('aiKeywords', (task.aiCheck?.keywords || []).join('|')); set('tags', (task.tags || []).join('|')); setChecked('active', task.active !== false); set('sortOrder', task.sortOrder);
  const original = form.elements.namedItem('originalId'); if (original) original.value = task.id;
  const categoryOptions = [...new Set([...CATEGORIES, ...tasks.map(candidate => candidate.category).filter(Boolean)])];
  const category = form.elements.namedItem('category');
  if (category) { category.innerHTML = categoryOptions.map(option => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join(''); category.value = task.category; }
  const phase = form.elements.namedItem('phase');
  if (phase) { phase.innerHTML = PHASES.map(option => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join(''); phase.value = task.phase; }
  const risk = form.elements.namedItem('riskLevel');
  if (risk) { risk.innerHTML = RISK_LEVELS.map(option => `<option value="${option}">${option}</option>`).join(''); risk.value = task.riskLevel; }
  const timing = form.elements.namedItem('timingType');
  if (timing) { timing.innerHTML = TIMING_TYPES.map(option => `<option value="${option}">${option}</option>`).join(''); timing.value = task.timing?.type; }
  renderCriteriaInputs(form, task.completionCriteria);
  renderDocumentInputs(form, task.documents);
  renderDependencyInputs(form, task.dependencies);
}

export function renderCriteriaInputs(form, criteria = ['']) {
  const list = form.querySelector('#criteria-list');
  if (!list) return;
  list.innerHTML = (criteria.length ? criteria : ['']).map(item => `<div class="admin-array-row"><input data-criteria-input type="text" value="${escapeHtml(item)}" placeholder="완료기준을 입력하세요" /><button type="button" class="admin-icon-button" data-admin-action="remove-criteria" aria-label="완료기준 삭제">−</button></div>`).join('');
}

export function renderDocumentInputs(form, documents = []) {
  const list = form.querySelector('#documents-list');
  if (!list) return;
  list.innerHTML = documents.map(document => `<div class="admin-array-row admin-document-row"><input data-document-name type="text" value="${escapeHtml(document.name)}" placeholder="관련자료명" /><label><input data-document-required type="checkbox" ${document.required ? 'checked' : ''} /> 필수</label><button type="button" class="admin-icon-button" data-admin-action="remove-document" aria-label="관련자료 삭제">−</button></div>`).join('');
}

export function renderDependencyInputs(form, dependencies = []) {
  const list = form.querySelector('#dependency-list');
  if (!list) return;
  list.innerHTML = dependencies.map(id => `<li data-dependency-id="${escapeHtml(id)}"><span>${escapeHtml(id)}</span><button type="button" class="admin-icon-button" data-admin-action="remove-dependency" aria-label="선행업무 삭제">×</button></li>`).join('');
}

export function renderDependencyOptions(form, tasks = []) {
  const select = form.querySelector('#admin-dependency-select');
  const search = form.querySelector('#admin-dependency-search');
  if (!select) return;
  const currentId = form.elements.namedItem('id')?.value;
  const selected = new Set([...form.querySelectorAll('[data-dependency-id]')].map(element => element.dataset.dependencyId));
  const query = String(search?.value || '').trim().toLocaleLowerCase('ko-KR');
  const options = sortAdminTasks(tasks).filter(task => task.id !== currentId && !selected.has(task.id) && (!query || `${task.id} ${task.title}`.toLocaleLowerCase('ko-KR').includes(query)));
  select.innerHTML = `<option value="">선행업무를 선택하세요</option>${options.map(task => `<option value="${escapeHtml(task.id)}">${escapeHtml(task.id)} ${escapeHtml(task.title)}</option>`).join('')}`;
}

function renderDetail(task) {
  if (!task) return '<div class="admin-empty">업무를 선택하거나 새 업무를 추가하세요.</div>';
  const criteria = (task.completionCriteria || []).map(item => `<li>${escapeHtml(item)}</li>`).join('') || '<li>없음</li>';
  const dependencies = (task.dependencies || []).map(item => `<li>${escapeHtml(item)}</li>`).join('') || '<li>없음</li>';
  const documents = (task.documents || []).map(item => `<li>${escapeHtml(item.name)}${item.required ? ' (필수)' : ''}</li>`).join('') || '<li>없음</li>';
  return `<div class="admin-detail-heading"><div><span class="admin-kicker">${escapeHtml(task.id)}</span><h3>${escapeHtml(task.title || '제목 미입력')}</h3></div><button type="button" class="settings-save" data-admin-action="edit-selected">수정</button></div>
    <dl class="admin-detail-grid"><div><dt>단계</dt><dd>${escapeHtml(task.phase)}</dd></div><div><dt>기준일</dt><dd>${escapeHtml(task.timing?.label)}</dd></div><div><dt>카테고리</dt><dd>${escapeHtml(task.category)}</dd></div><div><dt>필수여부</dt><dd>${task.required ? '필수' : '선택'}</dd></div><div><dt>위험도</dt><dd>${escapeHtml(task.riskLevel)}</dd></div><div><dt>담당역할</dt><dd>${escapeHtml(task.assigneeRole)}</dd></div><div><dt>예상소요시간</dt><dd>${escapeHtml(task.estimatedMinutes)}분</dd></div><div><dt>상태</dt><dd>${task.active === false ? '비활성' : '운영중'}</dd></div></dl>
    <div class="admin-detail-block"><strong>설명</strong><p>${escapeHtml(task.description)}</p></div><div class="admin-detail-block"><strong>완료기준</strong><ul>${criteria}</ul></div><div class="admin-detail-block"><strong>선행업무</strong><ul>${dependencies}</ul></div><div class="admin-detail-block"><strong>관련자료</strong><ul>${documents}</ul></div>
    <div class="admin-detail-block"><strong>인수인계</strong><p>주의: ${escapeHtml(task.handover?.caution)}<br />Know-how: ${escapeHtml(task.handover?.knowhow)}<br />이전 이슈: ${escapeHtml(task.handover?.previousIssue)}</p></div><div class="admin-detail-block"><strong>예산·태그</strong><p>${task.budget?.related ? `관련 예산: ${escapeHtml(task.budget.category || '항목 미입력')}` : '예산 무관'} · ${(task.tags || []).map(escapeHtml).join(', ') || '태그 없음'}</p></div>`;
}

function renderValidation(summary) {
  const errorMarkup = summary.validation.errors.length ? `<div class="admin-issue-group is-error"><strong>검증 오류 ${summary.validation.errors.length}건</strong><ul>${summary.validation.errors.map(error => `<li>${escapeHtml(error)}</li>`).join('')}</ul></div>` : '<p class="admin-valid-message">구조 검증 오류가 없습니다.</p>';
  const warningMarkup = summary.warnings.length ? `<div class="admin-issue-group is-warning"><strong>품질 경고 ${summary.warnings.length}건</strong><ul>${summary.warnings.map(warning => `<li>${escapeHtml(warning.message)}</li>`).join('')}</ul></div>` : '<p class="admin-valid-message">품질 경고가 없습니다.</p>';
  return `${errorMarkup}${warningMarkup}<div class="admin-quality-grid">${summary.qualityMetrics.map(metric => `<div><span>${escapeHtml(metric.label)}</span><strong>${metric.percent}%</strong><small>${metric.complete}/${metric.total}건 · 입력 완성도 참고값</small></div>`).join('')}</div>`;
}

function renderImportPreview(session) {
  const panel = document.querySelector('#csv-import-preview');
  if (!panel) return;
  const preview = session.importPreview;
  if (!preview) { panel.hidden = true; return; }
  panel.hidden = false;
  panel.querySelector('[data-preview-total]').textContent = `${preview.rows.length}건`;
  panel.querySelector('[data-preview-valid]').textContent = `${preview.validTasks.length}건`;
  panel.querySelector('[data-preview-warning]').textContent = `${preview.warnings.length}건`;
  panel.querySelector('[data-preview-error]').textContent = `${preview.errors.length}건`;
  panel.querySelector('[data-preview-table]').innerHTML = preview.rows.length ? preview.rows.map(row => `<tr><td>${row.rowNumber}</td><td>${escapeHtml(row.task.id || '-')}</td><td>${escapeHtml(row.task.title || '-')}</td><td class="${row.errors.length ? 'is-error' : 'is-valid'}">${row.errors.length ? escapeHtml(row.errors.join(' ')) : '정상'}</td></tr>`).join('') : '<tr><td colspan="4">가져올 행이 없습니다.</td></tr>';
  const applyButton = panel.querySelector('[data-admin-action="apply-csv"]');
  if (applyButton) applyButton.disabled = preview.validTasks.length === 0;
}

export function buildCsvImportPreview(text) {
  const parsed = parseCsv(text);
  const converted = csvRowsToTasks(parsed);
  const validation = getValidationReport(converted.tasks);
  const rowErrors = converted.rowMap.map(item => [...item.errors]);
  validation.errors.forEach(error => {
    const indexMatch = error.match(/^tasks\[(\d+)\]/);
    if (indexMatch) rowErrors[Number(indexMatch[1])]?.push(error);
    else {
      const ids = error.match(/(?:PRE|OPS|CLS|FIN|RPT)-\d{3}/g) || [];
      ids.forEach(id => { const index = converted.tasks.findIndex(task => task.id === id); if (index >= 0) rowErrors[index].push(error); });
    }
  });
  const errors = [...new Set([...parsed.errors, ...converted.errors, ...validation.errors])];
  const rows = converted.rowMap.map((item, index) => ({ ...item, errors:[...new Set(rowErrors[index])] }));
  const validTasks = converted.tasks.filter((task, index) => rows[index]?.errors.length === 0);
  const warnings = getQualityWarnings(validTasks);
  return { rows, validTasks, warnings, errors, validation };
}

export function renderTaskAdmin(session) {
  const summary = getDataSummary(session.tasks);
  const visibleTasks = filterAdminTasks(session.tasks, { query:session.query, phase:session.phaseFilter, showInactive:session.showInactive });
  const summaryElement = document.querySelector('#task-admin-summary');
  const table = document.querySelector('#task-master-table');
  const validationElement = document.querySelector('#task-admin-validation');
  const detail = document.querySelector('#task-admin-detail-view');
  const editorWrap = document.querySelector('#task-admin-editor-wrap');
  const form = document.querySelector('#task-admin-form');
  if (summaryElement) summaryElement.innerHTML = [
    ['전체', summary.total], ['필수', summary.required], ['선택', summary.optional], ['HIGH', summary.highRisk], ['선행업무 있음', summary.withDependencies], ['검증 오류', summary.validationErrors]
  ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('');
  if (table) table.innerHTML = visibleTasks.length ? visibleTasks.map(task => `<tr class="${task.id === session.selectedTaskId ? 'is-selected' : ''}" data-admin-task-id="${escapeHtml(task.id)}"><td><button type="button" class="admin-row-button" data-admin-action="select-task" data-admin-task-id="${escapeHtml(task.id)}"><strong>${escapeHtml(task.id)}</strong><span>${escapeHtml(task.title)}</span></button></td><td>${escapeHtml(task.phase)}</td><td>${escapeHtml(task.timing?.label)}</td><td>${escapeHtml(task.category)}</td><td>${task.required ? '필수' : '선택'}</td><td>${escapeHtml(task.riskLevel)}</td><td>${escapeHtml(task.assigneeRole)}</td><td>${task.dependencies?.length || 0}</td><td><span class="admin-status ${task.active === false ? 'is-inactive' : ''}">${task.active === false ? '비활성' : '운영중'}</span></td></tr>`).join('') : '<tr><td colspan="9" class="admin-table-empty">조건에 맞는 업무가 없습니다.</td></tr>';
  if (validationElement) validationElement.innerHTML = renderValidation(summary);
  const selected = session.draft || session.tasks.find(task => task.id === session.selectedTaskId);
  if (detail) { detail.hidden = Boolean(session.draft); detail.innerHTML = renderDetail(selected); }
  if (editorWrap) editorWrap.hidden = !session.draft;
  if (session.draft && form) populateTaskAdminForm(form, session.draft, session.tasks);
  renderImportPreview(session);
  document.querySelector('#admin-task-count-label')?.replaceChildren(document.createTextNode(`${visibleTasks.length}건 표시`));
  document.querySelector('#task-admin-message').textContent = session.message || '';
  document.querySelector('#task-admin-message').classList.toggle('is-error', session.messageIsError);
  const exportJson = document.querySelector('[data-admin-action="export-json"]');
  if (exportJson) exportJson.disabled = !summary.validation.valid;
  const query = document.querySelector('#admin-search'); if (query && query.value !== session.query) query.value = session.query;
  const phase = document.querySelector('#admin-phase-filter'); if (phase) phase.value = session.phaseFilter;
  const inactive = document.querySelector('#admin-show-inactive'); if (inactive) inactive.checked = session.showInactive;
}
