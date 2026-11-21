// 실제 사용자 여정 점검 — 잠금 풀고 → 새 현장 → 1~6단계를 그대로 밟으며 화면 글자를 모은다.
// 실행: node test/journey.mjs   (결과: screenshots/journey/{회차}-{단계}.png, screenshots/journey/*.txt)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const OUT = path.resolve(__dirname, '..', 'screenshots', 'journey');
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

const SCENARIOS = [
  { key: '01-waste', name: '폐기물 단독', text: '경북 안동시 용산동 상가 생활폐기물 한차 수거 처리. 엘리베이터 있음 2층' },
  { key: '02-demo-ground', name: '철거+기초·정지', text: '안동 20평 상가 철거랑 부지 정지 작업 같이 해야 함. 1층, 집게차 들어감' },
  { key: '03-bath', name: '욕실 단독', text: '구미 24평 아파트 욕실 1칸 전체 철거 후 타일·도기 교체, 8층 엘리베이터 있음' },
  { key: '04-full', name: '전체 인테리어', text: '안동 24평 아파트 전체 인테리어. 철거+도배+욕실1+주방, 3층 엘리베이터 없음' },
  { key: '05-bid', name: '관공서 복구·정지 공고', bid: true },
];

async function main() {
  await new Promise((r) => server.listen(4188, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  await context.route('https://generativelanguage.googleapis.com/**', (r) => r.fulfill({ status: 500, body: 'off' }));
  await context.route('https://api.open-meteo.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"daily":{"time":[],"weather_code":[]}}' }));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('http://127.0.0.1:4188/', { waitUntil: 'networkidle' });
  for (const d of ['3', '8', '5', '5']) await page.getByLabel(`${d} 번`).click();
  await page.getByText('오늘 장부').waitFor({ timeout: 15000 });

  const tabs = () => page.locator('nav[aria-label="현장 단계"] button');
  const openTab = async (n) => { await tabs().nth(n - 1).click(); await page.waitForTimeout(500); };
  const goHome = async () => { const b = page.getByLabel('장부로 돌아가기'); if (await b.count()) await b.first().click(); await page.waitForTimeout(400); };
  const dump = async (key, label) => {
    const main = await page.locator('main').innerText();
    const print = await page.locator('.print-area').count() ? await page.locator('.print-area').first().innerText() : '';
    fs.writeFileSync(path.join(OUT, `${key}-${label}.txt`), `[main]\n${main}\n\n[print]\n${print}\n`);
    await page.screenshot({ path: path.join(OUT, `${key}-${label}.png`), fullPage: false });
    return main;
  };
  const walk = async (key) => {
    const seen = {};
    seen.title = await page.getByLabel('현장 이름').inputValue().catch(() => '');
    for (const [n, label] of [[1, 'tab1-정보'], [2, 'tab2-가견적'], [3, 'tab3-답사'], [4, 'tab4-수익'], [5, 'tab5-시공'], [6, 'tab6-문서']]) {
      await openTab(n);
      await page.evaluate(() => window.scrollTo(0, 0));
      seen[label] = await dump(key, label);
    }
    return seen;
  };

  const report = {};
  for (const sc of SCENARIOS) {
    if (sc.bid) {
      await goHome();
      await page.getByText('관공서 일감').first().click();
      await page.waitForTimeout(800);
      const card = page.locator('main button').filter({ hasText: /추정가격|예상 투찰가|낙찰하한/ }).first();
      if (await card.count()) {
        await card.click();
        await page.waitForTimeout(700);
      }
      const first = page.getByRole('button', { name: /내 장부로 가져오기/ }).first();
      if (!(await first.count())) {
        fs.writeFileSync(path.join(OUT, `${sc.key}-fail.txt`), await page.locator('main').innerText());
        await page.screenshot({ path: path.join(OUT, `${sc.key}-fail.png`) });
        report[sc.key] = { error: '공고 가져오기 버튼 없음' };
        continue;
      }
      await first.click();
      await page.waitForTimeout(1800);
    } else {
      await goHome();
      await page.getByRole('button', { name: /새 현장 만들기/ }).click();
      await page.getByText('숨고·카톡·메모를 그대로 넣으세요').waitFor();
      await page.getByLabel('현장 요청 내용').fill(sc.text);
      await page.getByRole('button', { name: /자동으로 분류하기|AI 정밀 분석/ }).click();
      await page.getByText('자동으로 잡았습니다').waitFor({ timeout: 20000 });
      const modal = await page.locator('[role=dialog]').innerText();
      fs.writeFileSync(path.join(OUT, `${sc.key}-000-분류.txt`), modal);
      await page.screenshot({ path: path.join(OUT, `${sc.key}-000-분류.png`) });
      await page.getByRole('button', { name: /이 내용으로 현장 만들기/ }).click();
      await page.getByLabel('받은 내용').waitFor();
      await page.waitForTimeout(600);
    }
    report[sc.key] = await walk(sc.key);
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, 'errors.txt'), errors.join('\n'));
  console.log('journey done', Object.keys(report).join(', '), '| errors', errors.length);
  await browser.close();
  server.close();
}

main().catch((e) => { console.error(e); server.close(); process.exitCode = 1; });
