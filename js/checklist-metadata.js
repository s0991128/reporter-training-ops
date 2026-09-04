import { PHASES } from './constants.js';

export const CHECKLIST_METADATA_VERSION = 1;
export const METADATA_REVIEW_STATUS = 'PENDING_REVIEW';

const SECTION_TIMING = Object.freeze({
  'D-30 ~ D-25': { type:'D_DAY', value:-30, label:'D-30' },
  'D-25 ~ D-20': { type:'D_DAY', value:-25, label:'D-25' },
  'D-20 ~ D-10': { type:'D_DAY', value:-20, label:'D-20' },
  'D-7 ~ D-3': { type:'D_DAY', value:-7, label:'D-7' },
  'D-3': { type:'D_DAY', value:-3, label:'D-3' },
  '1일차': { type:'TRAINING_DAY', value:1, label:'교육 1일차' },
  '2일차(글쓰기 이론)': { type:'TRAINING_DAY', value:2, label:'교육 2일차' },
  '3일차': { type:'TRAINING_DAY', value:3, label:'교육 3일차' },
  '4일차': { type:'TRAINING_DAY', value:4, label:'교육 4일차' },
  '5일차': { type:'TRAINING_DAY', value:5, label:'교육 5일차' },
  '6일차': { type:'TRAINING_DAY', value:6, label:'교육 6일차' },
  '7일차(글쓰기 실습)': { type:'TRAINING_DAY', value:7, label:'교육 7일차' },
  '8일차': { type:'TRAINING_DAY', value:8, label:'교육 8일차' },
  '9일차(현장교육)': { type:'TRAINING_DAY', value:9, label:'교육 9일차' },
  '10일차': { type:'TRAINING_DAY', value:10, label:'교육 10일차' },
  '종료 후': { type:'AFTER_END', value:1, label:'종료 후' }
});

const SECTION_PHASE = Object.freeze({
  'D-30 ~ D-25':'사전준비', 'D-25 ~ D-20':'사전준비', 'D-20 ~ D-10':'사전준비',
  'D-7 ~ D-3':'사전준비', 'D-3':'사전준비', '1일차':'교육운영',
  '2일차(글쓰기 이론)':'교육운영', '3일차':'교육운영', '4일차':'교육운영',
  '5일차':'교육운영', '6일차':'교육운영', '7일차(글쓰기 실습)':'교육운영',
  '8일차':'교육운영', '9일차(현장교육)':'교육운영', '10일차':'교육운영', '종료 후':'종료처리'
});

const CATEGORY_RULES = Object.freeze([
  [/강사/, '강사'], [/식당|식사|다과|간식/, '식사'], [/버스|출발시간|차량/, '교통'],
  [/숙박/, '숙박'], [/보험/, '계약'], [/인쇄|교재|서적|명패|쇼핑백|배터리|수료증|경품|물품/, '물품'],
  [/공문|결재|신청|출석부|안내 메일|카카오톡|이러닝|공지|보고서|정산|지출결의/, '행정'],
  [/사진|촬영/, '성과'], [/강의|교육|과제|세미나/, '교육과정']
]);

