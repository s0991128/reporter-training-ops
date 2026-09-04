import { getConfig, isAiConfigured } from './config.js';
import { buildAnalysisInput, GAP_RESULT_JSON_SCHEMA, SYSTEM_PROMPT } from './prompt.js';
import { validateLlmResults } from './validation.js';

export class AiServiceError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = 'AiServiceError';
    this.code = code;
    this.status = status;
  }
}

function extractOutputText(response = {}) {
  if (typeof response.output_text === 'string' && response.output_text.trim()) return response.output_text.trim();
  const parts = [];
  (Array.isArray(response.output) ? response.output : []).forEach(item => {
    (Array.isArray(item.content) ? item.content : []).forEach(content => {
      if (content.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
    });
  });
  return parts.join('').trim();
}

function mapProviderStatus(status) {
  if (status === 401 || status === 403) return { code:'NOT_CONFIGURED', message:'AI 서비스가 설정되지 않았습니다.', responseStatus:503 };
  if (status === 408 || status === 504) return { code:'TIMEOUT', message:'AI 응답시간을 초과했습니다.', responseStatus:504 };
  if (status === 429) return { code:'RATE_LIMIT', message:'잠시 후 다시 시도해 주세요.', responseStatus:429 };
  return { code:'PROVIDER_ERROR', message:'AI 분석 중 오류가 발생했습니다.', responseStatus:502 };
}

export async function analyzeWithLLM(payload, config = getConfig(), fetchImpl = globalThis.fetch) {
  if (!isAiConfigured(config)) throw new AiServiceError('NOT_CONFIGURED', 'AI 서비스가 설정되지 않았습니다.', 503);
  if (typeof fetchImpl !== 'function') throw new AiServiceError('PROVIDER_ERROR', 'AI 분석 중 오류가 발생했습니다.', 502);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(config.apiUrl, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', Accept:'application/json', Authorization:`Bearer ${config.apiKey}` },
      signal:controller.signal,
      body:JSON.stringify({
        model:config.model,
        store:false,
        input:[
          { role:'system', content:[{ type:'input_text', text:SYSTEM_PROMPT }] },
          { role:'user', content:[{ type:'input_text', text:buildAnalysisInput(payload) }] }
        ],
        text:{ format:{ type:'json_schema', name:'reporter_training_gap_analysis', strict:true, schema:GAP_RESULT_JSON_SCHEMA } }
      })
    });
    if (!response.ok) {
      const mapped = mapProviderStatus(response.status);
      throw new AiServiceError(mapped.code, mapped.message, mapped.responseStatus);
    }
    let responseJson;
    try { responseJson = await response.json(); }
    catch { throw new AiServiceError('INVALID_RESPONSE', 'AI 응답 형식을 확인할 수 없습니다.', 502); }
    const outputText = extractOutputText(responseJson);
    if (!outputText) throw new AiServiceError('INVALID_RESPONSE', 'AI 응답 형식을 확인할 수 없습니다.', 502);
    let parsed;
    try { parsed = JSON.parse(outputText); }
    catch { throw new AiServiceError('INVALID_RESPONSE', 'AI 응답 형식을 확인할 수 없습니다.', 502); }
    const validation = validateLlmResults(parsed, payload, config);
    if (!validation.valid) throw new AiServiceError('INVALID_RESPONSE', 'AI 응답 형식을 확인할 수 없습니다.', 502);
    return validation.results;
  } catch (error) {
    if (error instanceof AiServiceError) throw error;
    if (error?.name === 'AbortError') throw new AiServiceError('TIMEOUT', 'AI 응답시간을 초과했습니다.', 504);
    throw new AiServiceError('PROVIDER_ERROR', 'AI 분석 중 오류가 발생했습니다.', 502);
  } finally {
    clearTimeout(timeout);
  }
}
