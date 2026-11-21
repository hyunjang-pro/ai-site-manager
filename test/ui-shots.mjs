// 390×844 실사용 화면 점검 — 4단계 최종·수익 / 새 현장 확인 화면 / 문자 멘트
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const SHOTS = path.resolve(__dirname, '..', 'screenshots');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent((req.url || '/').split('?')[0]);
  let f = path.join(DIST, p === '/' ? 'index.html' : p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(4173, r));

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const CASE_JSON = {
  trade: 'kitchen', tradeName: '', title: '안동 용산동 10평 주방 전체 교체', sizeValue: '10', sizeUnit: '평', floor: '2', elevator: 'yes',
  siteCondition: '노후 LPM 상·하부장', materials: ['무광 그레이 상·하부장'], crew: [{ role: '주방 기공', count: 2 }],
  priceRange: { min: 420, max: 560 }, surveyChecks: [], summary: '10평 주방', warnings: [], wishText: '최신식으로 깔끔하게',
  missingCosts: [], costBreakdown: [], signal: { level: 'green', title: '좋음', reason: 'ok' },
  clientName: '박 사장님', clientPhone: '010-2345-6789', distanceKm: '32',
};

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR', deviceScaleFactor: 2 });
await ctx.route('https://generativelanguage.googleapis.com/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify(CASE_JSON) + '\n```' }] } }] }) })
);
await ctx.route('https://api.open-meteo.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"daily":{"time":[],"weather_code":[],"temperature_2m_max":[],"temperature_2m_min":[],"precipitation_probability_max":[]}}' }));
const p = await ctx.newPage();
p.setDefaultTimeout(20000);
await p.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
for (const d of ['3', '8', '5', '5']) await p.getByLabel(`${d} 번`).click();
await p.getByText('오늘 장부').waitFor({ timeout: 15000 });
await p.getByText('구미 형곡동 32평 아파트 욕실 1칸').click();
await p.getByLabel('받은 내용').waitFor();
await p.waitForTimeout(600);

// 현장 사진 + AFTER(직접 올린 사진)을 넣어 실제 화면처럼
const fsBuf = fs.readFileSync(path.join(__dirname, 'fixtures', 'kitchen-scene.jpg')).toString('base64');
await p.evaluate((b64) => {
  const st = JSON.parse(localStorage.getItem('aiSiteManager.v1'));
  const c = st.cases.find((x) => x.id === 'case-bathroom') || st.cases[0];
  c.photos = [{ name: 'before.jpg', kind: 'site', dataUrl: `data:image/jpeg;base64,${b64}` }];
  c.preview = { before: `data:image/jpeg;base64,${b64}`, after: `data:image/jpeg;base64,${b64}`, source: 'manual', at: '2026-11-21' };
  c.changeLogs = [{ id: 'cl-real', item: '고급·호텔 느낌 등급', reason: '고급·호텔 느낌 등급 권장 +12%', amount: 85, days: 0, type: 'increase', confirmed: true, at: '2026-11-20' }];
  localStorage.setItem('aiSiteManager.v1', JSON.stringify(st));
}, fsBuf);
await p.reload({ waitUntil: 'networkidle' });
await p.getByText('오늘 장부').waitFor({ timeout: 15000 });
await p.getByText('구미 형곡동 32평 아파트 욕실 1칸').click();
await p.getByLabel('받은 내용').waitFor();
await p.waitForTimeout(500);
await p.screenshot({ path: path.join(SHOTS, 'ui-1-info.png') });

// 4단계 — 위에서부터
await p.locator('nav[aria-label="현장 단계"] button').nth(3).click();
await p.waitForTimeout(700);
await p.screenshot({ path: path.join(SHOTS, 'ui-2-profit-top.png') });
await p.evaluate(() => window.scrollBy(0, 620));
await p.waitForTimeout(300);
await p.screenshot({ path: path.join(SHOTS, 'ui-3-profit-mid.png') });
await p.getByText('④ 손님께 보여줄 완공 사진').scrollIntoViewIfNeeded();
await p.waitForTimeout(300);
await p.screenshot({ path: path.join(SHOTS, 'ui-4-after-card.png') });
await p.evaluate(() => window.scrollBy(0, 330));
await p.waitForTimeout(300);
await p.screenshot({ path: path.join(SHOTS, 'ui-5-after-free.png') });
await p.getByRole('button', { name: /손님께 크게 보여주기/ }).first().click();
await p.waitForTimeout(400);
await p.screenshot({ path: path.join(SHOTS, 'ui-6-compare.png') });
await p.getByLabel('닫기').first().click();
await p.waitForTimeout(300);

// 내가 부른 금액을 크게 깎았을 때 — 변동 내역
await p.getByLabel('내가 부른 금액(만원)').scrollIntoViewIfNeeded();
await p.getByLabel('내가 부른 금액(만원)').fill('459');
await p.waitForTimeout(600);
await p.evaluate(() => window.scrollBy(0, 380));
await p.waitForTimeout(300);
await p.screenshot({ path: path.join(SHOTS, 'ui-7-glance-collapsed.png') });
await p.getByText('앱 계산 변동 내역 보기').click();
await p.waitForTimeout(300);
await p.screenshot({ path: path.join(SHOTS, 'ui-8-glance-open.png') });

// 새 현장 확인 화면
await p.getByLabel('장부로 돌아가기').first().click();
await p.waitForTimeout(400);
await p.getByRole('button', { name: /새 현장 만들기/ }).click();
await p.getByText('숨고·카톡·메모를 그대로 넣으세요').waitFor();
await p.screenshot({ path: path.join(SHOTS, 'ui-9-newcase-input.png') });
console.log('dialog count', await p.locator('[role=dialog]').count());
console.log('textarea count', await p.locator('textarea').count());
await p.locator('textarea').first().fill('경북 안동시 15평 상가 철거, 연락처 010-2345-6789');
await p.locator('[role=dialog] button', { hasText: /AI 정밀 분석|자동으로 분류하기/ }).first().click();
await p.getByText('자동으로 잡았습니다').waitFor({ timeout: 20000 });
await p.waitForTimeout(500);
await p.screenshot({ path: path.join(SHOTS, 'ui-10-newcase-confirm.png') });
await p.evaluate(() => { const b = document.getElementById('modal-body'); if (b) b.scrollTop = 420; });
await p.waitForTimeout(300);
await p.screenshot({ path: path.join(SHOTS, 'ui-11-newcase-confirm2.png') });

// 2. 가견적 문자 멘트 / 6. 문서
await p.getByLabel('닫기').first().click().catch(() => {});
await p.waitForTimeout(500);
await p.getByText('구미 형곡동 32평 아파트 욕실 1칸').first().click();
await p.getByLabel('받은 내용').waitFor();
await p.waitForTimeout(300);
await p.locator('nav[aria-label="현장 단계"] button').nth(1).click();
await p.waitForTimeout(700);
await p.locator('[data-testid=quote-msg-card]').scrollIntoViewIfNeeded().catch(() => {});
await p.waitForTimeout(300);
await p.screenshot({ path: path.join(SHOTS, 'ui-12-quote-msg.png') });
await p.locator('nav[aria-label="현장 단계"] button').nth(5).click();
await p.waitForTimeout(800);
await p.getByText('공사 전 · 공사 후').first().scrollIntoViewIfNeeded().catch(() => {});
await p.waitForTimeout(300);
await p.screenshot({ path: path.join(SHOTS, 'ui-13-doc-after.png') });

await browser.close();
server.close();
console.log('done');
