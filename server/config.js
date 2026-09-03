const DEFAULT_LIMITS = Object.freeze({
  maxFiles:5,
  maxFileChars:200000,
  maxTotalChars:600000,
  maxTasks:500,
  maxRequestBytes:2000000,
  maxCandidateChars:500,
  maxExcerptChars:600,
  maxReasonChars:1500
});

function positiveInteger(value, fallback, minimum = 1) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

export function getConfig(env = process.env) {
  const apiKey = typeof env.OPENAI_API_KEY === 'string' ? env.OPENAI_API_KEY.trim() : '';
  const model = typeof env.AI_MODEL === 'string' && env.AI_MODEL.trim() ? env.AI_MODEL.trim() : 'gpt-5';
  const port = positiveInteger(env.PORT, 8080);
  const timeoutMs = positiveInteger(env.AI_TIMEOUT_MS, 30000, 1000);
  return Object.freeze({
    host:typeof env.HOST === 'string' && env.HOST.trim() ? env.HOST.trim() : '0.0.0.0',
    port,
    model,
    timeoutMs,
    apiKey,
    apiUrl:'https://api.openai.com/v1/responses',
    limits:DEFAULT_LIMITS
  });
}

export function isAiConfigured(config = getConfig()) {
  return Boolean(config.apiKey);
}

export { DEFAULT_LIMITS };
