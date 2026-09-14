import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '..');

function getCommitShortSha(root) {
  const sha = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd:root, encoding:'utf8' }).trim();
  if (!/^[0-9a-f]{7,}$/i.test(sha)) throw new Error('Git 커밋 SHA를 확인할 수 없습니다.');
  return sha.toLowerCase();
}

export function getAssetVersion(packageVersion, commitSha) {
  const versionParts = String(packageVersion || '').split('.');
  const normalizedVersion = versionParts.slice(0, 2).join('').replace(/\D/g, '');
  const normalizedSha = String(commitSha || '').trim().toLowerCase();
  if (!normalizedVersion || !/^[0-9a-f]{7,}$/i.test(normalizedSha)) throw new Error('정적 자산 버전 정보를 만들 수 없습니다.');
  return `v${normalizedVersion}-${normalizedSha.slice(0, 7)}`;
}

function replaceAssetReferences(html, assetBasePath) {
  const replacements = [
    ['href="css/style.css"', `href="${assetBasePath}/css/style.css"`],
    ['src="js/app.js"', `src="${assetBasePath}/js/app.js"`]
  ];
  return replacements.reduce((result, [before, after]) => {
    if (!result.includes(before)) throw new Error(`index.html에서 정적 자산 참조를 찾을 수 없습니다: ${before}`);
    return result.replace(before, after);
  }, html);
}

function markStaticRelease(html) {
  const marker = '<script>window.REPORTER_TRAINING_STATIC_RELEASE = true;</script>';
  if (!html.includes('</head>')) throw new Error('index.html에서 head 종료 태그를 찾을 수 없습니다.');
  return html.replace('</head>', `    ${marker}\n  </head>`);
}

export async function buildStaticRelease({ root = projectRoot } = {}) {
  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const assetVersion = getAssetVersion(packageJson.version, getCommitShortSha(root));
  const outputDirectory = join(root, 'dist');
  const assetDirectory = join(outputDirectory, 'assets', assetVersion);
  const assetBasePath = `assets/${assetVersion}`;
  const indexHtml = await readFile(join(root, 'index.html'), 'utf8');

  await rm(outputDirectory, { recursive:true, force:true });
  await mkdir(assetDirectory, { recursive:true });
  await Promise.all([
    cp(join(root, 'css'), join(assetDirectory, 'css'), { recursive:true }),
    cp(join(root, 'js'), join(assetDirectory, 'js'), { recursive:true }),
    cp(join(root, 'data'), join(assetDirectory, 'data'), { recursive:true }),
    cp(join(root, '업무목록.csv'), join(assetDirectory, '업무목록.csv')),
    writeFile(join(outputDirectory, 'index.html'), markStaticRelease(replaceAssetReferences(indexHtml, assetBasePath)), 'utf8')
  ]);

  return { assetVersion, assetBasePath, outputDirectory };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await buildStaticRelease();
  console.log(`Static release bundle created: ${result.assetVersion}`);
}
