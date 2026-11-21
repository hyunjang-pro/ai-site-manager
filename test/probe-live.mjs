// 라이브 확인 — https://plgo123.github.io/ai-site-manager/ 를 실제로 열어 새 기능 동작/오류 확인
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(__dirname, '..', 'screenshots');
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto('https://plgo123.github.io/ai-site-manager/', { waitUntil: 'networkidle' });
await page.getByText('가족 전용').waitFor({ timeout: 20000 });
for (const d of ['3', '8', '5', '5']) await page.getByLabel(`${d} 번`).click();
await page.getByText('구미 형곡동 32평 아파트 욕실 1칸').first().scrollIntoViewIfNeeded();
await page.getByText('구미 형곡동 32평 아파트 욕실 1칸').first().click();
await page.getByLabel('받은 내용').waitFor();
await page.locator('nav[aria-label="현장 단계"] button').nth(3).click();
await page.waitForTimeout(500);
const input = page.getByLabel('내가 부른 금액(만원)');
const appPrice = Number((await input.inputValue()) || 0);
await input.fill(String(appPrice - 40));
await page.waitForTimeout(400);
const net = (await page.getByTestId('called-net').innerText()).replace(/\n/g, ' ');
await page.screenshot({ path: path.join(SHOTS, 'live-390-called.png') });
console.log('app', appPrice, 'called', appPrice - 40, 'net', net);
await page.locator('nav[aria-label="현장 단계"] button').nth(5).click();
await page.waitForTimeout(700);
const sub = await page.locator('[data-testid=quote-subtotal]').getAttribute('data-amount');
const sum = await page.evaluate(() =>
  [...document.querySelectorAll('.print-area [data-quote-line]')].reduce((s, el) => s + Number(el.getAttribute('data-amount') || 0), 0)
);
await page.locator('.print-area').screenshot({ path: path.join(SHOTS, 'live-390-quote.png') });
console.log('subtotal', sub, 'lineSum', sum, 'match', Number(sub) === sum && Number(sub) === appPrice - 40);
await page.locator('nav[aria-label="현장 단계"] button').nth(4).click();
await page.waitForTimeout(500);
await page.evaluate(() => document.querySelectorAll('main details').forEach((d) => (d.open = true)));
await page.getByRole('tab', { name: '2일차 브리핑' }).click();
await page.waitForTimeout(300);
await page.getByText('일차별 투입 인원').first().scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(SHOTS, 'live-390-day2.png') });
console.log('day2 ok', (await page.getByRole('tab', { name: '2일차 브리핑' }).getAttribute('aria-selected')));
console.log('errors', errs.filter((e) => !/generativelanguage|Failed to load resource/i.test(e)).slice(0, 3));
await browser.close();
