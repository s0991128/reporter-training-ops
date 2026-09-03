import { createServer as createHttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig, isAiConfigured } from './config.js';
import { analyzeWithLLM, AiServiceError } from './ai-service.js';
import { findSensitivePatterns, validateRequestPayload } from './validation.js';

const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ALLOWED_STATIC_ROOTS = new Set(['index.html', 'css', 'js', 'data']);
const MIME_TYPES = Object.freeze({
  '.html':'text/html; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.txt':'text/plain; charset=utf-8',
  '.md':'text/markdown; charset=utf-8',
  '.csv':'text/csv; charset=utf-8',
  '.ico':'image/x-icon'
});

function sendJson(response, status, body) {
  const json = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type':'application/json; charset=utf-8',
    'Content-Length':Buffer.byteLength(json),
    'Cache-Control':'no-store'
  });
  response.end(json);
}

function setCorsHeaders(response, request) {
  const origin = request.headers.origin;
  response.setHeader('Access-Control-Allow-Origin', origin || '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Vary', 'Origin');
}

function readRequestBody(request, maxBytes) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let rejected = false;
    request.on('data', chunk => {
      if (rejected) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        rejected = true;
        reject(new AiServiceError('INPUT_TOO_LARGE', '분석자료가 너무 큽니다.', 413));
        request.resume();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => { if (!rejected) resolveBody(Buffer.concat(chunks).toString('utf8')); });
    request.on('error', error => { if (!rejected) reject(error); });
  });
}

function getStaticFile(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  const relativePath = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  if (!relativePath || relativePath.includes('\0')) return null;
  const firstSegment = relativePath.split(/[\\/]/)[0];
  if (!ALLOWED_STATIC_ROOTS.has(firstSegment)) return null;
  const candidate = resolve(PROJECT_ROOT, relativePath);
  const safeRelativePath = relative(PROJECT_ROOT, candidate);
  if (!safeRelativePath || safeRelativePath.startsWith('..') || isAbsolute(safeRelativePath)) return null;
  return candidate;
}

async function serveStatic(request, response) {
  const filePath = getStaticFile(new URL(request.url, 'http://localhost').pathname);
  if (!filePath) { sendJson(response, 404, { error:'페이지를 찾을 수 없습니다.' }); return; }
  try {
    const body = await readFile(filePath);
    const contentType = MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
    response.writeHead(200, { 'Content-Type':contentType, 'Content-Length':body.length, 'Cache-Control':'no-cache' });
    if (request.method === 'HEAD') response.end();
    else response.end(body);
  } catch { sendJson(response, 404, { error:'페이지를 찾을 수 없습니다.' }); }
}

function logEvent(event) {
  const safeEvent = { requestId:event.requestId, durationMs:event.durationMs, resultCount:event.resultCount ?? undefined, errorCode:event.errorCode ?? undefined };
  console.info(JSON.stringify(safeEvent));
}

async function handleGapAnalysis(request, response, options) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  try {
    const rawBody = await readRequestBody(request, options.config.limits.maxRequestBytes);
    let payload;
    try { payload = JSON.parse(rawBody); }
    catch { throw new AiServiceError('INVALID_REQUEST', '잘못된 분석 요청입니다.', 400); }
    const validation = validateRequestPayload(payload, options.config);
    if (!validation.valid) {
      if (validation.sensitivePatterns.length) throw new AiServiceError('SENSITIVE_DATA', '개인정보가 포함된 분석자료는 먼저 정리해 주세요.', 422);
      throw new AiServiceError('INVALID_REQUEST', '잘못된 분석 요청입니다.', 400);
    }
    if (!isAiConfigured(options.config)) throw new AiServiceError('NOT_CONFIGURED', 'AI 서비스가 설정되지 않았습니다.', 503);
    const results = await options.aiService(validation.payload, options.config);
    logEvent({ requestId, durationMs:Date.now() - startedAt, resultCount:results.length });
    sendJson(response, 200, { results });
  } catch (error) {
    const normalized = error instanceof AiServiceError ? error : new AiServiceError('PROVIDER_ERROR', 'AI 분석 중 오류가 발생했습니다.', 502);
    logEvent({ requestId, durationMs:Date.now() - startedAt, errorCode:normalized.code });
    sendJson(response, normalized.status || 502, { error:normalized.message, code:normalized.code });
  }
}

export function createServer({ config = getConfig(), aiService = analyzeWithLLM } = {}) {
  return createHttpServer(async (request, response) => {
    setCorsHeaders(response, request);
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/api/health' && request.method === 'GET') {
      sendJson(response, 200, { status:'ok', aiConfigured:isAiConfigured(config) });
      return;
    }
    if (pathname === '/api/ai-gap-analysis' && request.method === 'POST') {
      await handleGapAnalysis(request, response, { config, aiService });
      return;
    }
    if (request.method === 'GET' || request.method === 'HEAD') { await serveStatic(request, response); return; }
    sendJson(response, 405, { error:'허용되지 않는 요청입니다.' });
  });
}

export function startServer(config = getConfig()) {
  const server = createServer({ config });
  server.listen(config.port, config.host, () => {
    console.log(`reporter-training-ops 서버가 ${config.host}:${config.port}에서 실행 중입니다.`);
  });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startServer();
