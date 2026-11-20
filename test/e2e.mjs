// 실제 Chromium 으로 빌드(dist)를 열어 v3 화면·시나리오를 클릭 검증하고, 모바일 스크린샷을 남긴다.
// 실행: LD_LIBRARY_PATH=<atk libs> node test/e2e.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { cleanOcrText } from '../src/lib/ocr.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const SHOTS = path.resolve(__dirname, '..', 'screenshots');
fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(DIST, urlPath === '/' ? 'index.html' : urlPath);
  if (!file.startsWith(DIST)) return res.writeHead(403).end();
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

let PAGE = null;
const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    try {
      if (PAGE) await PAGE.screenshot({ path: path.join(SHOTS, `error-${name.replace(/[^a-z0-9가-힣]+/gi, '-')}.png`) });
    } catch (err) {}
    record(name, false, e.message.split('\n')[0].slice(0, 140));
  }
}

async function main() {
  await new Promise((r) => server.listen(4173, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR', deviceScaleFactor: 1 });
  const page = await context.newPage();
  PAGE = page;
  page.setDefaultTimeout(7000);
  page.setDefaultNavigationTimeout(12000);
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, name), fullPage: false, timeout: 30000 });
  const shotAt = async (name, anchor, offset = -120) => {
    const target = page.getByText(anchor, { exact: false }).first();
    if (await target.count()) {
      await target.evaluate((el) => el.scrollIntoView({ block: 'start' })).catch(() => {});
      await page.evaluate((o) => window.scrollBy(0, o), offset);
      await page.waitForTimeout(300);
    }
    await shot(name);
  };
  const mainText = () => page.locator('main').innerText();
  const goPre = async () => {
    await page.getByRole('button', { name: /① 가견적/ }).click();
    await page.waitForTimeout(250);
  };
  const goSurvey = async () => {
    await page.getByRole('button', { name: /② 현장 답사/ }).click();
    await page.waitForTimeout(250);
  };

  // Open-Meteo 응답 고정 (실서비스는 실제 API 사용)
  await context.route('https://api.open-meteo.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        daily: {
          time: ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25'],
          weather_code: [3, 61, 63, 1, 0, 2],
          temperature_2m_max: [12, 9, 7, 10, 11, 8],
          temperature_2m_min: [1, -2, -3, 0, 2, -1],
          precipitation_probability_max: [20, 70, 80, 10, 0, 30],
        },
      }),
    })
  );
  const goHome = async () => {
    const back = page.getByLabel('장부로 돌아가기');
    if (await back.count()) await back.first().click();
    await page.waitForTimeout(300);
  };

  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  const base = 'http://127.0.0.1:4173/';

  // ---------- 0. OCR 잡글자 제거 단위 검증 ----------
  await step('OCR 잡글자 제거 (cleanOcrText)', async () => {
    const raw = [
      '20:50 표 ~>d',
      '< 삭제하기',
      '요청 상세',
      '경북 안동시 풍산읍 15평 상가',
      '엘리베이터 없음 3층',
      '견적 보낸 고수 8명 1일 전',
      '아파트 인테리어 바닥 미장 필요',
      '1개의 oi u',
      '창호 제외',
    ].join('\n');
    const clean = cleanOcrText(raw);
    record('OCR: 시계·삭제하기·요청 상세 제거', !/20:50|삭제하기|요청 상세/.test(clean), clean.replace(/\n/g, ' | '));
    record('OCR: 숨고 UI(견적 보낸 고수) 제거', !/견적 보낸 고수/.test(clean));
    record('OCR: 깨진 기호 줄 제거', !/표 ~>|oi u/.test(clean));
    record('OCR: 핵심 줄 보존', ['경북 안동시', '15평', '엘리베이터', '바닥 미장', '창호 제외'].every((k) => clean.includes(k)));
  });

  await page.goto(base, { waitUntil: 'networkidle' });

  // ---------- 1. 잠금 ----------
  await step('잠금 화면', async () => {
    await page.getByText('가족 전용').waitFor();
    await shot('00-lock.png');
    for (const d of ['1', '2', '3', '4']) await page.getByLabel(`${d} 번`).click();
    await page.waitForTimeout(400);
    record('잠금: 틀린 PIN 거부', (await page.getByText('오늘 장부').count()) === 0);
    for (const d of ['3', '8', '8', '5']) await page.getByLabel(`${d} 번`).click();
    await page.getByText('오늘 장부').waitFor({ timeout: 9000 });
    record('잠금: 3885로 해제', true);
  });

  // ---------- 2. 홈 ----------
  await step('홈 화면 · 수금 금액', async () => {
    const t = await mainText();
    record('홈: 현황판 카운트', t.includes('진행 중 4곳') && t.includes('정산 완료 2곳'));
    record('홈: 카드에 계약금·중도금·잔금 금액', /계약금 [\d,]+만 · 중도금 [\d,]+만 · 잔금 [\d,]+만/.test(t));
    await shot('01-home.png');
  });

  // ---------- 3. 관공서 일감 ----------
  await step('관공서 일감', async () => {
    await page.getByText('관공서 일감', { exact: false }).first().click();
    await page.getByText('건 접수 중').waitFor();
    const head = await mainText();
    record('관공서: 실제 공고 로드', /(\d+)\s*건 접수 중/.test(head));
    await page.getByText('길안9지구 임시주택단지 복구공사', { exact: false }).first().click();
    await page.getByText('투찰가·남는 돈 미리보기').waitFor();
    await page.getByRole('button', { name: /내 장부로 가져오기/ }).click();
    await page.getByText('가견적 (답사 전 예상)').waitFor();
    record('가져오기: 장부 생성', (await page.locator('body').innerText()).includes('길안9지구'));
  });

  // ---------- 4. ② 현장 답사 (관공서 현장) ----------
  await step('현장 답사 → 최종 견적 (② 탭)', async () => {
    await goSurvey();
    record('답사: ② 탭에서 답사 입력만 보임', (await mainText()).includes('현장에 가보니 무엇이 달라졌나요'));
    record('답사: “무엇을 하는지” 박스 없음', !(await mainText()).includes('무엇을 하는지 적어주세요'));
    await page.getByLabel('현장 변동 내용').fill('벽에 물기가 많아 방수 필요');
    await page.waitForTimeout(200);
    const before = await mainText();
    record('답사: 자동 미리보기', before.includes('누수 의심 → 방수 보수') && before.includes('+30만'));
    await page.getByRole('button', { name: '답사 내용으로 최종 견적 다시 내기' }).click();
    await page.waitForTimeout(500);
    const after = await mainText();
    record('답사: 최종 견적 자동 갱신(2,720→2,750)', after.includes('2,750'));
    record('답사: 변화 이유 ▲ 표시', after.includes('무엇이 왜 바뀌었나') && after.includes('▲') && after.includes('이유:'));
    record('답사: 가견적→최종 요약', /가견적 [\d,]+만 → 최종 견적 [\d,]+만/.test(after));
    await shotAt('11-survey-final.png', '무엇이 왜 바뀌었나', -140);
    await goHome();
  });

  // ---------- 5. 욕실 현장 ① 가견적 ----------
  await step('욕실 현장 · 가견적', async () => {
    await page.getByText('구미 형곡동 32평 아파트 욕실 1칸').click();
    await page.getByText('가견적 (답사 전 예상)').waitFor();
    const t = await mainText();
    record('겸적: 1차 가견적 라벨', t.includes('1차 가견적 (답사 전 · 변동 가능)'));
    record('욕실: 견적 480만', t.includes('480'));
    record('욕실: 추천 자재 세트 3종', t.includes('국산 실속') && t.includes('브랜드 표준') && t.includes('포세린 고급'));
    record('욕실: 자재 사양', t.includes('600×1200') && t.includes('매립수전'));
    record('욕실: 브랜드별 기준 가격', t.includes('브랜드별 기준 가격') && t.includes('아메리칸스탠다드'));
    record('겸적: 2파트 세그먼트', t.includes('① 가견적 (답사 전)') && t.includes('② 현장 답사 · 최종 견적'));
    await shotAt('02-estimate-design.png', '1차 가견적', -100);
  });

  await step('빠진 비용 체크 · 답사 주의', async () => {
    await page.getByText('빠진 비용 체크').scrollIntoViewIfNeeded();
    const t = await mainText();
    record('검증: 빠진 비용 한 번에 넣기 버튼', t.includes('빠진 비용 한 번에 넣기') || t.includes('모두 반영'));
    record('검증: 답사 주의사항', t.includes('답사 시 꼭 확인하세요') && t.includes('추가 비용 발생 경우의 수'));
    await shotAt('02b-verify.png', '빠진 비용 체크', -150);
    const fill = page.getByRole('button', { name: /빠진 비용 한 번에 넣기/ });
    if (await fill.count()) {
      await fill.first().click();
      await page.waitForTimeout(400);
      record('검증: 빠진 비용 채우기 동작', (await mainText()).includes('모두 반영') || (await mainText()).includes('반영됨'));
    }
  });

  await step('자재 세트 전환 → 견적·견적서·발주 연동', async () => {
    await page.getByRole('button', { name: /국산 실속/ }).first().click();
    await page.waitForTimeout(500);
    const t = await mainText();
    record('자재: 실속 세트 선택 표시', t.includes('국산 실속'));
    record('자재: 실속 사양(300×600)', t.includes('300×600 무광 국산 타일'));
    record('자재: 견적 금액 변경', !t.includes('480'));
    await shotAt('02c-material.png', '추천 자재 세트', -120);

    // 3단계 발주 리스트에 실속 자재가 반영
    await page.locator('nav button').filter({ hasText: '시공' }).first().click();
    await page.waitForTimeout(400);
    const b = await mainText();
    record('자재: 발주 리스트에 실속 품명', b.includes('300×600 무광 국산타일'));

    // 손님 견적서 사양도 바뀐다
    await page.locator('nav button').filter({ hasText: '문서' }).first().click();
    await page.waitForTimeout(400);
    const d = await mainText();
    record('자재: 손님 견적서 사양 변경', d.includes('300×600 무광 국산 타일'));

    await page.locator('nav button').filter({ hasText: '견적' }).first().click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /브랜드 표준/ }).first().click();
    await page.waitForTimeout(400);
    record('자재: 표준으로 복귀', (await mainText()).includes('브랜드 표준'));
  });

  await step('비슷한 실제 사례 (욕실)', async () => {
    const det = page.locator('details').filter({ hasText: '비슷한 실제 사례 보기' }).first();
    await det.evaluate((el) => (el.open = true));
    await page.waitForTimeout(300);
    const n = await page.locator('[data-similar-case]').count();
    record('사례: 욕실 최소 3건', n >= 3, `${n}건`);
    await shotAt('02d-similar.png', '비슷한 실제 사례 보기');
  });

  // ---------- 6. 손님 견적서 원가 은닉 ----------
  await step('손님 견적서 — 원가·마진 은닉', async () => {
    await page.locator('nav button').filter({ hasText: '문서' }).first().click();
    await page.getByText('손님에게 보낼 견적서').waitFor();
    const docText = await page.locator('.print-area').innerText();
    const leak = ['원가', '남는', '일당', '예비비', '타일공', '양중비', '안전 여유비', '실행 일당', '마진'].filter((w) => docText.includes(w));
    record('견적서: 내부 원가 용어 없음', leak.length === 0, leak.join(', '));
    const sum = await page.evaluate(() => {
      const lines = [...document.querySelectorAll('.print-area [data-quote-line]')];
      return {
        lines: lines.reduce((s, el) => s + Number(el.getAttribute('data-amount') || 0), 0),
        count: lines.length,
        subtotal: Number(document.querySelector('.print-area [data-testid=quote-subtotal]')?.getAttribute('data-amount') || 0),
      };
    });
    record('견적서: 공정 줄 합계 = 공급가', sum.lines === sum.subtotal && sum.count >= 2, `${sum.lines} vs ${sum.subtotal} (${sum.count}줄)`);
    record('견적서: 계약금·중도금·잔금 금액 표시', /계약금 \d+%[\s\S]{0,20}[\d,]+만원/.test(docText) && docText.includes('잔금'));
    record('견적서: 사용 자재 사양(금액 없이)', docText.includes('사용 자재'));
    record('견적서: 발주 문자 항목 없음', !(await mainText()).includes('자재 발주 문자'));
    await shotAt('05-docs.png', '손님에게 보낼 견적서', -100);
    await shot('05b-doc-body.png');
  });

  // ---------- 7. 3단계 발주 · 날씨 · 잠금해제 ----------
  await step('시공 탭 — 잠금 없음 · 업체별 발주', async () => {
    await page.locator('nav button').filter({ hasText: '시공' }).first().click();
    await page.getByText('권장 순서').waitFor();
    const t = await mainText();
    record('시공: 강제 잠금 제거', !t.includes('잠김') && !t.includes('완료하면 열립니다') && t.includes('잠그지 않았습니다'));
    record('시공: 4단계 모두 열려 있음', t.includes('계약금·중도금·잔금 받기') && t.includes('관리실 신고·보양·사다리차 승인') && t.includes('준공 검수'));
    record('시공: 업체별 발주 리스트', t.includes('자재 발주 리스트 (업체별)') && t.includes('방수 자재상') && t.includes('타일·도기 대리점'));
    record('시공: 발주 체크박스', t.includes('발주 전') || t.includes('발주 완료'));
    record('시공: 업체별 복사 버튼', (await page.getByRole('button', { name: /이 업체 발주 내용 복사/ }).count()) >= 2);
    record('시공: 계약금 금액 입금 카드', /계약금 [\d,]+만원 입금 확인/.test(t));
    record('시공: 추가금 기록 카드', t.includes('추가금 기록') && t.includes('추가금 자동 계산해서 기록'));
    await shotAt('04-build-order.png', '자재 발주 리스트 (업체별)', -110);
    const ck = page.getByRole('button', { name: /발주 완료/ }).first();
    if (await ck.count()) {
      await ck.click();
      await page.waitForTimeout(300);
      record('시공: 발주 완료 체크', (await mainText()).includes('발주 완료'));
    }
  });

  await step('시공일 날씨', async () => {
    await page.getByLabel('시공 시작일').scrollIntoViewIfNeeded();
    const before = await mainText();
    record('날씨: 시작일 전 안내', before.includes('시공 시작일을 정하면 그날부터 공사기간 날씨를 맞춰'));
    await page.getByLabel('시공 시작일').fill('2026-11-21');
    await page.waitForTimeout(1200);
    const after = await mainText();
    record('날씨: 시작일 기준 예보', after.includes('시공일 날씨') && after.includes('11/21'));
    record('날씨: 비/한파 주의', after.includes('비 올 확률 80%') || after.includes('최저 -3'));
    await shotAt('04b-weather.png', '시공일 날씨', -110);
  });

  await step('방수 담수 테스트', async () => {
    await page.getByText('방수 담수 테스트 48시간').scrollIntoViewIfNeeded();
    const d = new Date(Date.now() - 3 * 864e5);
    const pad = (n) => String(n).padStart(2, '0');
    await page.locator('input[type="datetime-local"]').fill(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`);
    for (const label of ['① 물 높이 표시한 사진', '② 24시간 지난 사진', '③ 물 빼기 직전 사진', '아래층 천장 누수 없음 확인']) {
      await page.getByText(label, { exact: false }).first().click();
      await page.waitForTimeout(90);
    }
    await page.waitForTimeout(350);
    const t = await mainText();
    record('방수: 48시간·사진3컷 → 해제', t.includes('타일 기공을 불러도 됩니다'));
    record('방수: 누수 배상 경고', t.includes('60,760,533'));
    record('방수: 잠금 대신 안내', t.includes('숨기지 않습니다'));
    await shotAt('06-waterproof-unlocked.png', '타일 기공을 불러도 됩니다');
  });

  // ---------- 8. 수익 탭 — 수금 금액 ----------
  await step('수익 탭 · 계약금/중도금/잔금 금액', async () => {
    await page.locator('nav button').filter({ hasText: '수익' }).first().click();
    await page.getByText('원가·마진·수금 조절').waitFor();
    const t = await mainText();
    record('수익: 핵심 항목 펼침', t.includes('부가세 10% 따로 받기') && t.includes('계약금 · 중도금 · 잔금'));
    record(
      '수익: 계약금/중도금/잔금 입력·금액 표시',
      t.includes('계약금 %') && (await page.getByLabel('계약금 비율').count()) >= 1 && (await page.getByLabel('잔금 비율').count()) >= 1
    );

    await page.getByLabel('고객에게 받을 금액 직접 정하기 (만원)').fill('615');
    await page.waitForTimeout(500);
    const t2 = await mainText();
    record('수금: 615만 → 185/246/184만', t2.includes('185') && t2.includes('246') && t2.includes('184'), t2.match(/계약금[\s\S]{0,30}/)?.[0]?.replace(/\n/g, ' '));

    record('수익: 하루 순수익', /하루 뛰면 [\d,]+만원/.test(t2));
    record('수익: 보수적 원가 산출 설명', t2.includes('보수적 원가') && t2.includes('돌발 예비비'));
    record('수익: 최소 방어선 설명', t2.includes('최소 안전마진 5%'));
    record('수익: 원가 절감 스위치', t2.includes('원가 절감 스위치'));
    record('수익: 비-인력 알선료 배너 숨김', !t2.includes('인력 소개비(알선료)'));

    await page.getByLabel('잔금 비율').fill('40');
    await page.waitForTimeout(400);
    const t3 = await mainText();
    record('수금: 합계 100% 아니면 경고', t3.includes('비율 합계가 110%') && t3.includes('30/40/30으로 맞추기'));
    await shotAt('03-profit-payment.png', '계약금 · 중도금 · 잔금', -110);
    await page.getByRole('button', { name: '30/40/30으로 맞추기' }).click();
    await page.waitForTimeout(400);
    record('수금: 30/40/30 복구', (await mainText()).includes('합계 100%'));

    await page.getByRole('button', { name: '일 끝나고 전액' }).click();
    await page.waitForTimeout(400);
    const t4 = await mainText();
    record('수금: 0/0/100 프리셋', t4.includes('합계 100%') && (await page.getByLabel('계약금 비율').inputValue()) === '0');
    await page.getByRole('button', { name: '표준 분할' }).click();
    await page.waitForTimeout(400);

    // 네고 시뮬레이터
    await page.getByLabel('고객이 부른 금액 (만원)').fill('420');
    await page.waitForTimeout(300);
    const nego = await mainText();
    record('네고: 방어선 경고', nego.includes('최소 방어선'));
    const msg = await page.getByText('고객에게 이렇게 말하세요').locator('..').innerText();
    record('설득 멘트: 내 순수익 언급 없음', !/남습니다|남는 게/.test(msg));
    await shotAt('03b-nego.png', '고객에게 이렇게 말하세요', -320);
  });

  // ---------- 9. 시공 탭 금액 연동 확인 ----------
  await step('계약금 금액이 시공·홈에 연동', async () => {
    await page.locator('nav button').filter({ hasText: '시공' }).first().click();
    await page.waitForTimeout(400);
    const b = await mainText();
    record('연동: 시공 카드에 계약금 185만', b.includes('계약금 185만원 입금 확인'), b.match(/계약금 [\d,]+만원 입금 확인/)?.[0] || '');
    record('연동: 중도금 246·잔금 184만', b.includes('중도금 246만원 입금 확인') && b.includes('잔금 184만원 입금 확인'));
    await shotAt('04c-payments.png', '계약금·중도금·잔금 받기', -110);
    await goHome();
    const h = await mainText();
    record('연동: 홈 장부 카드 금액', h.includes('계약금 185만') && h.includes('중도금 246만') && h.includes('잔금 184만'));
    await shotAt('01b-home-payments.png', '구미 형곡동 32평 아파트 욕실 1칸', -140);
  });

  // ---------- 10. 복합 인테리어 · 폐기물 ----------
  await step('복합 인테리어 — 비슷한 사례', async () => {
    await page.getByRole('button', { name: /새 현장 만들기/ }).click();
    await page.getByText('숨고·카톡·메모를 그대로 넣으세요').waitFor();
    await page.getByLabel('현장 요청 내용').fill('안동 15평 아파트 전체 인테리어, 공실, 창호 제외, 바닥 미장 필요');
    await page.getByRole('button', { name: '자동으로 분류하기' }).click();
    await page.getByText('자동으로 잡았습니다').waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: /이 내용으로 현장 만들기/ }).click();
    await page.getByText('가견적 (답사 전 예상)').waitFor();
    record('복합: 공종 잡힘', (await mainText()).includes('복합 인테리어'));
    const det = page.locator('details').filter({ hasText: '비슷한 실제 사례 보기' }).first();
    await det.evaluate((el) => (el.open = true));
    await page.waitForTimeout(300);
    const n = await page.locator('[data-similar-case]').count();
    record('복합: 사례 최소 3건(빈 화면 없음)', n >= 3, `${n}건`);
    await shotAt('15-combined-similar.png', '비슷한 실제 사례 보기');
    await goHome();
  });

  await step('폐기물 현장 — 스타일·자재 카드 숨김', async () => {
    await page.getByRole('button', { name: /새 현장 만들기/ }).click();
    await page.getByText('숨고·카톡·메모를 그대로 넣으세요').waitFor();
    await page.getByLabel('현장 요청 내용').fill('안동 2.5톤 폐기물 처리');
    await page.getByRole('button', { name: '자동으로 분류하기' }).click();
    await page.getByText('자동으로 잡았습니다').waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: /이 내용으로 현장 만들기/ }).click();
    await page.getByText('가견적 (답사 전 예상)').waitFor();
    const t = await mainText();
    record('폐기물: 스타일·자재 카드 없음', !t.includes('스타일·자재 정하기'));
    record('폐기물: 광폭 합지 없음', !t.includes('광폭 합지') && !t.includes('장판'));
    record('폐기물: 자재 세트 안내', !t.includes('추천 자재 세트'));
    await shot('16-waste-no-style.png');
    await goSurvey();
    const s = await mainText();
    record('폐기물: 체크리스트에서 준공청소 제외', !s.includes('준공 청소'));
    record('폐기물: 혼합 폐기물 체크', s.includes('혼합 폐기물 있음'));
    record('폐기물: 실제 톤수 반영(0톤 아님)', s.includes('폐기물 분리 계산 (2.5톤)'), s.match(/폐기물 분리 계산 \([^)]*\)/)?.[0] || '없음');
    record('폐기물: 석면 경보 없음', !s.includes('석면(천장 텍스)'));
    record('폐기물: 철거 전 사진 6곳 대신 작업 기록', s.includes('작업 전·후 기록') && !s.includes('철거 전 사진 6곳'));
    record('폐기물: 추가금 기록 없음(시공에서)', !s.includes('추가금 기록'));
    record('폐기물: 5톤 미만 처리계획서 숨김', !s.includes('5톤 이상 처리계획서'));
    record('폐기물: 철거 전 6부위 없음', !s.includes('철거 전 6부위'));
    record('폐기물: 브랜드 가격 없음', !s.includes('브랜드별 기준 가격'));
    await shot('16b-waste-survey.png');
    await goHome();
  });

  // ---------- 11. 점포철거비 지원금 ----------
  await step('점포철거비 지원금 카드', async () => {
    await page.getByText('안동 풍산읍 15평 상가 원상복구 철거').click();
    await page.getByText('가견적 (답사 전 예상)').waitFor();
    const t = await mainText();
    record('철거: 지원금 카드', t.includes('점포철거비 지원금') && t.includes('300'));
    record('철거: 대상 판별 체크리스트', t.includes('대상인지 확인') && t.includes('유상으로 빌린 상가인가요'));
    record('철거: 필요 서류 6종', ['임대차계약서', '폐업사실증명', '공사(철거) 계약서', '전자세금계산서', '계좌이체 확인증', '동일 각도 사진'].every((k) => t.includes(k)));
    record('철거: 대행 수수료 안내', t.includes('서류 대행, 비용은?') && t.includes('10~20만원'));
    record('철거: 대행 안내 문자 복사', (await page.getByRole('button', { name: /서류 대행 안내 문자 복사/ }).count()) === 1);
    await shotAt('07-subsidy.png', '점포철거비 지원금', -120);
    await page.getByRole('button', { name: /서류 대행 안내 문자 복사/ }).click();
    await page.waitForTimeout(300);

    // 지원금 제출용 공사내역서 (4단계 문서)
    await page.getByRole('button', { name: /지원금 제출용 공사내역서 뽑기/ }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: '지원금 공사내역서' }).click();
    await page.waitForTimeout(400);
    const sheet = await page.locator('.print-area').innerText();
    record('지원금 내역서: 공식 항목(품명·규격·수량·단가)', ['품명', '규격', '수량', '단가', '공급가액'].every((k) => sheet.includes(k)));
    record('지원금 내역서: 신청인·시공업체·전용면적', sheet.includes('신청인 (공급받는 자)') && sheet.includes('공급자 (시공업체)') && sheet.includes('전용면적'));
    record('지원금 내역서: 공급가액·부가세·총합계', sheet.includes('공급가액') && sheet.includes('부가세(10%)') && sheet.includes('총합계'));
    record('지원금 내역서: 전후 사진·직인', sheet.includes('첨부 사진') && sheet.includes('직인'));
    record('지원금 내역서: 원가·마진 미노출', !['원가', '마진', '남는', '일당'].some((w) => sheet.includes(w)));
    record('지원금 내역서: 복사 버튼', (await page.getByRole('button', { name: /공사내역서 복사/ }).count()) === 1);
    await shotAt('07b-subsidy-sheet.png', '공사내역서 (점포철거비', -100);
    await goHome();
  });

  // ---------- 12. 도배 현장 변동 ----------
  await step('현장 변동 — 글 한 줄로 반영', async () => {
    await page.getByText('포항 두호동 24평 빌라 도배·장판').click();
    await page.getByText('가견적 (답사 전 예상)').waitFor();
    await goSurvey();
    await page.getByLabel('현장 변동 내용').fill('폐기물 1톤 추가, 벽체 목공 덧대기');
    await page.locator('details').filter({ hasText: '직접 금액 고치기' }).first().evaluate((el) => (el.open = true));
    await page.waitForTimeout(200);
    await page.getByLabel('변동 금액').fill('25');
    await page.getByRole('button', { name: '답사 내용으로 최종 견적 다시 내기' }).click();
    await page.waitForTimeout(600);
    const changed = await mainText();
    record('변동: 즉시 반영(324→349)', changed.includes('349'), changed.match(/가견적[\s\S]{0,40}/)?.[0]?.replace(/\n/g, ' '));
    record('변동: 이유 표시', changed.includes('무엇이 왜 바뀌었나') && (changed.includes('▲') || changed.includes('▼')));
    await shotAt('08-field-change.png', '무엇이 왜 바뀌었나', -120);

    await page.locator('nav button').filter({ hasText: '문서' }).first().click();
    await page.getByText('손님에게 보낼 견적서').waitFor();
    const d = await mainText();
    record('문서: 변동 내역 자동 갱신', d.includes('현장 변동 내역') && d.includes('349'));
    record('문서: 도배 자재(합지·장판)', d.includes('합지') && d.includes('장판'));
    record('문서: 타일 자재 없음', !d.includes('600각') && !d.includes('포세린'));
    record('문서: 제외사항·특약', d.includes('제외 사항') && d.includes('특약'));

    await page.getByRole('button', { name: '견적 안내 문자' }).first().click();
    await page.waitForTimeout(300);
    const sms = await mainText();
    record('문자: 직영 강점 1줄', sms.includes('인력사무소를 직접 운영'));
    await shotAt('05c-sms.png', '견적 안내 문자', -160);
    await page.getByLabel('장부로 돌아가기').click();
    await page.waitForTimeout(300);
  });

  // ---------- 13. 주방 ----------
  await step('주방 현장', async () => {
    await page.getByText('안동 용상동 주방 3.2m 싱크대 교체').click();
    await page.getByText('가견적 (답사 전 예상)').waitFor();
    const t = await mainText();
    record('주방: 450만·인조대리석', t.includes('450') && t.includes('인조대리석'));
    await page.locator('nav button').filter({ hasText: '시공' }).first().click();
    await page.waitForTimeout(400);
    record('주방: 발주 업체', (await mainText()).includes('싱크대 제작·납품 업체'));
    await goHome();
  });

  // ---------- 14. 새 현장 모달 ----------
  await step('새 현장 모달 — 세로 흐름', async () => {
    await page.getByRole('button', { name: /새 현장 만들기/ }).click();
    await page.getByText('숨고·카톡·메모를 그대로 넣으세요').waitFor();
    const y = await page.evaluate(() => {
      const findTop = (txt) =>
        [...document.querySelectorAll('[role=dialog] button, [role=dialog] textarea')].find((el) => (el.innerText || el.getAttribute('aria-label') || '').includes(txt))?.getBoundingClientRect().top ?? -1;
      return { text: findTop('현장 요청 내용') || findTop('숨고·카톡'), photo: findTop('사진·스샷 올리기'), classify: findTop('자동으로 분류') };
    });
    record('모달: 사진 → 자동분류 세로 배치', y.photo > 0 && y.classify > y.photo, JSON.stringify(y));
    await shot('12-newcase-modal.png');
    await page.getByLabel('닫기').first().click();
    await page.waitForTimeout(300);
  });

  // ---------- 15. OCR 스크린샷 ----------
  await step('숨고 스크린샷 OCR', async () => {
    const dir = '/workspace/attachments/2026-11-21';
    const file = path.join(dir, fs.readdirSync(dir).find((f) => f.startsWith('IMG_1430') && f.endsWith('.jpg')));
    await page.getByRole('button', { name: /새 현장 만들기/ }).click();
    await page.locator('input[type=file]').setInputFiles(file);
    await page.getByText('자동으로 잡았습니다').waitFor({ timeout: 240000 });
    const r = await page.locator('[role=dialog]').innerText();
    record('OCR: 아파트 인테리어 → 복합 15평', r.includes('복합 인테리어') && r.includes('15평'));
    record('OCR: 지역 안동', r.includes('경북 안동시'));
    record('OCR: 바닥 미장 추가', r.includes('바닥 미장'));
    record('OCR: 창호 제외', r.includes('창호') && r.includes('제외'));
    record('OCR: 정리한 글 미리보기', r.includes('받은 내용으로 정리한 글'));
    record('OCR: 잡글자 없음', !/삭제하기|요청 상세|\d{1,2}:\d{2}/.test(r));
    await shot('14-ocr-result.png');
    await page.getByLabel('닫기').first().click();
    await page.waitForTimeout(300);
  });

  // ---------- 16. 설정 ----------
  await step('단가표 변경 → 새 견적만 반영', async () => {
    await goHome();
    await page.getByLabel('설정').click();
    await page.getByText('우리 집 기본 단가표').waitFor();
    await page.getByLabel('철거 기공').fill('30');
    await page.getByText('우리 집 기본 단가표').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: '저장하기' }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /새 현장 만들기/ }).click();
    await page.getByText('숨고·카톡·메모를 그대로 넣으세요').waitFor();
    await page.getByText('자동 분류 없이 공종만 직접 고르기').click();
    await page.getByRole('button', { name: '상가·주택 철거' }).first().click();
    await page.getByText('가견적 (답사 전 예상)').waitFor();
    const newText = await mainText();
    record('단가 변경+예비비: 새 현장 468만', newText.includes('468'), newText.match(/1차 가견적[\s\S]{0,30}/)?.[0]?.replace(/\n/g, ' '));
    await page.waitForTimeout(700);
    const snapshot = await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem('aiSiteManager.v1') || '{}');
      return (st.cases || [])[0]?.unitPriceSnapshot?.labor?.demolition ?? null;
    });
    record('단가 변경: 새 현장 스냅샷', snapshot === 30, `labor.demolition=${snapshot}`);
    await page.getByLabel('장부로 돌아가기').click();
    await page.getByText('안동 풍산읍 15평 상가 원상복구 철거').click();
    await page.getByText('가견적 (답사 전 예상)').waitFor();
    const oldText = await mainText();
    record('단가 변경: 기존 현장 유지(374만)', oldText.includes('374') && !oldText.includes('468'));
  });

  // ---------- 17. 모바일 ----------
  await step('모바일 가로 스크롤·저장', async () => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    record('모바일: 가로 스크롤 없음', overflow <= 1, `overflow=${overflow}px`);
    const stored = await page.evaluate(() => localStorage.getItem('aiSiteManager.v1'));
    record('저장: LocalStorage', !!stored && stored.length > 500, `${stored ? Math.round(stored.length / 1024) : 0}KB`);
    await shot('17-final.png');
  });

  record('콘솔 에러 0건', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  await browser.close();
  server.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n결과: ${results.length - failed.length}/${results.length} 통과`);
  fs.writeFileSync(path.join(SHOTS, 'test-results.json'), JSON.stringify({ results, consoleErrors }, null, 2));
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error('테스트 실행 오류:', e);
  server.close();
  process.exitCode = 2;
});
