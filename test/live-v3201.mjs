// 라이브(gh-pages) 배포본 확인 — 숨고 폐기물 요청서를 실제 배포 주소에서 넣어 본다.
// 실행: LD_LIBRARY_PATH=... node test/live-v3201.mjs
import { chromium } from 'playwright';

const LIVE = 'https://hyunjang-pro.github.io/ai-site-manager/';
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
const out = [];
for (const vp of [{ w: 390, h: 844, tag: '390x844' }, { w: 360, h: 640, tag: '360x640' }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, locale: 'ko-KR', deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://generativelanguage.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(LIVE, { waitUntil: 'networkidle' });
  for (const d of ['3', '8', '5', '5']) await p.getByLabel(`${d} 번`).click();
  await p.getByText('오늘 장부').waitFor({ timeout: 20000 });
  await p.getByRole('button', { name: /새 현장 만들기/ }).click();
  await p.locator('textarea').first().fill(SOOMGO);
  await p.locator('[role=dialog] button', { hasText: /AI 정밀 분석|자동으로 분류하기/ }).first().click();
  await p.getByText('자동으로 잡았습니다').waitFor({ timeout: 25000 });
  await p.waitForTimeout(600);
  const confirmText = await p.locator('[role=dialog]').last().innerText();
  await p.screenshot({ path: `/workspace/browser/live-${vp.tag}-confirm.png` }).catch(() => {});
  await p.locator('[role=dialog] button', { hasText: /이 내용으로 가견적 보기/ }).first().click();
  await p.waitForTimeout(1200);
  const estText = await p.locator('body').innerText();
  await p.screenshot({ path: `/workspace/browser/live-${vp.tag}-estimate.png` }).catch(() => {});
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const bad = [];
  if (!/폐기물/.test(confirmText)) bad.push('확인 화면 폐기물 없음');
  if (!/90\s*만원|90만원/.test(estText)) bad.push('90만원 없음');
  if (/371/.test(estText)) bad.push('371만 남음');
  if (!/음식물·액체류/.test(confirmText)) bad.push('음식물 안내 없음');
  if (overflow > 1) bad.push(`가로 넘침 ${overflow}`);
  if (errs.length) bad.push(`콘솔 에러 ${errs.length}건 ${errs[0].slice(0, 60)}`);
  if (bad.length) problems.push(`${vp.tag}: ${bad.join(' | ')}`);
  out.push({ viewport: vp.tag, overflow, ok: !bad.length, title: (estText.split('\n')[2] || '').trim() });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify({ live: LIVE, problems, out }, null, 2));
process.exit(problems.length ? 1 : 0);
