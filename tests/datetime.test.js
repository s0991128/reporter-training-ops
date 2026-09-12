import assert from 'node:assert/strict';
import { formatKoreanDate, formatKoreanDateTime, getKoreanDateTimeParts } from '../js/datetime.js';

const instant = '2026-09-03T01:35:00.000Z';

assert.match(formatKoreanDateTime(instant), /2026.*9.*3.*10:35/);
assert.match(formatKoreanDate(instant), /2026.*9.*3/);
assert.deepEqual(getKoreanDateTimeParts(instant), {
  year: '2026', month: '09', day: '03', hour: '10', minute: '35'
});
assert.equal(formatKoreanDateTime('invalid', 'fallback'), 'fallback');
assert.equal(formatKoreanDate('invalid', 'fallback'), 'fallback');
assert.equal(getKoreanDateTimeParts('invalid'), null);
assert.equal(formatKoreanDateTime(null, '변경시각 없음'), '변경시각 없음');
assert.equal(formatKoreanDateTime(undefined, '변경시각 없음'), '변경시각 없음');
assert.equal(formatKoreanDateTime('', '변경시각 없음'), '변경시각 없음');
assert.equal(formatKoreanDate(null, '날짜 없음'), '날짜 없음');
assert.equal(getKoreanDateTimeParts(null), null);

console.log('datetime.test.js: PASS');
