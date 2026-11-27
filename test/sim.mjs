// 현장 전수 시뮬레이션 — 실제 부모님·형님처럼 390×844 / 360×640 두 폰에서
// 잠금 → 새 현장(글·사진) → 1~6단계 → 답사 추가·감액 → 문서까지 실제 클릭으로 밟는다.
// 콘솔 에러·가로 넘침·잘린 버튼·이상한 숫자(NaN/undefined)·가격 불일치를 모아 보고한다.
// 실행: node test/sim.mjs   (결과: screenshots/sim/*.png, screenshots/sim/report.json)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const OUT = path.resolve(__dirname, '..', 'screenshots', 'sim');
const FIXTURES = path.resolve(__dirname, 'fixtures');
fs.mkdirSync(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
};
const server = http.createServer((req, res) => {
  const p = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(DIST, p === '/' ? 'index.html' : p);
  if (!file.startsWith(DIST)) return res.writeHead(403).end();
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const CASE_JSON = {
  trade: 'kitchen',
  tradeName: '',
  title: '안동 용산동 10평 주방 전체 교체',
  sizeValue: '10',
  sizeUnit: '평',
  floor: '2',
  elevator: 'yes',
  siteCondition: '노후 LPM 상·하부장, 상판 들뜸, 후드 오염',
  materials: ['무광 그레이 상·하부장', '인조대리석 상판', '4000K 언더등'],
  crew: [{ role: '주방 기공', count: 2 }],
  priceRange: { min: 420, max: 560 },
  surveyChecks: [{ label: '상판 실측(수전 홀 위치)', why: '가공 후 변경 불가', how: '벽에서 중심까지', amount: 0 }],
  summary: '10평 주방 전체 교체, 엘리베이터 사용',
  warnings: ['상판 가공 후 수전 홀 변경 불가'],
  wishText: '최신식으로 깔끔하게, 예산은 1,200만원 이하로 맞춰주세요',
  missingCosts: [{ label: '후드 교체', range: '참고 20~35만', amount: 25, why: '기존 후드 오염' }],
  costBreakdown: [
    { label: '인건비', detail: '주방 기공 2명 × 32만 × 3일', amount: 192 },
    { label: '자재', detail: '싱크대 3.2m 192만 + 상판 51만', amount: 243 },
  ],
  signal: { level: 'green', title: '적극 추천', reason: '보수적 마진 22%' },
  includedScopes: ['kitchen', 'demolition'],
  excludedScopes: [],
};
const SURVEY_JSON = {
  summary: '폐기물 1대 추가, 누수 보수',
  items: [
    { item: '폐기물 1대 추가 반출', reason: '답사에서 짐이 예상보다 많음', amount: 43, days: 0, type: 'increase' },
    { item: '누수 의심 방수 보수', reason: '벽 물기 확인', amount: 30, days: 1, type: 'increase' },
  ],
  signal: { level: 'yellow', title: '조율 후 진행', reason: '답사 후 원가 상승' },
};

const geminiMock = async (route) => {
  let body = {};
  try {
    body = JSON.parse(route.request().postData() || '{}');
  } catch (e) {}
  const text = (body?.contents?.[0]?.parts || []).map((p) => p.text || '').join(' ');
  const wantsImage = (body?.generationConfig?.responseModalities || []).includes('IMAGE');
  let payload;
  if (wantsImage) {
    payload = { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: PNG_1PX } }] } }] };
  } else if (text.includes('답사 기록')) {
    payload = { candidates: [{ content: { parts: [{ text: JSON.stringify(SURVEY_JSON) }] } }] };
  } else if (text.includes('JSON만 답해')) {
    payload = { candidates: [{ content: { parts: [{ text: '{"ok":true,"model":"gemini-2.5-flash"}' }] } }] };
  } else {
    payload = { candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify(CASE_JSON) + '\n```' }] } }] };
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
};

