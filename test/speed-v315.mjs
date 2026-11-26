// 속도 측정 — 사진 없이 텍스트만 넣었을 때 '자동으로 분류하기' → 분류 결과까지 걸리는 시간.
// Gemini 키가 저장돼 있어도(부모님 폰처럼) 글만이면 로컬 엔진이 즉시 끝나야 한다.
// 실행: LD_LIBRARY_PATH=... node test/speed-v315.mjs [live]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const live = process.argv.includes('live');
const URL = live ? 'https://hyunjang-pro.github.io/ai-site-manager/' : 'http://127.0.0.1:4175/';

let server = null;
if (!live) {
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
  server = http.createServer((req, res) => {
    const p = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = path.join(DIST, p === '/' ? 'index.html' : p);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(4175, r));
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
// Gemini가 응답하지 않는 상황을 그대로 재현 (부모님 폰은 키가 저장돼 있다)
await ctx.route('https://generativelanguage.googleapis.com/**', async (r) => {
  await new Promise((res) => setTimeout(res, 20000));
  await r.fulfill({ status: 500, body: 'slow' }).catch(() => {});
});
const page = await ctx.newPage();
page.setDefaultTimeout(40000);
await page.goto(live ? `${URL}?speed=${Date.now()}` : URL, { waitUntil: 'networkidle' });
await page.evaluate((k) => localStorage.setItem(k, 'AIzaFAKEKEYFORTEST1234567890'), 'aiSiteManager.geminiKey');
await page.reload({ waitUntil: 'networkidle' });
for (const d of ['3', '8', '5', '5']) await page.getByLabel(`${d} 번`).click();
await page.getByText('오늘 장부').waitFor();

const out = [];
for (const text of [
  '34평 아파트 장판만 제거, 화장실 2개 철거 및 안방과 거실 샷시 제거, 부엌 씽크대와 선반 철거',
  '24평 아파트 도배 장판',
  '2.5톤 폐기물 처리',
]) {
  await page.getByRole('button', { name: /새 현장 만들기/ }).first().click();
  await page.getByLabel('현장 요청 내용').fill(text);
  const t0 = Date.now();
  await page.getByRole('button', { name: /자동으로 분류하기|AI 정밀 분석/ }).click();
  await page.getByText('자동으로 잡았습니다').waitFor({ timeout: 25000 });
  const ms = Date.now() - t0;
  const amount = (await page.locator('[role=dialog]').innerText()).match(/(\d[\d,]*)만원/)?.[1] || '';
  out.push({ text, ms, amount });
  await page.getByRole('button', { name: '닫기' }).first().click().catch(() => {});
  await page.getByRole('button', { name: /닫기|다시 입력/ }).first().click().catch(() => {});
  await page.waitForTimeout(300);
}
console.log(JSON.stringify(out, null, 1));
console.log(out.map((o) => `${o.ms}ms · ${o.amount}만 · ${o.text.slice(0, 20)}`).join('\n'));
await browser.close();
if (server) server.close();
