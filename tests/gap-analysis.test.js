import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyzeGap, createRemoteAiPayload } from '../js/ai-adapter.js';
import { GAP_TYPES, analyzeLocalRules, calculateTextSimilarity, extractCandidatePhrases, findSensitivePatterns, findSimilarTasks, getSourceType, validateGapResult, validateGapSources } from '../js/gap-analysis.js';

const tasks = JSON.parse(await readFile(new URL('../data/tasks.json', import.meta.url), 'utf8'));
const fixture = await readFile(new URL('./fixtures/sample-handover.md', import.meta.url), 'utf8');
const source = { id:'SRC-001', filename:'sample-handover.md', type:'markdown', content:fixture };

assert.equal(getSourceType('notes.TXT'), 'text');
assert.equal(getSourceType('handover.md'), 'markdown');
assert.equal(getSourceType('tasks.csv'), 'csv');
assert.equal(getSourceType('tasks.json'), 'json');
assert.equal(getSourceType('document.pdf'), null);

const textCandidates = extractCandidatePhrases({ filename:'notes.txt', type:'text', content:'강사 섭외\n강사 섭외\n교육 전날 장소 재확인' });
assert.deepEqual(textCandidates.map(item => item.candidate), ['강사 섭외', '교육 전날 장소 재확인']);
assert.ok(extractCandidatePhrases({ filename:'items.csv', type:'csv', content:'업무,메모\n버스기사 연락,출발시간 재확인' }).length > 0);
assert.ok(extractCandidatePhrases({ filename:'items.json', type:'json', content:'{"task":"교육장 예약","note":"예약 확인"}' }).length > 0);
assert.equal(calculateTextSimilarity('강사 일정 확인', '강사 일정 확인'), 1);
assert.ok(calculateTextSimilarity('강사 일정', '강사 일정 확정') > 0.5);
assert.equal(findSimilarTasks('강사별 출강 확정', tasks, 1)[0].taskId, 'PRE-002');

const results = analyzeLocalRules({ sources:[source], tasks });
const duplicate = results.find(result => result.candidate === '강사별 출강 확정');
const enrich = results.find(result => result.candidate.includes('강의시간과 장소'));
const novel = results.find(result => result.candidate.includes('버스기사 연락처'));
assert.equal(duplicate?.type, GAP_TYPES.DUPLICATE);
assert.equal(enrich?.type, GAP_TYPES.ENRICH_EXISTING);
assert.equal(novel?.type, GAP_TYPES.NEW_TASK);
assert.ok([duplicate, enrich, novel].every(result => result?.source.filename === 'sample-handover.md' && result.source.excerpt));
assert.ok(validateGapResult(novel).valid);
assert.equal(validateGapResult({ ...novel, source:{ ...novel.source, excerpt:'' } }).valid, false);
assert.equal(validateGapResult({ ...novel, type:'INVALID' }).valid, false);

const payload = createRemoteAiPayload([{ filename:'sample.md', content:'업무 후보' }], [{ ...tasks[0], budget:{ plans:{ SECRET:1 } } }]);
assert.equal(payload.tasks[0].budget, undefined);
const invalidRemoteInput = await analyzeGap({ mode:'REMOTE_AI', sources:[], tasks:[] });
assert.equal(invalidRemoteInput.error, '분석자료를 먼저 추가해 주세요.');
assert.deepEqual(findSensitivePatterns('연락처 010-1234-5678, 이메일 test@example.com'), ['phone-number', 'email']);
assert.equal(validateGapSources([{ filename:'unsafe.txt', content:'010-1234-5678' }]).valid, false);
const originalFetch = globalThis.fetch;
globalThis.fetch = async endpoint => {
  assert.equal(endpoint, '/api/ai-gap-analysis');
  return { ok:true, json:async () => ({ results:[{ type:'NEW_TASK', confidence:'HIGH', candidate:'새 업무 후보', source:{ filename:'sample.md', excerpt:'새 업무 후보 근거' }, similarTasks:[], reason:'확인 필요' }] }) };
};
const validRemote = await analyzeGap({ mode:'REMOTE_AI', sources:[{ filename:'sample.md', content:'새 업무 후보 근거' }], tasks:[] });
assert.equal(validRemote.error, null);
assert.equal(validRemote.results[0].status, 'REVIEW');
globalThis.fetch = async () => ({ ok:true, json:async () => ({ results:[{ type:'INVALID' }] }) });
const invalidResponse = await analyzeGap({ mode:'REMOTE_AI', endpoint:'/api/ai-gap-analysis', sources:[{ filename:'sample.md', content:'새 업무 후보 근거' }], tasks:[] });
assert.equal(invalidResponse.error, 'AI 서버의 분석 결과 형식이 올바르지 않습니다.');
globalThis.fetch = originalFetch;

const xssResults = analyzeLocalRules({ sources:[{ id:'SRC-XSS', filename:'unsafe.txt', type:'text', content:'<script>alert(1)</script>' }], tasks:[] });
assert.equal(xssResults[0].candidate, '<script>alert(1)</script>');
const uiSource = await readFile(new URL('../js/gap-ui.js', import.meta.url), 'utf8');
assert.equal(uiSource.includes('.innerHTML'), false);
assert.ok(uiSource.includes('textContent'));

console.log('gap-analysis.test.js: PASS');
