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

const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  'http://localhost:8080',
  'http://127.0.0.1:8080'
]);

function positiveInteger(value, fallback, minimum = 1) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

function parseAllowedOrigins(value) {
  if (typeof value !== 'string' || !value.trim()) return [...DEFAULT_ALLOWED_ORIGINS];
  return [...new Set(value.split(',').map(origin => origin.trim()).filter(Boolean))];
}

export function getConfig(env = process.env) {
  const apiKey = typeof env.OPENAI_API_KEY === 'string' ? env.OPENAI_API_KEY.trim() : '';
  const model = typeof env.AI_MODEL === 'string' && env.AI_MODEL.trim() ? env.AI_MODEL.trim() : 'gpt-5';
  const port = positiveInteger(env.PORT, 8080);
  const timeoutMs = positiveInteger(env.AI_TIMEOUT_MS, 30000, 1000);
  return Object.freeze({
    host:typeof env.HOST === 'string' && env.HOST.trim() ? env.HOST.trim() : '127.0.0.1',
    port,
    model,
    timeoutMs,
    apiKey,
    apiUrl:'https://api.openai.com/v1/responses',
    limits:DEFAULT_LIMITS,
    allowedOrigins:Object.freeze(parseAllowedOrigins(env.ALLOWED_ORIGINS))
  });
}

export function isAiConfigured(config = getConfig()) {
  return Boolean(config.apiKey);
}

export { DEFAULT_ALLOWED_ORIGINS, DEFAULT_LIMITS };