const SCENARIOS = [
  {
    key: '01-waste-studio',
    name: '원룸 폐기물 1톤 1차',
    text: '경북 안동시 원룸 이사 후 폐기물 1톤 한차 수거 처리. 3층 엘리베이터 없음, 장롱·책상 버림',
  },
  {
    key: '02-demo-store',
    name: '상가 원상복구 철거',
    text: '안동 20평 상가 원상복구 철거. 천장 텍스·데코타일·경량벽체 철거, 2층 엘베 없음, 집게차 들어감',
  },
  {
    key: '03-bath',
    name: '욕실 1칸 리모델링',
    text: '구미 24평 아파트 욕실 1칸 전체 철거 후 600각 타일, 도기 교체. 8층 엘리베이터 있음',
  },
  {
    key: '04-wallpaper',
    name: '도배·장판',
    text: '포항 24평 빌라 도배·장판. 합지에 1.8T, 3층 엘베 없음, 빈집',
  },
  {
    key: '05-bid',
    name: '관공서 나라장터 공고',
    bid: true,
  },
  {
    key: '06-combined',
    name: '2개 이상 복합(철거+욕실+도배)',
    text: '안동 24평 아파트 철거하고 욕실 1칸이랑 도배까지 같이. 3층 엘리베이터 없음',
  },
  {
    key: '07-custom',
    name: '직접 입력 기타 공종',
    text: '안동 30평 사무실 파티션 철거 후 재설치',
    custom: true,
  },
  {
    key: '08-photo-only',
    name: '사진만 업로드',
    photo: true,
  },
];

const VIEWPORTS = [
  { key: '390x844', width: 390, height: 844 },
  { key: '360x640', width: 360, height: 640 },
].filter((v) => !process.env.SIM_VIEWPORT || process.env.SIM_VIEWPORT === v.key);

function log(...a) {
  console.log(...a);
}

