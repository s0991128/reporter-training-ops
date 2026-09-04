import { analyzeLocalRules, validateGapResults, validateGapSources } from './gap-analysis.js';

export const AI_MODES = Object.freeze({ LOCAL_RULE:'LOCAL_RULE', REMOTE_AI:'REMOTE_AI' });
const REMOTE_AI_TIMEOUT_MS = 35000;

function getConfiguredEndpoint(endpoint = '') {
  if (typeof endpoint === 'string' && endpoint.trim()) return endpoint.trim();
  if (typeof globalThis !== 'undefined' && typeof globalThis.REPORTER_TRAINING_AI_ENDPOINT === 'string') return globalThis.REPORTER_TRAINING_AI_ENDPOINT.trim();
  return '/api/ai-gap-analysis';
}

function toRemoteTask(task = {}) {
  return {
    id:task.id, phase:task.phase, title:task.title, description:task.description,
    completionCriteria:Array.isArray(task.completionCriteria) ? task.completionCriteria : [],
    handover:task.handover && typeof task.handover === 'object' ? { caution:task.handover.caution || '', knowhow:task.handover.knowhow || '' } : {},
    tags:Array.isArray(task.tags) ? task.tags : [],
    aiCheck:task.aiCheck && typeof task.aiCheck === 'object' ? { keywords:Array.isArray(task.aiCheck.keywords) ? task.aiCheck.keywords : [] } : { keywords:[] }
  };
}

export function createRemoteAiPayload(sources = [], tasks = []) {
  return {
    sources:sources.map(source => ({ filename:source.filename, content:source.content })),
    tasks:tasks.map(toRemoteTask)
  };
}

function getRemoteErrorMessage(status, payload = {}) {
  if (status === 400) return 'AI 분석 요청을 확인해 주세요.';
  if (status === 413) return '분석자료가 너무 큽니다.';
  if (status === 422 || payload.code === 'SENSITIVE_DATA') return '개인정보 형식이 감지되어 AI로 전송하지 않았습니다. 민감정보를 제거한 뒤 다시 시도해 주세요.';
  if (status === 429) return '잠시 후 다시 시도해 주세요.';
  if (status === 503 || payload.code === 'AI_NOT_CONFIGURED' || payload.code === 'NOT_CONFIGURED') return 'AI 서비스가 설정되지 않았습니다.';
  if (status === 504 || payload.code === 'TIMEOUT') return 'AI 응답시간을 초과했습니다.';
  if (payload.code === 'INVALID_RESPONSE') return 'AI 응답 형식을 확인할 수 없습니다.';
  return 'AI 분석 중 오류가 발생했습니다.';
}

export async function analyzeGap({ sources = [], tasks = [], mode = AI_MODES.LOCAL_RULE, endpoint = '' } = {}) {
  if (mode === AI_MODES.LOCAL_RULE) return { mode, results:analyzeLocalRules({ sources, tasks }), error:null };
  if (mode !== AI_MODES.REMOTE_AI) return { mode, results:[], error:'지원하지 않는 AI 분석 모드입니다.' };
  const inputValidation = validateGapSources(sources);
  if (!inputValidation.valid) {
    const error = inputValidation.sensitivePatterns.length
      ? '개인정보 형식이 감지되어 AI로 전송하지 않았습니다. 민감정보를 제거한 뒤 다시 시도해 주세요.'
      : inputValidation.errors.join(' ');
    return { mode, results:[], error };
  }
  const remoteEndpoint = getConfiguredEndpoint(endpoint);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_AI_TIMEOUT_MS);
  try {
    const response = await fetch(remoteEndpoint, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', Accept:'application/json' },
      signal:controller.signal,
      body:JSON.stringify(createRemoteAiPayload(sources, tasks))
    });
    let payload = {};
    try { payload = await response.json(); } catch { payload = {}; }
    if (!response.ok) return { mode, results:[], error:getRemoteErrorMessage(response.status, payload) };
    const results = Array.isArray(payload) ? payload : payload?.results;
    const normalizedResults = Array.isArray(results) ? results.map((result, index) => ({ ...result, id:result.id || `GAP-REMOTE-${String(index + 1).padStart(3, '0')}`, status:result.status || 'REVIEW' })) : results;
    const validation = validateGapResults(normalizedResults);
    if (!validation.valid) return { mode, results:[], error:'AI 서버의 분석 결과 형식이 올바르지 않습니다.' };
    return { mode, results:normalizedResults, error:null };
  } catch (error) {
    if (error?.name === 'AbortError') return { mode, results:[], error:'AI 응답시간을 초과했습니다.' };
    return { mode, results:[], error:'AI 서버에 연결할 수 없습니다.' };
  } finally {
    clearTimeout(timeout);
  }
}
