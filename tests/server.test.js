import assert from 'node:assert/strict';
import { createApp } from '../server/server.js';

const server = createApp();
await new Promise(resolveServer => server.listen(0, '127.0.0.1', resolveServer));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

try {
  const healthResponse = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  assert.equal(health.status, 'ok');
  assert.equal(typeof health.aiConfigured, 'boolean');

  const indexResponse = await fetch(`${baseUrl}/`);
  assert.equal(indexResponse.status, 200);
  assert.match(await indexResponse.text(), /수습기자 기본교육 운영 미니리더/);

  const missingResponse = await fetch(`${baseUrl}/not-found.txt`);
  assert.equal(missingResponse.status, 404);

  const postResponse = await fetch(`${baseUrl}/api/health`, { method: 'POST' });
  assert.equal(postResponse.status, 405);
} finally {
  await new Promise((resolveClose, rejectClose) => server.close(error => error ? rejectClose(error) : resolveClose()));
}

console.log('server.test.js: PASS');
