// v3.14 UI 검증 — 2단계 원가 내역 · 3단계 답사 변동 · 4단계 원가/일수 연동 · 5단계 일수까지 실제 화면으로 확인.
// 실행: LD_LIBRARY_PATH=... node test/ui-v314.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const OUT = path.resolve(__dirname, '..', 'screenshots', 'v314');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(DIST, p === '/' ? 'index.html' : p);
  if (!file.startsWith(DIST)) return res.writeHead(403).end();
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(4174, r));

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ko-KR' });
await ctx.route('https://generativelanguage.googleapis.com/**', (r) => r.fulfill({ status: 500, body: 'off' }));
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
const report = {};
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto('http://127.0.0.1:4174/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
for (const d of ['3', '8', '5', '5']) await page.getByLabel(`${d} 번`).click();
await page.getByText('오늘 장부').waitFor();

const text = '34평 아파트 장판만 제거, 화장실 2개 철거 및 안방과 거실 샷시 제거, 부엌 씽크대와 선반 철거';
await page.getByRole('button', { name: /새 현장 만들기/ }).first().click();
await page.getByLabel('현장 요청 내용').fill(text);
await page.getByRole('button', { name: /자동으로 분류하기|AI 정밀 분석/ }).click();
await page.getByText('자동으로 잡았습니다').waitFor({ timeout: 20000 });
report.classified = await page.locator('[role=dialog]').innerText();
await page.screenshot({ path: path.join(OUT, '01-classify.png') });
await page.getByRole('button', { name: /이 내용으로 (가견적 보기|현장 만들기)/ }).click();
await page.waitForTimeout(1200);

const grab = async (name) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  const t = await page.locator('main').innerText();
  fs.writeFileSync(path.join(OUT, `${name}.txt`), t);
  return t;
};
const tab = async (n, label) => {
  await page.getByRole('button', { name: new RegExp(`^${n}\\s*${label}$`) }).first().click();
  await page.waitForTimeout(700);
  await page.evaluate(() => window.scrollTo(0, 0));
};

report.step2 = await grab('02-estimate');

// 3단계 답사 — 거실 샷시 철거 제외 -30만
await tab(3, '답사');
const memo = page.getByLabel('현장 변동 내용');
await memo.fill('거실 샷시 범위 축소');
await page.locator('summary', { hasText: '직접 금액 고치기' }).first().click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /줄어듦/ }).click();
await page.getByLabel('변동 금액').fill('30');
await page.waitForTimeout(200);
report.step3 = await grab('03-survey-before-apply');
await page.getByRole('button', { name: /답사 내용으로 최종 견적 다시 내기/ }).click();
await page.waitForTimeout(1000);
report.step3after = await grab('03-survey-applied');

// 4단계 최종·수익
await tab(4, '최종·수익');
report.step4 = await grab('04-profit');

// 5단계 시공
await tab(5, '시공');
report.step5 = await grab('05-build');

// 6단계 문서 (문자 금액)
await tab(6, '문서');
report.step6 = await grab('06-doc');

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
const pick = (t, re, n = 6) => (String(t).match(re) || []).slice(0, n);
console.log('step4 견적/원가:', pick(report.step4, /(견적|보수적 원가|남는|적자|하루 뛰면|공사 \d)[^\n]*/g, 10));
console.log('step5 일수:', pick(report.step5, /(공사 \d[\d.]*\s*일|\d+일)/g, 6));
await browser.close();
server.close();
