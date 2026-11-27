// v3.20.1 실화면 — 숨고 폐기물 요청서를 390×844 · 360×640 두 폰에서 실제로 넣어 본다.
// 실행: LD_LIBRARY_PATH=/workspace/.local/libs/usr/lib/x86_64-linux-gnu node test/shots-v3201.mjs
// 확인: ① 폐기물로 잡히는가 ② 90만(2.5톤)으로 나오는가 ③ 안내 문구가 보이는가
//       ④ 가로 넘침·잘린 글자·NaN/undefined 없음
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const SHOTS = path.resolve(__dirname, '..', 'screenshots', 'v3201');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent((req.url || '/').split('?')[0]);
  let f = path.join(DIST, p === '/' ? 'index.html' : p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(4174, r));

const SOOMGO = `폐기물 처리
협의 가능해요
경북 안동시 옥동
폐기물 타입 기타
희망 서비스 폐기물 배출 + 수거
재활용 가능 여부 네.
폐기물 양 1톤~2.5톤차
서비스 범위 1층/외부에서 바로 수거 가능
문의/희망사항 지금 작성할게요: 베이커리 철거 전 중고 판매 처리 불가능한 물품과 포장재, 식자재, 음식물 등등 폐기물처리하려고 합니다.`;

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const problems = [];
const report = [];

for (const vp of [{ w: 390, h: 844, tag: '390x844' }, { w: 360, h: 640, tag: '360x640' }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, locale: 'ko-KR', deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://generativelanguage.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await ctx.route('https://api.open-meteo.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"daily":{"time":[],"weather_code":[],"temperature_2m_max":[],"temperature_2m_min":[],"precipitation_probability_max":[]}}' }));
  const p = await ctx.newPage();
  p.setDefaultTimeout(20000);
  const consoleErrors = [];
  p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  p.on('pageerror', (e) => consoleErrors.push(String(e)));

  await p.goto('http://127.0.0.1:4174/', { waitUntil: 'networkidle' });
  for (const d of ['3', '8', '5', '5']) await p.getByLabel(`${d} 번`).click();
  await p.getByText('오늘 장부').waitFor({ timeout: 15000 });

  // 새 현장 → 숨고 원문 그대로
  await p.getByRole('button', { name: /새 현장 만들기/ }).click();
  await p.getByText('숨고·카톡·메모를 그대로 넣으세요').waitFor();
  await p.locator('textarea').first().fill(SOOMGO);
  await p.locator('[role=dialog] button', { hasText: /AI 정밀 분석|자동으로 분류하기/ }).first().click();
  await p.getByText('자동으로 잡았습니다').waitFor({ timeout: 20000 });
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(SHOTS, `${vp.tag}-1-confirm.png`) });
  const confirmText = await p.locator('[role=dialog]').last().innerText();
  // 분류 행·안내까지 스크롤해서 한 장 더 (360 폰에서 글자 잘림 확인)
  await p.evaluate(() => { const b = document.getElementById('modal-body'); if (b) b.scrollTop = 620; });
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(SHOTS, `${vp.tag}-1b-confirm-scroll.png`) });
  const confirmScroll = await p.locator('[role=dialog]').last().innerText();
  if (!/처리|2\.5톤|음식물/.test(confirmScroll)) problems.push(`${vp.tag}: 확인 화면 스크롤 안내 없음`);

  // 확인 화면 → '이 내용으로 가견적 보기' (장부에 만들어 2. 가견적으로 직행)
  await p.locator('[role=dialog] button', { hasText: /이 내용으로 가견적 보기/ }).first().click();
  await p.waitForTimeout(1200);
  const infoText = await p.locator('body').innerText();

  // 2. 가견적
  await p.locator('nav[aria-label="현장 단계"] button').nth(1).click();
  await p.waitForTimeout(900);
  const estText = await p.locator('body').innerText();
  await p.screenshot({ path: path.join(SHOTS, `${vp.tag}-2-estimate.png`), fullPage: false });

  // 1. 정보 탭 — '읽으면서 확인한 것' 안내가 보이는지
  await p.locator('nav[aria-label="현장 단계"] button').nth(0).click();
  await p.waitForTimeout(800);
  const infoBox = await p.getByText('읽으면서 확인한 것').count();
  if (!infoBox) problems.push(`${vp.tag}: 1단계 '읽으면서 확인한 것' 없음`);
  const infoEl = p.getByText('읽으면서 확인한 것').first();
  if (infoBox) { await infoEl.scrollIntoViewIfNeeded(); await p.waitForTimeout(400); await p.screenshot({ path: path.join(SHOTS, `${vp.tag}-1c-info-hints.png`) }); }
  await p.locator('nav[aria-label="현장 단계"] button').nth(1).click();
  await p.waitForTimeout(700);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const bad = [];
  if (!/폐기물/.test(confirmText)) bad.push('확인 화면에 폐기물 없음');
  if (!/90/.test(estText)) bad.push('가견적에 90만 없음');
  if (/371/.test(estText)) bad.push('371만(철거 오분류) 남아 있음');
  if (/NaN|undefined/.test(infoText + estText)) bad.push('NaN/undefined');
  if (overflow > 1) bad.push(`가로 넘침 ${overflow}px`);
  if (consoleErrors.length) bad.push(`콘솔 에러 ${consoleErrors.length}건: ${consoleErrors[0].slice(0, 80)}`);
  if (!/음식물·액체류/.test(confirmText)) bad.push('음식물·액체류 안내 없음');
  if (bad.length) problems.push(`${vp.tag}: ${bad.join(' | ')}`);
  report.push({ viewport: vp.tag, overflow, confirm: confirmText.split('\n').filter(Boolean).slice(-12) });
  await ctx.close();
}

await browser.close();
server.close();
fs.writeFileSync(path.join(SHOTS, 'report.json'), JSON.stringify({ problems, report }, null, 2));
console.log(JSON.stringify({ problems, report }, null, 2));
process.exit(problems.length ? 1 : 0);
