// 실제 Chromium 으로 빌드(dist)를 열어 화면·시나리오를 클릭 검증하고, 모바일 스크린샷을 남긴다.
// 실행: LD_LIBRARY_PATH=<atk libs> node test/e2e.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

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
    try { if (PAGE) await PAGE.screenshot({ path: path.join(SHOTS, `error-${name.replace(/[^a-z0-9가-힣]+/gi, '-')}.png`) }); } catch (err) {}
    record(name, false, e.message.split('\n')[0].slice(0, 120));
  }
}

async function main() {
  await new Promise((r) => server.listen(4173, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR', deviceScaleFactor: 1 });
  const page = await context.newPage();
  PAGE = page;
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(10000);
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, name), fullPage: false, timeout: 30000 });
  const shotAt = async (name, anchor, offset = -120) => {
    const target = page.getByText(anchor, { exact: false }).first();
    if (await target.count()) {
      await target.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.evaluate((o) => window.scrollBy(0, o), offset);
      await page.waitForTimeout(300);
    }
    await shot(name);
  };

  // Open-Meteo 응답을 고정해 날씨 표시를 검증한다 (실서비스는 실제 API 사용)
  await context.route('https://api.open-meteo.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        daily: {
          time: ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'],
          weather_code: [3, 61, 63, 1],
          temperature_2m_max: [12, 9, 7, 10],
          temperature_2m_min: [1, -2, -3, 0],
          precipitation_probability_max: [20, 70, 80, 10],
        },
      }),
    })
  );
  const goHome = async () => {
    console.log('  · goHome');
    const back = page.getByLabel('장부로 돌아가기');
    if (await back.count()) await back.first().click();
    await page.waitForTimeout(250);
  };

  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  const base = 'http://127.0.0.1:4173/';
  await page.goto(base, { waitUntil: 'networkidle' });

  // ---------- 가족 전용 잠금 ----------
  await step('잠금 화면', async () => {
    await page.getByText('가족 전용').waitFor();
    await shot('00-lock.png');
    for (const d of ['1', '2', '3', '4']) await page.getByLabel(`${d} 번`).click();
    await page.waitForTimeout(500);
    record('잠금: 틀린 PIN 거부', (await page.getByText('오늘 장부').count()) === 0);
    const enterBtn = page.getByText('들어가기', { exact: true });
    record('잠금: 쓸모없는 들어가기 버튼 없음', (await enterBtn.count()) === 0);
    const iconBox = await page.locator('.bg-brand.rounded-\\[19px\\]').first().boundingBox();
    record('잠금: 상단 아이콘 잘리지 않음', !!iconBox && iconBox.y >= 8, iconBox ? `y=${Math.round(iconBox.y)}` : 'no box');
    for (const d of ['3', '8', '8', '5']) await page.getByLabel(`${d} 번`).click();
    await page.getByText('오늘 장부').waitFor({ timeout: 8000 });
    record('잠금: 3885로 해제', true);
  });

  // ---------- 01 홈 ----------
  await step('홈 화면', async () => {
    await page.getByText('오늘 장부').waitFor();
    const t = await page.locator('body').innerText();
    record('홈: 현황판 카운트', t.includes('진행 중 4곳') && t.includes('정산 완료 2곳'));
    record('홈: 4단계 요약', ['가견적', '실측예정', '시공중', '잔금대기'].every((x) => t.includes(x)));
    record('홈: 수금 배지', t.includes('잔금 대기') && t.includes('잔금 12%'));
    await shot('01-home.png');
  });

  // ---------- 장부 필터 ----------
  await step('장부 필터', async () => {
    await page.locator('summary').filter({ hasText: '필터' }).first().click();
    await page.locator('details[open] select').first().selectOption('포항');
    await page.waitForTimeout(250);
    const t = await page.locator('main').innerText();
    record('장부: 지역 필터(포항)', t.includes('두호동') && !t.includes('풍산읍'));
    await page.getByText('필터 초기화').first().click();
    await page.locator('summary').filter({ hasText: '필터' }).first().click();
    await page.waitForTimeout(200);
    await page.getByLabel('검색').fill('욕실');
    await page.waitForTimeout(250);
    const s = await page.locator('main').innerText();
    record('장부: 검색(욕실)', s.includes('형곡동') && !s.includes('풍산읍'));
    await page.getByLabel('검색어 지우기').click();
    await page.waitForTimeout(200);
  });

  // ---------- 관공서 일감 ----------
  await step('관공서 일감 탭', async () => {
    await page.getByText('관공서 일감', { exact: false }).first().click();
    await page.getByText('건 접수 중').waitFor();
    const head = await page.locator('main').innerText();
    const openCount = Number((head.match(/(\d+)\s*건 접수 중/) || [])[1] || 0);
    record('관공서: 실제 공고 로드', openCount >= 5, `${openCount}건 접수 중`);
    record('관공서: 추정가·투찰가 표시', head.includes('추정가격') && head.includes('예상 투찰가'));
    await shot('09-bids.png');

    await page.getByRole('button', { name: '안동시', exact: true }).first().click();
    await page.waitForTimeout(300);
    const andong = await page.locator('main').innerText();
    const andongCount = Number((andong.match(/^(\d+)건/m) || [])[1] || 0);
    record('관공서: 안동시 필터', andong.includes('경상북도 안동시') && andongCount >= 1, `안동 ${andongCount}건`);

    await page.getByRole('button', { name: '전체', exact: true }).first().click();
    await page.getByRole('button', { name: '철거·해체', exact: true }).click();
    await page.waitForTimeout(300);
    const demo = await page.locator('main').innerText();
    record('관공서: 철거 필터', demo.includes('철거') && !demo.includes('석계초'), '');

    await page.getByRole('button', { name: '전체', exact: true }).first().click();
    await page.getByRole('button', { name: '5,000만 이하' }).click();
    await page.waitForTimeout(250);
    const small = await page.locator('main').innerText();
    record('관공서: 5천만 이하 필터', !small.includes('1.35억'), '');

    await page.getByRole('button', { name: '면허 없는 건만' }).click();
    await page.waitForTimeout(300);
    const none = await page.locator('main').innerText();
    record('관공서: 면허 없는 건 빈 상태 안내', none.includes('1,500만 원 미만') && none.includes('안동시 계약담당'), '');
    await page.getByRole('button', { name: '필터 초기화' }).click();
    await page.waitForTimeout(300);

    await page.getByText('마감 지난 공고도 보기').click();
    await page.waitForTimeout(300);
    const closed = await page.locator('main').innerText();
    record('관공서: 마감 지난 공고 보기', closed.includes('마감') && closed.length > 0, '');
    await page.getByText('접수 중만 보기').click();
    await page.waitForTimeout(300);
  });

  await step('공고 → 투찰가 → 내 장부', async () => {
    await page.getByText('길안9지구 임시주택단지 복구공사', { exact: false }).first().click();
    await page.getByText('투찰가·남는 돈 미리보기').waitFor();
    const d = await page.locator('[role=dialog]').innerText();
    record('투찰가: 추정가×88% = 2,720만', d.includes('2,720만원'), '');
    record('투찰가: 낙찰하한×87.745%', d.includes('2,712만원'), '');
    record('투찰가: 공고번호·면허·지역', d.includes('R26BK01838255') && d.includes('구조물해체') && d.includes('안동시'), '');
    await shot('10-bid-detail.png');
    await page.getByRole('button', { name: /내 장부로 가져오기/ }).click();
    await page.getByText('지금 계산된 견적').waitFor();
    const c = await page.locator('body').innerText();
    record('가져오기: 현장 장부 생성', c.includes('길안9지구') && c.includes('2,720'), '');
    await page.waitForTimeout(900);
    const storedBid = await page.evaluate(() => { const st = JSON.parse(localStorage.getItem('aiSiteManager.v1') || '{}'); return (st.cases || []).find((x) => x.bid?.noticeNo === 'R26BK01838255')?.bid?.noticeNo || ''; });
    record('가져오기: 공고번호 보존', storedBid === 'R26BK01838255', storedBid);

    // 현장 답사: 글만 넣어도 방수 30만 자동 반영
    await page.getByText('현장 답사(실측) · 최종 견적 맞추기').scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.getByLabel('현장 변동 내용').fill('벽에 물기가 많아 방수 필요');
    await page.waitForTimeout(250);
    const before = await page.locator('main').innerText();
    record('답사: 자동 계산 미리보기', before.includes('누수 의심 → 방수 보수') && before.includes('+30만'), '');
    await page.getByRole('button', { name: '견적 즉시 업데이트' }).click();
    await page.waitForTimeout(500);
    const after = await page.locator('main').innerText();
    record('답사: 최종 견적 자동 갱신(2,720→2,750)', after.includes('2,750') && after.includes('최종 확정 견적'), '');
    await shotAt('11-survey-final.png', '현장 답사(실측)');
    await page.getByLabel('장부로 돌아가기').click();
    await page.waitForTimeout(300);
  });

  // ---------- 욕실 현장: 02 견적·디자인 / 03 수익 / 04 시공 잠금 / 05 문서 ----------
  await step('욕실 현장 열기', async () => {
    await page.getByText('구미 형곡동 32평 아파트 욕실 1칸').click();
    await page.getByText('지금 계산된 견적').waitFor();
    const t = await page.locator('main').innerText();
    record('욕실: 견적 480만', t.includes('480'));
    record('욕실: 디자인 번역 자재', t.includes('600×1200') && t.includes('매립수전'));
    record('탭 순서 1→4', ['1단계', '2단계', '3단계', '4단계'].every((x) => t.includes(x)));
    await shotAt('02-estimate-design.png', '지금 계산된 견적');

    // 고난도 디테일 선택 → 할증 경고 확인
    await page.getByText('매립수전', { exact: true }).first().click();
    await page.getByText('간접등(간접조명)', { exact: true }).first().click();
    await page.waitForTimeout(300);
    const t2 = await page.locator('main').innerText();
    record('욕실: 디테일 선택 시 할증', /\+35%/.test(t2));
  });

  await step('02 견적·디자인 스크린샷', async () => {
    // 폐기물·석면 경고를 펼쳐서 보여준다
    for (const label of ['폐기물 분리 계산', '석면(천장 텍스) 조기경보']) {
      const d = page.locator('details').filter({ hasText: label }).first();
      if (await d.count()) await d.evaluate((el) => (el.open = true));
    }
    await page.waitForTimeout(300);
    await shotAt('02b-design.png', '스타일·자재 정하기', -155);
    await shotAt('02c-waste.png', '폐기물 분리 계산');
    await shotAt('02d-asbestos.png', '석면(천장 텍스) 조기경보');
    // 스크린샷 후에는 디테일을 원래대로 (다른 화면 수치가 현실적으로 보이게)
    await page.getByText('매립수전', { exact: true }).first().click();
    await page.getByText('간접등(간접조명)', { exact: true }).first().click();
    await page.waitForTimeout(200);
  });

  await step('03 수익·네고', async () => {
    await page.locator('nav button').filter({ hasText: '수익' }).first().click();
    await page.getByLabel('고객이 부른 금액 (만원)').fill('420');
    await page.waitForTimeout(350);
    const t = await page.locator('main').innerText();
    record('수익: 순수익 표시', t.includes('보수적으로 남는 돈'));
    record('네고: 방어선 경고', t.includes('최소 방어선'));
    record('수익: 알선료는 설정 링크', t.includes('인력 소개비(알선료)') && t.includes('설정 열기'));
    const msg = await page.getByText('고객에게 이렇게 말하세요').locator('..').innerText();
    record('설득 멘트: 내 순수익 언급 없음', !/남습니다|남는 게/.test(msg), msg.slice(0, 60).replace(/\n/g, ' '));
    await shotAt('03-profit-nego.png', '보수적으로 남는 돈');
    await shotAt('03b-nego.png', '고객에게 이렇게 말하세요', -330);

    // 500만원처럼 큰 금액도 슬라이더 상한에 막히지 않고, 견적에 적용된다
    await page.getByLabel('고객이 부른 금액 (만원)').fill('500');
    await page.waitForTimeout(300);
    const sliderMax = await page.getByLabel('제안 금액').getAttribute('max');
    record('네고: 입력한 금액이 슬라이더 상한에 안 막힘', Number(sliderMax) >= 500, `max=${sliderMax}`);
    await page.getByRole('button', { name: '이 금액을 이 현장 견적으로 적용' }).click();
    await page.waitForTimeout(400);
    record('네고: 견적에 적용(500만)', (await page.locator('main').innerText()).includes('500'));
    await page.getByLabel('고객이 부른 금액 (만원)').fill('480');
    await page.waitForTimeout(250);

    // 견적 항목 포함/제외 토글
    await page.locator('details').filter({ hasText: '원가 내역' }).first().evaluate((el) => (el.open = true));
    await page.waitForTimeout(250);
    const toggle = page.locator('button[aria-label$="제외"]').first();
    const toggleLabel = await toggle.getAttribute('aria-label');
    await toggle.click();
    await page.waitForTimeout(350);
    const excludedText = await page.locator('main').innerText();
    record('항목 제외: 원가에서 빠짐', excludedText.includes('제외한 항목'), toggleLabel || '');
    await page.locator('button[aria-label$="다시 포함"]').first().click();
    await page.waitForTimeout(300);
  });

  await step('04 시공 잠금 스크린샷', async () => {
    await page.locator('nav button').filter({ hasText: '시공' }).first().click();
    await page.getByText('지금 차례').waitFor();
    const t = await page.locator('main').innerText();
    record('시공: 1단계부터 순서 표시', t.includes('1단계 · 계약금'));
    record('시공: 잠금 표시', t.includes('잠김') && t.includes('완료하면 열립니다'));
    await shotAt('04-build-locks.png', '날씨 (오늘~3일)', -110);
    await shotAt('04b-build-steps.png', '관리실 신고·보양·사다리차 승인', -120);
    record('날씨: 예보 표시', t.includes('날씨 (오늘~3일)'));
    record('날씨: 비/한파 주의 배지', t.includes('비/한파 예보'));
  });

  // ---------- 방수 잠금 해제 흐름 ----------
  await step('방수 게이트 해제', async () => {
    await page.getByText('계약금 입금 확인').first().click();
    await page.waitForTimeout(250);
    record('시공: 계약금 → 1/4', (await page.locator('main').innerText()).includes('1/4 완료'));
    for (const label of ['관리실 공사 신고', '엘리베이터·복도 보양', '이웃 인사·안내문', '사다리차 설치 승인']) {
      await page.getByText(label, { exact: true }).first().click();
      await page.waitForTimeout(90);
    }
    await page.waitForTimeout(250);
    const t2 = await page.locator('main').innerText();
    record('시공: 4개 체크 → 2/4', t2.includes('2/4 완료'));
    record('시공: 배차 문자 생성', t2.includes('기공 배차 문자'));
    record('방수: 잠금 안내', t2.includes('타일 기공 배차 버튼이 열립니다'));

    const d = new Date(Date.now() - 3 * 864e5);
    const pad = (n) => String(n).padStart(2, '0');
    await page.locator('input[type="datetime-local"]').fill(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`
    );
    for (const label of ['① 물 높이 표시한 사진', '② 24시간 지난 사진', '③ 물 빼기 직전 사진', '아래층 천장 누수 없음 확인']) {
      await page.getByText(label, { exact: false }).first().click();
      await page.waitForTimeout(90);
    }
    await page.waitForTimeout(350);
    const t3 = await page.locator('main').innerText();
    record('방수: 48시간·사진3컷 → 해제', t3.includes('타일 기공을 불러도 됩니다'));
    record('방수: 누수 배상 경고', t3.includes('60,760,533'));
    await shotAt('06-waterproof-unlocked.png', '타일 기공을 불러도 됩니다');
  });

  // ---------- 05 문서: 도배 현장 ----------
  await step('05 문서 스크린샷', async () => {
    await page.getByLabel('장부로 돌아가기').click();
    await page.getByText('포항 두호동 24평 빌라 도배·장판').click();
    await page.getByText('지금 계산된 견적').waitFor();

    // 현장 변동 즉시 반영 (+25만)
    await page.getByLabel('현장 변동 내용').fill('폐기물 1톤 추가, 벽체 목공 덧대기');
    await page.getByLabel('변동 금액').fill('25');
    await page.getByRole('button', { name: '견적 즉시 업데이트' }).click();
    await page.waitForTimeout(2700); // 토스트가 사라진 뒤 화면을 찍는다
    const changed = await page.locator('main').innerText();
    record('변동: 즉시 반영(324→349)', changed.includes('349') && changed.includes('+25만원 반영됨'), changed.match(/현장 변동[\s\S]{0,40}/)?.[0]?.replace(/\n/g, ' '));
    await shotAt('08-field-change.png', '현장 답사(실측) · 최종 견적 맞추기', -120);

    await page.locator('nav button').filter({ hasText: '문서' }).first().click();
    await page.getByText('손님에게 보낼 견적서').waitFor();
    const t = await page.locator('main').innerText();
    record('문서: 도배 자재(합지·장판)', t.includes('합지') && t.includes('장판'));
    record('문서: 타일 자재 없음', !t.includes('600각') && !t.includes('포세린'));
    record('문서: 제외사항·특약', t.includes('제외 사항') && t.includes('특약'));
    record('문서: 부가세 표기', t.includes('부가세'));
    record('문서: 변동 내역 자동 갱신', t.includes('현장 변동 내역') && t.includes('349'));

    // 손님 문자: 인력사무소 직영 강점 + 완료 사례 1줄 (선택)
    await page.getByRole('button', { name: '견적 안내 문자' }).click();
    await page.waitForTimeout(300);
    const sms = await page.locator('main').innerText();
    record('문자: 인력사무소 직영 강점 1줄', sms.includes('인력사무소를 직접 운영'));
    record('문자: 완료 사례 1줄', sms.includes('완료했습니다'));
    await shotAt('05c-sms-strength.png', '견적 안내 문자', -160);
    await page.getByRole('switch', { name: /인력사무소 직영 강점/ }).click();
    await page.waitForTimeout(300);
    const smsOff = await page.locator('main').innerText();
    record('문자: 강점 줄 끄기', !smsOff.includes('인력사무소를 직접 운영'));
    await page.getByRole('switch', { name: /인력사무소 직영 강점/ }).click();
    await page.waitForTimeout(200);

    await shotAt('05-docs.png', '도배·장판 견적서', -110);
    await shotAt('05b-changes.png', '현장 변동 내역', -120);

    // 되돌리기: -10만
    await page.locator('nav button').filter({ hasText: '견적' }).first().click();
    await page.waitForTimeout(800);
    await page.getByText('현장 답사(실측) · 최종 견적 맞추기').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.getByLabel('현장 변동 내용').fill('폐기물 차량 1대 줄임');
    await page.getByLabel('변동 금액').fill('10');
    await page.getByText('- 줄어듦', { exact: false }).first().click();
    await page.getByRole('button', { name: '견적 즉시 업데이트' }).click();
    await page.waitForTimeout(350);
    const decreased = await page.locator('main').innerText();
    record('변동: 감소 반영(349→339)', decreased.includes('339'));

    // 추가했다가 "불필요"로 빼기
    await page.getByText('현장 답사(실측) · 최종 견적 맞추기').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.getByLabel('현장 변동 내용').fill('바닥 미장 필요');
    await page.getByLabel('변동 금액').fill('25');
    await page.getByText('+ 늘어남', { exact: false }).first().click();
    await page.getByRole('button', { name: '견적 즉시 업데이트' }).click();
    await page.waitForTimeout(400);
    const added = await page.locator('main').innerText();
    record('변동: 미장 추가(339→364)', added.includes('364'));

    await page.getByLabel('현장 변동 내용').fill('미장 불필요');
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: '빼기 적용' }).click();
    await page.waitForTimeout(400);
    const cancelled = await page.locator('main').innerText();
    record('변동: "불필요"로 자동 차감(364→339)', cancelled.includes('339') && !cancelled.includes('364'));

    // 되돌리기 → 다시 364
    await page.getByRole('button', { name: /직전 상태로 되돌리기/ }).click();
    await page.waitForTimeout(400);
    const undone = await page.locator('main').innerText();
    record('변동: 되돌리기(339→364)', undone.includes('364'));

    // 목록에서 개별 빼기
    await page.locator('details').filter({ hasText: '변동 내역' }).first().evaluate((el) => (el.open = true));
    await page.waitForTimeout(250);
    await page.getByLabel('바닥 미장 필요 빼기').first().click();
    await page.waitForTimeout(400);
    const removed = await page.locator('main').innerText();
    record('변동: 목록에서 개별 빼기(364→339)', removed.includes('339'));
  });

  // ---------- 나머지 시나리오 ----------
  await step('철거 현장 (374 / 4단계)', async () => {
    await page.getByLabel('장부로 돌아가기').click();
    await page.getByText('안동 풍산읍 15평 상가 원상복구 철거').click();
    await page.getByText('지금 계산된 견적').waitFor();
    const t = await page.locator('main').innerText();
    record('철거: 견적 374만', t.includes('374'));
    record('철거: 점포철거비 지원금 카드', t.includes('폐업 점포철거비 지원금') && t.includes('300'));
    record('철거: 지원금 조건·서류 안내', t.includes('평당 20만원') && t.includes('유상 임차') && t.includes('전자세금계산서'));

    await page.locator('nav button').filter({ hasText: '문서' }).first().click();
    await page.getByText('손님에게 보낼 견적서').waitFor();
    const dt = await page.locator('main').innerText();
    record('철거 문서: 지원금 안내 + 문자', dt.includes('손님이 받을 수 있는 지원금') && dt.includes('지원금 안내 문자 복사'));

    await page.locator('nav button').filter({ hasText: '시공' }).first().click();
    await page.getByText('지금 차례').waitFor();
    const b = await page.locator('main').innerText();
    record('철거: 시공 4단계 · 잔금 차례', b.includes('4단계') && b.includes('준공 검수'));
  });

  await step('주방 현장 (325)', async () => {
    await page.getByLabel('장부로 돌아가기').click();
    await page.getByText('안동 용상동 주방 3.2m 싱크대 교체').click();
    await page.getByText('지금 계산된 견적').waitFor();
    const t = await page.locator('main').innerText();
    record('주방: 견적 450만·인조대리석', t.includes('450') && t.includes('인조대리석'));
  });

  await step('새 현장 자동분류·모달 가림 없음', async () => {
    await page.getByLabel('장부로 돌아가기').click();
    await page.getByRole('button', { name: /새 현장 만들기/ }).click();
    await page.getByText('숨고·카톡·메모를 그대로 넣으세요').waitFor();
    // 모달 본문을 끝까지 스크롤해도 상단 뒤로/닫기가 보여야 한다
    const sheet = page.locator('[role=dialog]').first();
    await sheet.evaluate((el) => {
      const body = el.querySelector('.overflow-y-auto');
      if (body) body.scrollTop = body.scrollHeight;
    });
    await page.waitForTimeout(250);
    const backBox = await page.locator('[role=dialog]').getByLabel('닫기').first().boundingBox();
    const closeBox = await page.locator('[role=dialog]').getByLabel('닫기').last().boundingBox();
    record('모달: 스크롤해도 뒤로/닫기 보임', !!backBox && backBox.y < 200 && !!closeBox && closeBox.y < 200, `y=${Math.round(backBox?.y || -1)}`);
    await shot('12-newcase-modal.png');

    await page.getByLabel('현장 요청 내용').fill('욕실+도배 15평, 엘베 없는 3층');
    await page.getByRole('button', { name: '자동으로 분류' }).click();
    await page.getByText('자동으로 잡았습니다').waitFor({ timeout: 10000 });
    const r = await page.locator('[role=dialog]').innerText();
    record('자동분류: 복합 인테리어 15평', r.includes('복합 인테리어') && r.includes('15평'));
    record('자동분류: 층·엘베', r.includes('3층') && r.includes('없음'));
    await shot('13-auto-classified.png');
    await page.getByRole('button', { name: /이 내용으로 현장 만들기/ }).click();
    await page.getByText('지금 계산된 견적').waitFor();
    const created = await page.locator('body').innerText();
    record('자동분류: 현장 생성', created.includes('복합') && created.includes('15평'));
    await page.getByLabel('장부로 돌아가기').click();
  });

  await step('숨고 스크린샷 OCR', async () => {
    const dir = '/workspace/attachments/2026-11-21';
    const file = path.join(dir, fs.readdirSync(dir).find((f) => f.startsWith('IMG_1430') && f.endsWith('.jpg')));
    await page.getByRole('button', { name: /새 현장 만들기/ }).click();
    await page.locator('input[type=file]').setInputFiles(file);
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: '자동으로 분류' }).click();
    await page.getByText('자동으로 잡았습니다').waitFor({ timeout: 200000 });
    const r = await page.locator('[role=dialog]').innerText();
    record('OCR: 아파트 인테리어 → 복합 15평', r.includes('복합 인테리어') && r.includes('15평'));
    record('OCR: 지역 안동', r.includes('경북 안동시'));
    record('OCR: 바닥 미장 추가', r.includes('바닥 미장'));
    record('OCR: 창호 제외', r.includes('창호') && r.includes('제외'));
    await shot('14-ocr-result.png');
    await page.getByLabel('닫기').click();
    await page.waitForTimeout(300);
  });

  await step('새 현장 만들기', async () => {
    await goHome();
    await page.getByRole('button', { name: /새 현장 만들기/ }).click();
    await page.getByText('숨고·카톡·메모를 그대로 넣으세요').waitFor();
    await page.locator('div.fixed.inset-0').getByText('상가·주택 철거').last().click();
    await page.getByText('지금 계산된 견적').waitFor();
    const header = await page.locator('header').innerText();
    record('새 현장 생성', header.includes('안동'), header.replace(/\n/g, ' '));
  });

  await step('단가표 변경 → 새 견적만 반영', async () => {
    await goHome();
    console.log('  · click 설정');
    await page.getByLabel('설정').click();
    await page.getByText('우리 집 기본 단가표').waitFor();
    console.log('  · fill 철거 기공');
    await page.getByLabel('철거 기공').fill('30');
    await page.getByText('우리 집 기본 단가표').scrollIntoViewIfNeeded();
    await page.waitForTimeout(2800); // 앞선 토스트가 사라진 뒤
    await shot('07-settings-rates.png');
    console.log('  · click 저장하기');
    await page.getByRole('button', { name: '저장하기' }).click();
    await page.waitForTimeout(400);

    // 새 현장 → 바뀐 단가 + 예비비 6% 적용 (15평 철거 기공 30만 → 468만)
    console.log('  · click 새 현장');
    await page.getByRole('button', { name: /새 현장 만들기/ }).click();
    await page.getByText('숨고·카톡·메모를 그대로 넣으세요').waitFor();
    await page.locator('div.fixed.inset-0').getByText('상가·주택 철거').last().click();
    await page.getByText('지금 계산된 견적').waitFor();
    const newText = await page.locator('main').innerText();
    record('단가 변경+예비비: 새 현장 468만', newText.includes('468'), newText.match(/지금 계산된 견적[\s\S]{0,30}/)?.[0]?.replace(/\n/g, ' '));

    await page.waitForTimeout(800);
    const snapshot = await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem('aiSiteManager.v1') || '{}');
      const latest = (st.cases || [])[0];
      return latest?.unitPriceSnapshot?.labor?.demolition ?? null;
    });
    record('단가 변경: 새 현장 스냅샷 저장', snapshot === 30, `labor.demolition=${snapshot}`);

    // 기존 현장은 그대로 374만
    console.log('  · back to home');
    await page.getByLabel('장부로 돌아가기').click();
    await page.getByText('안동 풍산읍 15평 상가 원상복구 철거').click();
    await page.getByText('지금 계산된 견적').waitFor();
    const oldText = await page.locator('main').innerText();
    record('단가 변경: 기존 현장 유지(374만)', oldText.includes('374') && !oldText.includes('468'));
  });

  await step('모바일 가로 스크롤·저장', async () => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    record('모바일: 가로 스크롤 없음', overflow <= 1, `overflow=${overflow}px`);
    const stored = await page.evaluate(() => localStorage.getItem('aiSiteManager.v1'));
    record('저장: LocalStorage', !!stored && stored.length > 500, `${stored ? Math.round(stored.length / 1024) : 0}KB`);
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
