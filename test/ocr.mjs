import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve('dist');
const OUT = '/workspace/.tmp/ocr';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent((req.url || '/').split('?')[0]);
  let f = path.join(DIST, u === '/' ? 'index.html' : u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(4175, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR', isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:4175/', { waitUntil: 'networkidle' });
for (const d of ['3', '8', '5', '5']) await page.getByLabel(`${d} 번`).click();
await page.getByText('오늘 장부').waitFor();
const files = ['IMG_1428', 'IMG_1429', 'IMG_1430'].map((n) => {
  const dir = '/workspace/attachments/2026-11-21';
  return path.join(dir, fs.readdirSync(dir).find((f) => f.startsWith(n) && f.endsWith('.jpg')));
});
for (const file of files) {
  await page.getByRole('button', { name: /새 현장 만들기/ }).click();
  await page.waitForTimeout(300);
  await page.getByLabel('숨고·카톡 스샷 선택').setInputFiles(file);
  // 스샷을 올리면 앱이 바로 글자를 읽어 입력칸·분류에 넣는다 (결과 단계는 버튼을 누를 때).
  await page.getByTestId('shot-summary').waitFor({ timeout: 240000 });
  await page.getByRole('button', { name: /자동으로 분류하기|AI 정밀 분석/ }).click();
  const done = page.getByText('자동으로 잡았습니다');
  await done.waitFor({ timeout: 60000 });
  await page.waitForTimeout(500);
  const dialog = page.locator('[role=dialog]').first();
  const txt = await dialog.innerText();
  const name = file.split('/').pop().split('-')[0];
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`\n=== ${name} ===\n${txt.slice(0, 700).replace(/\n+/g, ' | ')}`);
  await page.getByLabel('닫기').click();
  await page.waitForTimeout(400);
}
console.log('errors', errors.slice(0, 3));
await browser.close();
server.close();
