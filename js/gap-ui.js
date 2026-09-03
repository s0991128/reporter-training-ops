const TYPE_LABELS = Object.freeze({ NEW_TASK:'신규업무 후보', ENRICH_EXISTING:'기존업무 보강 후보', DUPLICATE:'이미 반영 가능성 높음' });
const CONFIDENCE_LABELS = Object.freeze({ HIGH:'높은 확인 필요', MEDIUM:'중간 확인 필요', LOW:'낮은 확인 필요' });

function element(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function field(label, value, className = '') {
  const wrapper = element('div', `gap-field ${className}`.trim());
  wrapper.append(element('span', 'gap-field-label', label), element('p', 'gap-field-value', value || '확인할 내용 없음'));
  return wrapper;
}

export function renderGapSummary(elements, results = []) {
  const counts = {
    all:results.length,
    high:results.filter(result => result.confidence === 'HIGH').length,
    medium:results.filter(result => result.confidence === 'MEDIUM').length,
    low:results.filter(result => result.confidence === 'LOW').length
  };
  Object.entries(counts).forEach(([key, value]) => { if (elements[key]) elements[key].textContent = String(value); });
}

export function renderGapSources(container, sources = [], onRemove = () => {}) {
  container.replaceChildren();
  if (!sources.length) {
    container.append(element('p', 'gap-empty', '아직 추가한 분석자료가 없습니다.'));
    return;
  }
  sources.forEach(source => {
    const item = element('article', 'gap-source-item');
    const info = element('div', 'gap-source-info');
    info.append(element('strong', '', source.filename), element('span', '', `${source.type} · ${Math.max(0, String(source.content || '').length).toLocaleString('ko-KR')}자`));
    const remove = element('button', 'gap-source-remove', '삭제');
    remove.type = 'button';
    remove.addEventListener('click', () => onRemove(source.id));
    item.append(info, remove);
    container.append(item);
  });
}

function renderSimilarTasks(result) {
  const wrapper = element('div', 'gap-similar');
  wrapper.append(element('span', 'gap-field-label', '가장 유사한 현재 업무'));
  if (!result.similarTasks?.length) {
    wrapper.append(element('p', 'gap-field-value', '유사 업무를 찾지 못했습니다.'));
    return wrapper;
  }
  const list = element('ul');
  result.similarTasks.slice(0, 3).forEach(task => {
    const item = element('li');
    item.append(element('strong', '', task.taskId), document.createTextNode(` ${task.title || ''} `), element('span', 'gap-similarity', `유사도 ${Math.round(Number(task.similarity || 0) * 100)}%`));
    list.append(item);
  });
  wrapper.append(list);
  return wrapper;
}

function renderResultBody(result, handlers) {
  const body = element('div', 'gap-result-body');
  body.append(field('근거 파일', result.source?.filename || '분석자료'));
  if (result.source?.excerpt) body.append(field('근거 문장', `“${result.source.excerpt}”`, 'gap-evidence'));
  body.append(renderSimilarTasks(result), field('판정 근거', result.reason));
  if (result.type === 'ENRICH_EXISTING') body.append(field('제안', `완료기준 또는 주의사항에 ‘${result.candidate}’ 추가 검토`));
  const actions = element('div', 'gap-result-actions');
  if (result.status === 'REVIEW') {
    if (result.type === 'NEW_TASK') {
      const accept = element('button', 'settings-save', '신규업무 후보로 등록');
      accept.type = 'button'; accept.addEventListener('click', () => handlers.onAcceptNew?.(result)); actions.append(accept);
    }
    if (result.type === 'ENRICH_EXISTING') {
      const edit = element('button', 'settings-save', '기존업무 수정 검토');
      edit.type = 'button'; edit.addEventListener('click', () => handlers.onOpenExisting?.(result)); actions.append(edit);
    }
    const ignore = element('button', 'settings-cancel', '무시');
    ignore.type = 'button'; ignore.addEventListener('click', () => handlers.onIgnore?.(result)); actions.append(ignore);
  } else {
    actions.append(element('span', `gap-status gap-status-${result.status.toLowerCase()}`, result.status === 'ACCEPTED' ? '업무 마스터 검토로 전달됨' : '무시됨'));
  }
  body.append(actions);
  return body;
}

function renderResultCard(result, handlers) {
  const isDuplicate = result.type === 'DUPLICATE';
  const card = element(isDuplicate ? 'details' : 'article', `gap-result-card gap-result-${result.type.toLowerCase()} ${result.status !== 'REVIEW' ? 'is-reviewed' : ''}`.trim());
  const heading = element(isDuplicate ? 'summary' : 'div', 'gap-result-heading');
  const titleBlock = element('div', 'gap-result-title');
  titleBlock.append(element('span', 'gap-type-label', TYPE_LABELS[result.type] || result.type), element('h3', '', result.candidate));
  const meta = element('div', 'gap-result-meta');
  meta.append(element('span', `gap-confidence gap-confidence-${String(result.confidence || '').toLowerCase()}`, CONFIDENCE_LABELS[result.confidence] || result.confidence || '검토 필요'));
  if (result.status !== 'REVIEW') meta.append(element('span', 'gap-review-status', result.status === 'ACCEPTED' ? '전달됨' : '무시됨'));
  heading.append(titleBlock, meta);
  card.append(heading);
  card.append(renderResultBody(result, handlers));
  return card;
}

export function renderGapResults(container, results = [], filter = 'all', handlers = {}) {
  container.replaceChildren();
  const visible = results.filter(result => filter === 'all' || result.type === filter || (filter === 'high' && result.confidence === 'HIGH'));
  if (!visible.length) {
    container.append(element('p', 'gap-empty', results.length ? '현재 분류에 해당하는 결과가 없습니다.' : '분석 결과가 여기에 표시됩니다.'));
    return;
  }
  visible.forEach(result => container.append(renderResultCard(result, handlers)));
}