async function main() {
  await new Promise((r) => server.listen(4199, '127.0.0.1', r));
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    executablePath: process.env.CHROME_PATH || undefined,
  });
  const report = {};
  const allIssues = [];

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: 'ko-KR',
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await context.route('https://generativelanguage.googleapis.com/**', geminiMock);
    await context.route('https://api.open-meteo.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          daily: {
            time: ['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26'],
            weather_code: [3, 61, 1, 0, 2, 80],
            temperature_2m_max: [12, 11, 10, 9, 8, 7],
            temperature_2m_min: [2, 1, 0, -1, -2, -3],
            precipitation_probability_max: [20, 70, 10, 0, 30, 60],
          },
        }),
      })
    );
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    let consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(`console: ${m.text()}`);
    });

    const shot = async (name) => {
      const f = path.join(OUT, `${vp.key}-${name}.png`);
      await page.screenshot({ path: f, fullPage: false });
      return f;
    };
    const issues = [];
    const addIssue = (where, kind, detail) => {
      issues.push({ where, kind, detail });
      allIssues.push({ viewport: vp.key, where, kind, detail });
    };
    const inspect = async (where) => {
      const found = await page.evaluate(() => {
        const out = [];
        const vw = window.innerWidth;
        const de = document.documentElement;
        if (de.scrollWidth > vw + 1) out.push({ kind: '가로넘침', detail: `문서 ${de.scrollWidth}px > 화면 ${vw}px` });
        const skip = (el) => {
          let n = el.parentElement;
          while (n && n !== document.body) {
            const ox = getComputedStyle(n).overflowX;
            if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true;
            n = n.parentElement;
          }
          return false;
        };
        const label = (el) => {
          const t = (el.innerText || el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
          return `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.split(' ').slice(0, 2).join('.')}` : ''} "${t}"`;
        };
        const seen = new Set();
        for (const el of document.querySelectorAll('main *, header *, [role=dialog] *')) {
          if (!(el instanceof HTMLElement)) continue;
          const st = getComputedStyle(el);
          if (st.display === 'none' || st.visibility === 'hidden') continue;
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
          if (r.right > vw + 1.5) {
            if (skip(el)) continue;
            const key = label(el);
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ kind: '오른쪽 잘림', detail: `${key} (right ${Math.round(r.right)} / ${vw})` });
          }
        }
        const text = (document.querySelector('main')?.innerText || '') + (document.querySelector('[role=dialog]')?.innerText || '');
        const bad = text.match(/\b(NaN|undefined|null|Infinity)\b/g);
        if (bad) out.push({ kind: '이상한 값', detail: [...new Set(bad)].join(',') });
        const kg = text.match(/-?\d[\d,]*만원/g) || [];
        if (kg.some((s) => /NaN/.test(s))) out.push({ kind: '금액', detail: 'NaN만원' });
        if (/\d{7,}만원/.test(text)) out.push({ kind: '금액', detail: '너무 큰 금액 표기' });
        return out;
      });
      for (const f of found) addIssue(where, f.kind, f.detail);
    };
    const text = async () => page.locator('main').innerText();
    const dialogText = async () => {
      const n = page.locator('[role=dialog]');
      return (await n.count()) ? n.first().innerText() : '';
    };
    const tabs = () => page.locator('nav[aria-label="현장 단계"] button');
    const openTab = async (n) => {
      await tabs().nth(n - 1).click();
      await page.waitForTimeout(450);
      await page.evaluate(() => window.scrollTo(0, 0));
    };
    const goHome = async () => {
      const b = page.getByLabel('장부로 돌아가기');
      if (await b.count()) await b.first().click();
      await page.waitForTimeout(400);
    };
    const headerPrice = async () => {
      const t = await page.locator('main').innerText();
      const m = t.match(/견적\s*([\d,]+)\s*만원/);
      return m ? Number(m[1].replace(/,/g, '')) : null;
    };
    const residualPrice = async () => {
      const t = await page.locator('main').innerText();
      const m = t.match(/남는 돈\(보수적\)\s*(-?[\d,]+)만/);
      return m ? Number(m[1].replace(/,/g, '')) : null;
    };

    await page.goto('http://127.0.0.1:4199/', { waitUntil: 'networkidle' });

    // ── 잠금 화면 ────────────────────────────────────
    await inspect('잠금');
    await shot('00-lock');
    const lockBefore = consoleErrors.length;
    for (const d of ['1', '2', '3', '3']) await page.getByLabel(`${d} 번`).click();
    await page.waitForTimeout(700);
    const stillLocked = (await page.getByText('비밀번호 4자리를 눌러 주세요').count()) > 0;
    if (!stillLocked) addIssue('잠금', '보안', '틀린 PIN으로 열림');
    for (const d of ['3', '8', '5', '5']) await page.getByLabel(`${d} 번`).click();
    await page.getByText('오늘 장부').waitFor({ timeout: 15000 });

    if (consoleErrors.length > lockBefore) addIssue('잠금', '콘솔', consoleErrors.slice(lockBefore).join(' | '));
    await inspect('홈');
    await shot('01-home');

    for (const sc of SCENARIOS) {
      const where = sc.key;
      consoleErrors = [];
      let created = null;
      try {
        if (sc.bid) {
          await goHome();
          await page.getByText('관공서 일감').first().click();
          await page.waitForTimeout(700);
          await inspect(`${where}/관공서일감`);
          await shot(`${where}-0-일감`);
          const card = page.locator('main button').filter({ hasText: /추정가격|예상 투찰가|낙찰하한/ }).first();
          if (await card.count()) {
            await card.click();
            await page.waitForTimeout(600);
            await inspect(`${where}/공고상세`);
            await shot(`${where}-0-상세`);
          }
          const imp = page.getByRole('button', { name: /내 장부로 가져오기/ }).first();
          if (!(await imp.count())) {
            addIssue(where, '공고', '내 장부로 가져오기 버튼 없음');
            continue;
          }
          await imp.click();
          await page.waitForTimeout(1500);
        } else {
          // 사진만 올리는 시나리오에서만 AI 키를 켠다 (글 시나리오는 로컬 분류 그대로)
          if (sc.photo) await page.evaluate(() => localStorage.setItem('aiSiteManager.geminiKey', 'AIzaTESTKEY123'));
          await goHome();
          await page.getByRole('button', { name: /새 현장 만들기/ }).click();
          await page.getByText('숨고·카톡·메모를 그대로 넣으세요').waitFor();
          await inspect(`${where}/새현장`);
          await shot(`${where}-0-새현장`);
          if (sc.photo) {
            await page.getByLabel('현장 사진 선택').setInputFiles(path.join(FIXTURES, 'kitchen-scene.jpg'));
            await page.getByText('현장 사진 1장 붙였습니다', { exact: false }).waitFor({ timeout: 5000 });
            await page.getByRole('button', { name: /자동으로 분류하기|AI 정밀 분석/ }).click();
            await page.getByText('자동으로 잡았습니다').waitFor({ timeout: 25000 });
          } else {
            await page.getByLabel('현장 요청 내용').fill(sc.text);
            await page.getByRole('button', { name: /자동으로 분류하기|AI 정밀 분석/ }).click();
            await page.getByText('자동으로 잡았습니다').waitFor({ timeout: 25000 });
          }
          await page.waitForTimeout(400);
          await inspect(`${where}/분류결과`);
          await shot(`${where}-0-분류결과`);
          const modalText = await dialogText();
          fs.writeFileSync(path.join(OUT, `${vp.key}-${where}-0-분류결과.txt`), modalText);
          const draftEl = page.locator('[data-testid=draft-quote]');
          const shown = (await draftEl.count())
            ? Number(await draftEl.first().getAttribute('data-amount'))
            : modalText.match(/([\d,]+)만원/) ? Number(modalText.match(/([\d,]+)만원/)[1].replace(/,/g, '')) : null;
          if (!(await draftEl.count())) addIssue(`${where}/분류결과`, '미리보기', '만들기 전 견적 미리보기 카드가 없음');
          await page.getByRole('button', { name: /이 내용으로 가견적 보기/ }).click();
          // v3.12부터 새 현장은 2단계 가견적으로 바로 들어간다 — 1단계 '받은 내용'은 탭을 열어야 보인다
          await page.locator('nav[aria-label="현장 단계"] button').first().waitFor();
          await page.waitForTimeout(700);
          if (sc.photo) await page.evaluate(() => localStorage.removeItem('aiSiteManager.geminiKey'));
          const hp = await headerPrice();
          created = { modalFirstPrice: shown, header: hp };
          if (sc.custom) {
            // 공종을 '기타'로 바꾸고 직접 이름을 넣는다 — 공종 칩은 1단계(정보)에 있다
            await openTab(1);
            await page.waitForTimeout(400);
            // (화면에 지역 '기타' 칩도 있어서 첫 버튼만 누르면 공종이 안 바뀐다 — 될 때까지 눌러 본다)
            const otherBtns = page.getByRole('button', { name: '기타', exact: true });
            for (let i = 0; i < (await otherBtns.count()); i += 1) {
              await otherBtns.nth(i).click().catch(() => {});
              await page.waitForTimeout(300);
              if (await page.getByLabel('직접 공종 이름').count()) break;
            }
            await page.waitForTimeout(300);
            const nameInput = page.getByLabel('직접 공종 이름');
            if (await nameInput.count()) {
              await nameInput.fill('사무실 파티션 철거·재설치');
              await page.waitForTimeout(600);
              created.header = await headerPrice();
            } else {
              addIssue(where, '기타 공종', '직접 공종 이름 입력칸이 없음');
            }
          }
        }

        // ── 1~6단계 ────────────────────────────────
        const stageText = {};
        for (const [n, label] of [
          [1, '정보'],
          [2, '가견적'],
          [3, '답사'],
          [4, '수익'],
          [5, '시공'],
          [6, '문서'],
        ]) {
          await openTab(n);
          await inspect(`${where}/${label}`);
          stageText[label] = await text();
          fs.writeFileSync(path.join(OUT, `${vp.key}-${where}-${n}-${label}.txt`), stageText[label]);
          await shot(`${where}-${n}-${label}`);
          if (n === 2) {
            const hero = await page.evaluate(() => {
              const h = document.querySelector('main .hero-card .num');
              return h ? Number(String(h.textContent || '').replace(/[^\d]/g, '')) : null;
            });
            const hp = await headerPrice();
            if (hp !== null && hero !== null && Math.abs(hp - hero) > 0) {
              addIssue(`${where}/가견적`, '가격불일치', `상단 견적 ${hp} vs 가견적 카드 ${hero}`);
            }
          }
          if (n === 6) {
            const printText = await page.locator('.print-area').first().innerText().catch(() => '');
            fs.writeFileSync(path.join(OUT, `${vp.key}-${where}-6-문서출력.txt`), printText);
            if (/원가|마진|일당|실행원가|수주금액/.test(printText)) {
              addIssue(`${where}/문서`, '내부정보노출', printText.match(/.{0,20}(원가|마진|일당|실행원가|수주금액).{0,20}/)?.[0] || '');
            }
          }
        }

        // ── 홈 카드 가격 == 상단 견적 ─────────────────
        await goHome();
        await inspect(`${where}/홈복귀`);
        const firstCard = await page.locator('main .card').first().innerText().catch(() => '');
        const cardPrice = firstCard.match(/([\d,]+)\s*만원/) ? Number(firstCard.match(/([\d,]+)\s*만원/)[1].replace(/,/g, '')) : null;
        if (created && created.header !== null && cardPrice !== null && cardPrice !== created.header) {
          addIssue(where, '가격불일치', `작업 상단 ${created.header} vs 홈 카드 ${cardPrice}`);
        }
        if (created && !sc.custom && created.modalFirstPrice !== null && created.header !== null) {
          const diff = Math.abs(created.modalFirstPrice - created.header);
          if (diff > 0) {
            addIssue(where, '생성·가견적 가격불일치', `만들 때 화면 ${created.modalFirstPrice} vs 가견적 ${created.header} (차 ${diff})`);
          }
        }
      } catch (e) {
        addIssue(where, '실행오류', e.message.split('\n')[0].slice(0, 160));
        await shot(`${where}-error`).catch(() => {});
      }
      if (consoleErrors.length) addIssue(where, '콘솔', consoleErrors.slice(0, 3).join(' | '));
      report[`${vp.key}/${where}`] = { name: sc.name, created, issues: issues.filter((i) => i.where.startsWith(where)) };
    }

    // ── 답사 추가·감액 (첫 현장에서) ────────────────────
    try {
      consoleErrors = [];
      await goHome();
      await page.getByText('안동 풍산읍 15평 상가 원상복구 철거').first().click();
      await openTab(3);
      const before = await headerPrice();
      const box = page.getByLabel('현장 변동 내용');
      await box.fill('폐기물 한 차 더 나올 듯');
      await page.waitForTimeout(400);
      const apply = page.locator('button[data-can-apply]').first();
      if (await apply.count()) {
        await apply.click();
        await page.waitForTimeout(1200);
      } else addIssue('답사', '답사', '견적 반영 버튼 없음');
      const after = await headerPrice();
      if (before === after) addIssue('답사', '답사', `추가 반영 후 금액 그대로 ${before}`);
      const addText = await text();
      fs.writeFileSync(path.join(OUT, `${vp.key}-survey-add.txt`), addText);
      await inspect('답사/추가후');
      await shot('survey-add');

      await box.fill('사다리차 취소, 보양 제외');
      await page.waitForTimeout(300);
      const apply2 = page.locator('button[data-can-apply]').first();
      if (await apply2.count()) {
        await apply2.click();
        await page.waitForTimeout(1200);
      }
      const after2 = await headerPrice();
      const body = await page.locator('body').innerText();
      const told = /뺐습니다/.test(body);
      // 화면 안내(토스트)로 실제로 빠졌는지 확인하고, 계약가 고정 현장이 아니면 금액도 봐야 한다
      if (!told) addIssue('답사', '감액', `감액 안내가 없음 (견적 ${after} → ${after2})`);
      const fixedPrice = await page.evaluate(() => {
        const st = JSON.parse(localStorage.getItem('aiSiteManager.v1') || '{}');
        const c = (st.cases || []).find((x) => String(x.title || '').includes('풍산읍'));
        return c ? c.customClientPrice !== '' && c.customClientPrice !== null && c.customClientPrice !== undefined : false;
      });
      if (told && !fixedPrice && after2 !== null && after2 >= after) {
        addIssue('답사', '감액', `감액 후 견적이 줄지 않음 ${after} → ${after2}`);
      }
      await inspect('답사/감액후');
      await shot('survey-cut');
      if (consoleErrors.length) addIssue('답사', '콘솔', consoleErrors.slice(0, 3).join(' | '));
    } catch (e) {
      addIssue('답사', '실행오류', e.message.split('\n')[0].slice(0, 160));
    }

    // ── 설정·잠금 ───────────────────────────────────
    try {
      consoleErrors = [];
      await goHome();
      await page.getByLabel('설정').click();
      await page.waitForTimeout(500);
      await inspect('설정');
      await shot('settings');
      const st = await dialogText();
      if (/AIza|apiKey/i.test(st)) addIssue('설정', '키노출', '설정 화면에 키 문자열이 그대로 보임');
      await page.getByLabel('닫기').first().click();
      await page.waitForTimeout(300);
      await page.getByLabel('잠그기').click();
      await page.waitForTimeout(400);
      if (!(await page.getByLabel('3 번').count())) addIssue('잠금', '보안', '잠그기 후 잠금 화면이 안 뜸');
      else await shot('relock');
      if (consoleErrors.length) addIssue('설정', '콘솔', consoleErrors.slice(0, 3).join(' | '));
    } catch (e) {
      addIssue('설정', '실행오류', e.message.split('\n')[0].slice(0, 160));
    }

    report[`${vp.key}/issues`] = issues;
    await context.close();
  }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(
    path.join(OUT, 'issues.txt'),
    allIssues.map((i) => `[${i.viewport}] ${i.where} · ${i.kind} — ${i.detail}`).join('\n') + '\n'
  );
  log(`\n=== 시뮬레이션 결과: 문제 ${allIssues.length}건 ===`);
  const byKind = {};
  for (const i of allIssues) byKind[i.kind] = (byKind[i.kind] || 0) + 1;
  log(byKind);
  for (const i of allIssues.slice(0, 120)) log(`- [${i.viewport}] ${i.where} · ${i.kind} — ${i.detail}`);
  await browser.close();
  server.close();
}

main().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