function asText(value) { return value === null || value === undefined ? '' : String(value); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

function inferCategory(work) {
  const match = CATEGORY_RULES.find(([pattern]) => pattern.test(work));
  return match?.[1] || '기타';
}

function getTiming(item, entry) {
  if (entry?.timing && typeof entry.timing === 'object') return clone(entry.timing);
  return clone(SECTION_TIMING[item.section] || { type:'MANUAL', value:null, label:item.section });
}

function getPhase(item, entry) { return PHASES.includes(entry?.phase) ? entry.phase : SECTION_PHASE[item.section] || '교육운영'; }

export function validateChecklistMetadata(metadata, items = []) {
  const errors = [];
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return { valid:false, errors:['체크리스트 메타데이터는 객체여야 합니다.'] };
  if (metadata.version !== CHECKLIST_METADATA_VERSION) errors.push(`메타데이터 버전은 ${CHECKLIST_METADATA_VERSION}이어야 합니다.`);
  if (metadata.source?.file !== '업무목록.csv') errors.push('메타데이터 source.file은 업무목록.csv여야 합니다.');
  if (!metadata.items || typeof metadata.items !== 'object' || Array.isArray(metadata.items)) return { valid:false, errors:[...errors, '메타데이터 items는 객체여야 합니다.'] };
  const itemKeys = new Set(items.map(item => item.key).filter(Boolean));
  const metadataKeys = Object.keys(metadata.items);
  if (itemKeys.size && metadataKeys.length !== itemKeys.size) errors.push(`메타데이터 업무 수 ${metadataKeys.length}건이 CSV 업무 수 ${itemKeys.size}건과 다릅니다.`);
  if (itemKeys.size) itemKeys.forEach(key => { if (!Object.prototype.hasOwnProperty.call(metadata.items, key)) errors.push(`CSV key '${key}'의 메타데이터가 없습니다.`); });
  metadataKeys.forEach(key => {
    const entry = metadata.items[key];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { errors.push(`${key}: 메타데이터 항목은 객체여야 합니다.`); return; }
    if (entry.phase && !PHASES.includes(entry.phase)) errors.push(`${key}: 허용되지 않은 phase입니다.`);
    if (entry.timing && typeof entry.timing === 'object' && !['D_DAY', 'TRAINING_DAY', 'END_DAY', 'AFTER_END', 'MANUAL'].includes(entry.timing.type)) errors.push(`${key}: 허용되지 않은 timing.type입니다.`);
    if (entry.reviewStatus && entry.reviewStatus !== METADATA_REVIEW_STATUS && entry.reviewStatus !== 'REVIEWED') errors.push(`${key}: reviewStatus가 올바르지 않습니다.`);
  });
  return { valid:errors.length === 0, errors, metadataCount:metadataKeys.length, csvCount:itemKeys.size };
}

export function mergeChecklistMetadata(items = [], metadata = {}) {
  const entries = metadata?.items || {};
  return items.map(item => {
    const entry = entries[item.key] || {};
    const phase = getPhase(item, entry);
    const timing = getTiming(item, entry);
    return {
      ...item,
      phase,
      timing,
      metadata: {
        reviewStatus:entry.reviewStatus || metadata.reviewStatus || METADATA_REVIEW_STATUS,
        category:entry.category || inferCategory(item.work),
        categorySource:entry.category ? 'REVIEWED' : 'DERIVED_PENDING_REVIEW',
        required:typeof entry.required === 'boolean' ? entry.required : null,
        riskLevel:['HIGH', 'MEDIUM', 'LOW'].includes(entry.riskLevel) ? entry.riskLevel : 'MEDIUM',
        assigneeRole:entry.assigneeRole || '담당자 검토 필요',
        estimatedMinutes:Number.isInteger(entry.estimatedMinutes) ? entry.estimatedMinutes : 0,
        completionCriteria:Array.isArray(entry.completionCriteria) ? entry.completionCriteria : [],
        dependencies:Array.isArray(entry.dependencies) ? entry.dependencies : [],
        budget:entry.budget && typeof entry.budget === 'object' ? clone(entry.budget) : { related:false, category:null },
        documents:Array.isArray(entry.documents) ? clone(entry.documents) : [],
        handover:entry.handover && typeof entry.handover === 'object' ? clone(entry.handover) : { caution:'', knowhow:'', previousIssue:'' },
        conditional:Boolean(entry.conditional), pendingFields:Array.isArray(entry.pendingFields) ? [...entry.pendingFields] : ['required', 'riskLevel', 'assigneeRole', 'completionCriteria', 'dependencies', 'budget']
      }
    };
  });
}

export function createOperationalTasks(items = []) {
  return items.map((item, index) => {
    const metadata = item.metadata || {};
    const criteria = metadata.completionCriteria.length ? metadata.completionCriteria : ['CSV 업무 문장 기준으로 수행 여부 확인'];
    return {
      id:item.key,
      sourceKey:item.key,
      phase:item.phase,
      timing:item.timing,
      category:metadata.category || '기타',
      title:item.work,
      description:metadata.reviewStatus === METADATA_REVIEW_STATUS ? '업무목록.csv 원문 기준 업무입니다. 세부 설명은 담당자 검토 후 보완합니다.' : item.work,
      required:metadata.required,
      assigneeRole:metadata.assigneeRole,
      estimatedMinutes:metadata.estimatedMinutes,
      completionCriteria:criteria,
      riskLevel:metadata.riskLevel,
      dependencies:metadata.dependencies,
      documents:metadata.documents,
      handover:{
        caution:item.note || metadata.handover?.caution || '담당자 검토 필요',
        knowhow:metadata.handover?.knowhow || '',
        previousIssue:metadata.handover?.previousIssue || ''
      },
      budget:metadata.budget,
      repeat:{ enabled:false, rule:null },
      aiCheck:{ enabled:true, keywords:[item.work, item.section].filter(Boolean) },
      tags:[item.section, metadata.category].filter(Boolean),
      active:true,
      sortOrder:index + 1,
      metadataReviewStatus:metadata.reviewStatus,
      metadataPendingFields:metadata.pendingFields,
      conditional:metadata.conditional
    };
  });
}

export async function loadChecklistMetadata(url = './data/checklist-metadata.json') {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`체크리스트 메타데이터 로드 실패: HTTP ${response.status}`);
  const metadata = await response.json();
  const validation = validateChecklistMetadata(metadata);
  if (!validation.valid) {
    const error = new Error('체크리스트 메타데이터 검증 오류');
    error.report = validation;
    throw error;
  }
  return metadata;
}

export { SECTION_PHASE, SECTION_TIMING };
