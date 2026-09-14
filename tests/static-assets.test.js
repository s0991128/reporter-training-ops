import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildStaticRelease } from '../scripts/build-static-release.mjs';

const result = await buildStaticRelease();
const indexHtml = await readFile(join(result.outputDirectory, 'index.html'), 'utf8');
const assetRoot = join(result.outputDirectory, 'assets', result.assetVersion);

assert.match(result.assetVersion, /^v014-[0-9a-f]{7}$/);
assert.match(indexHtml, new RegExp(`href="assets/${result.assetVersion}/css/style\\.css"`));
assert.match(indexHtml, new RegExp(`src="assets/${result.assetVersion}/js/app\\.js"`));
assert.match(indexHtml, /window\.REPORTER_TRAINING_STATIC_RELEASE = true/);
assert.match(indexHtml, /rel="icon" href="data:image\/svg\+xml/);
assert.doesNotMatch(indexHtml, /href="css\/style\.css"/);
assert.doesNotMatch(indexHtml, /src="js\/app\.js"/);

await Promise.all([
  access(join(assetRoot, 'css', 'style.css')),
  access(join(assetRoot, 'js', 'app.js')),
  access(join(assetRoot, 'js', 'checklist.js')),
  access(join(assetRoot, 'data', 'checklist-metadata.json')),
  access(join(assetRoot, 'data', 'tasks.json')),
  access(join(assetRoot, '업무목록.csv'))
]);

const checklistSource = await readFile(join(assetRoot, 'js', 'checklist.js'), 'utf8');
const taskSource = await readFile(join(assetRoot, 'js', 'tasks.js'), 'utf8');
const budgetSource = await readFile(join(assetRoot, 'js', 'budget.js'), 'utf8');
assert.match(checklistSource, /new URL\('\.\.\/업무목록\.csv', import\.meta\.url\)/);
assert.match(checklistSource, /new URL\('\.\.\/data\/checklist-metadata\.json', import\.meta\.url\)/);
assert.match(taskSource, /new URL\('\.\.\/data\/tasks\.json', import\.meta\.url\)/);
assert.match(budgetSource, /new URL\('\.\.\/data\/budget-categories\.json', import\.meta\.url\)/);

console.log('static-assets.test.js passed');
