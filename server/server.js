import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8080;
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(response, statusCode, payload, headOnly = false) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(statusCode, {
    'content-length': body.length,
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(headOnly ? undefined : body);
}

function resolveStaticPath(root, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const safePath = decodedPath.replaceAll('\\', '/');
  if (safePath.includes('\0') || safePath.split('/').includes('..')) return null;

  const requestedPath = safePath === '/' ? '/index.html' : normalize(safePath);
  const filePath = resolve(root, `.${requestedPath}`);
  const relativePath = relative(root, filePath);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) return null;
  return filePath;
}

async function handleRequest(request, response, root = PROJECT_ROOT) {
  const method = request.method || 'GET';
  let requestUrl;
  try {
    requestUrl = new URL(request.url || '/', 'http://localhost');
  } catch {
    sendJson(response, 400, { error: 'Invalid request URL' });
    return;
  }

  const headOnly = method === 'HEAD';
  if (requestUrl.pathname === '/api/health') {
    if (method !== 'GET' && !headOnly) {
      sendJson(response, 405, { error: 'Method not allowed' }, headOnly);
      return;
    }
    sendJson(response, 200, {
      aiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
      status: 'ok',
    }, headOnly);
    return;
  }

  if (method !== 'GET' && !headOnly) {
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }

  const filePath = resolveStaticPath(root, requestUrl.pathname);
  if (!filePath) {
    sendJson(response, 403, { error: 'Forbidden' }, headOnly);
    return;
  }

  try {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      sendJson(response, 404, { error: 'Not found' }, headOnly);
      return;
    }
    const body = await readFile(filePath);
    response.writeHead(200, {
      'content-length': body.length,
      'content-type': CONTENT_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
    });
    response.end(headOnly ? undefined : body);
  } catch (error) {
    if (error.code === 'ENOENT') {
      sendJson(response, 404, { error: 'Not found' }, headOnly);
      return;
    }
    sendJson(response, 500, { error: 'Internal server error' }, headOnly);
  }
}

export function createApp(options = {}) {
  const root = options.root || PROJECT_ROOT;
  return createServer((request, response) => {
    handleRequest(request, response, root).catch(() => {
      if (!response.headersSent) sendJson(response, 500, { error: 'Internal server error' });
      else response.destroy();
    });
  });
}

export function startServer(options = {}) {
  const host = options.host || process.env.HOST || DEFAULT_HOST;
  const port = Number(options.port || process.env.PORT || DEFAULT_PORT);
  const server = createApp(options);
  server.listen(port, host, () => {
    console.log(`Reporter Training Ops listening on http://${host}:${port}`);
  });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer();
}
