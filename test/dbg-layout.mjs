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
await new Promise((r) => server.listen(4193, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--no-sandbox'] });
for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 640 }]) {
  const context = await browser.newContext({ viewport: vp, locale: 'ko-KR', isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4193/', { waitUntil: 'networkidle' });
  for (const d of ['3', '8', '5', '5']) await page.getByLabel(`${d} 번`).click();
  await page.getByText('오늘 장부').waitFor();
  const home = await page.evaluate(() => {
    const bar = document.querySelector('.bottom-bar');
    if (!bar) return { error: 'no bar', html: document.body.innerHTML.slice(0, 300) };
    const p = bar.querySelector('p');
    const b = bar.getBoundingClientRect();
    const r = p ? p.getBoundingClientRect() : { top: 0, bottom: 0, height: 0 };
    return { vh: window.innerHeight, barBottom: b.bottom, barH: b.height, hintTop: r.top, hintBottom: r.bottom, hintH: r.height, clipped: r.bottom > window.innerHeight + 0.5 };
  });
  console.log(vp.width, 'home bottom-bar', JSON.stringify(home));
  await page.getByRole('button', { name: /새 현장 만들기/ }).click();
  await page.getByText('숨고·카톡·메모를 그대로 넣으세요').waitFor();
  await page.waitForTimeout(1200);
  const modal = await page.evaluate(() => {
    const sheet = document.querySelector('.modal-sheet');
    const s = sheet.getBoundingClientRect();
    const foot = document.querySelector('[role=dialog] .modal-bottom');
    const f = foot ? foot.getBoundingClientRect() : { top: 0, bottom: 0 };
    if (!foot) return { vh: window.innerHeight, sheetTop: Math.round(s.top), sheetBottom: Math.round(s.bottom), sheetH: Math.round(s.height), noFooter: true };
    const ps = [...foot.querySelectorAll('p')];
    return {
      vh: window.innerHeight,
      sheetTop: Math.round(s.top), sheetBottom: Math.round(s.bottom), sheetH: Math.round(s.height),
      footTop: Math.round(f.top), footBottom: Math.round(f.bottom),
      ps: ps.map((p) => ({ t: p.innerText.slice(0, 18), top: Math.round(p.getBoundingClientRect().top), bottom: Math.round(p.getBoundingClientRect().bottom) })),
      sheetOverflow: getComputedStyle(sheet).overflow,
    };
  });
  console.log(vp.width, 'modal', JSON.stringify(modal));
  await context.close();
}
await browser.close();
server.close();
