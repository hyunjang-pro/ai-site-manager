// v3.13 실화면 캡처 — 390×844 모바일에서 실제 텍스트를 넣고 가견적·숨고 멘트를 찍는다.
// 실행: node test/shots-v313.mjs   (결과: screenshots/v313/*.png)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const OUT = path.resolve(__dirname, '..', 'screenshots', 'v313');
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(DIST, p === '/' ? 'index.html' : p);
  if (!file.startsWith(DIST)) return res.writeHead(403).end();
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const CASES = [
  { key: '01-field-90', text: '장판 제거 화장실 2개 베란다 샷시 및 부엌 선반과 씽크대 철거' },
  { key: '02-bath-demo', text: '화장실 하나 철거' },
  { key: '03-bath2-demo', text: '욕실 두칸 철거' },
  { key: '04-apt32', text: '32평 아파트 철거' },
  { key: '05-soomgo24', text: '숨고 요청서 · 경북 안동시 24평 아파트 철거 원합니다. 엘리베이터 있음 3층' },
];

async function main() {
  await new Promise((r) => server.listen(4191, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ko-KR' });
  await context.route('https://generativelanguage.googleapis.com/**', (r) => r.fulfill({ status: 500, body: 'off' }));
  await context.route('https://api.open-meteo.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"daily":{"time":[],"weather_code":[]}}' }));
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto('http://127.0.0.1:4191/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  for (const d of ['3', '8', '5', '5']) await page.getByLabel(`${d} 번`).click();
  await page.getByText('오늘 장부').waitFor({ timeout: 20000 });

  const result = {};
  for (const c of CASES) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const newBtn = page.getByRole('button', { name: /새 현장 만들기/ }).first();
    await newBtn.click();
    await page.getByLabel('현장 요청 내용').fill(c.text);
    await page.getByLabel('자동으로 분류하기').click();
    await page.getByRole('button', { name: /이 내용으로 가견적 보기/ }).click();
    await page.waitForTimeout(900);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `${c.key}-1-quote.png`) });
    const main = await page.locator('main').innerText();
    const summary = main.split('\n').filter((l) => /만원|철거|욕실|평/.test(l)).slice(0, 14);
    // 숨고/고객 멘트 카드까지 스크롤
    const card = page.getByTestId('quote-msg-card');
    if (await card.count()) {
      await card.scrollIntoViewIfNeeded();
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(OUT, `${c.key}-2-message.png`) });
      const msg = await page.getByTestId('sugo-msg').innerText();
      result[c.key] = { main: summary, msg };
    } else {
      result[c.key] = { main: summary, msg: '' };
    }
    // 장부로 돌아가기
    const back = page.getByLabel('장부로 돌아가기');
    if (await back.count()) await back.first().click();
    else await page.goto('http://127.0.0.1:4191/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
  }
  fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  server.close();
}

main().catch(async (e) => {
  console.error('실패:', e.message);
  server.close();
  process.exit(1);
});
