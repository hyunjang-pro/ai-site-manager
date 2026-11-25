// 라이브(gh-pages) 배포본 실화면 확인 — 390×844에서 실제 요청문을 넣고 금액을 읽는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'screenshots', 'v313');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'https://hyunjang-pro.github.io/ai-site-manager/';
const b = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ko-KR' });
await ctx.route('https://generativelanguage.googleapis.com/**', (r) => r.fulfill({ status: 500, body: 'off' }));
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
for (const d of ['3', '8', '5', '5']) await page.getByLabel(`${d} 번`).click();
await page.getByText('오늘 장부').waitFor();
const cases = [
  ['live-01-field', '장판 제거 화장실 2개 베란다 샷시 및 부엌 선반과 씽크대 철거'],
  ['live-02-bath', '화장실 하나 철거'],
];
const out = {};
for (const [key, text] of cases) {
  await page.getByRole('button', { name: /새 현장 만들기/ }).first().click();
  await page.getByLabel('현장 요청 내용').fill(text);
  await page.getByLabel('자동으로 분류하기').click();
  await page.getByRole('button', { name: /이 내용으로 가견적 보기/ }).click();
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 0));
  const head = await page.locator('main').innerText();
  out[key] = head.split('\n').slice(0, 8);
  await page.screenshot({ path: path.join(OUT, `${key}-quote.png`) });
  const card = page.getByTestId('quote-msg-card');
  if (await card.count()) {
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `${key}-message.png`) });
    out[key + '-msg'] = await page.getByTestId('sugo-msg').innerText();
  }
  const back = page.getByLabel('장부로 돌아가기');
  await back.first().click();
  await page.waitForTimeout(700);
}
fs.writeFileSync(path.join(OUT, 'live.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
