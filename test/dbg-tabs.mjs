import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
const DIST = path.resolve('dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(DIST, p === '/' ? 'index.html' : p);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(4195, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 300)); });
await page.goto('http://127.0.0.1:4195/', { waitUntil: 'networkidle' });
for (const d of ['3', '8', '5', '5']) await page.getByLabel(`${d} 번`).click();
await page.getByText('오늘 장부').waitFor();
await page.getByText('구미 형곡동 32평 아파트 욕실 1칸').click();
await page.waitForTimeout(500);
for (let n = 1; n <= 6; n++) {
  await page.locator('nav[aria-label="현장 단계"] button').nth(n - 1).click();
  await page.waitForTimeout(400);
  const len = (await page.locator('main').innerText().catch(() => '')).length;
  console.log('tab', n, 'text len', len);
}
await browser.close();
server.close();
