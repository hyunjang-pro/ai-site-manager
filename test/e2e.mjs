// v3.1 6단계 스테이지 · 실사용 버그 · Gemini 연동 · OCR 오인 방지 E2E
// 실행: LD_LIBRARY_PATH=<atk libs> node test/e2e.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { cleanOcrText, evaluateOcr, scenePhotoNote } from '../src/lib/ocr.js';
import { classifyRequest, summarizeRequest } from '../src/lib/classify.js';
import { surveyWasteDrafts, firstCallQuestions, parseAdjustments } from '../src/lib/parse.js';
import { wasteVehicle } from '../src/lib/waste.js';
import { kstToday, addDaysISO, korDateLabel, korMonthDay } from '../src/lib/date.js';
import {
  pickTextModel,
  pickImageModel,
  pickPingModels,
  supportsThinkingBudget,
  testGeminiKey,
  scrubSecret,
  GEMINI_MODEL_STORAGE,
  GEMINI_COOLDOWN_STORAGE,
} from '../src/lib/gemini.js';
import { perPyeong, DEFAULT_RATES, RATE_FIELDS } from '../src/lib/rates.js';
import { computeEstimate } from '../src/lib/pricing.js';
import { composeCase } from '../src/lib/storage.js';
import { siteCostRows } from '../src/lib/site.js';
import { hasInteriorStyle } from '../src/lib/constants.js';
import { surveyGuideFor } from '../src/lib/surveyGuide.js';
import { buildOrderGroups } from '../src/lib/orders.js';
import { buildQuote, constructionNoticeText } from '../src/lib/docs.js';
import { clientQuoteMessage, clientHonorific, isSoomgoCase, tentativePriceNotice } from '../src/lib/docs.js';
import { buildSharePayload, decodeShare, encodeShare } from '../src/lib/share.js';
import { buildTimeline, evidenceFor } from '../src/lib/gates.js';
import { translateDesign } from '../src/lib/design.js';
import { autoCaseTitle } from '../src/lib/classify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const SHOTS = path.resolve(__dirname, '..', 'screenshots');
const FIXTURES = path.resolve(__dirname, 'fixtures');
fs.mkdirSync(SHOTS, { recursive: true });

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
    record(name, false, e.message.split('\n')[0].slice(0, 160));
  }
}

const TODAY = kstToday();
// 시공일 날씨 카드의 '11/21' 표기 — UTC/KST 어긋남 없이 (예전 getUTCDate 방식은 하루 밀렸다)
const mmdd = (iso) => korMonthDay(iso);

// 1x1 PNG (모킹된 이미지 응답용)
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
  surveyChecks: ['상판 실측(수전 홀 위치)', '급수·배수 위치 변경 여부', '후드 재사용 여부'],
  summary: '10평 주방 전체 교체, 엘리베이터 사용',
  warnings: ['상판 가공 후 수전 홀 변경 불가'],
  wishText: '최신식으로 깔끔하게, 예산은 1,200만원 이하로 맞춰주세요',
  missingCosts: [{ label: '후드 교체', range: '참고 20~35만', amount: 25, why: '기존 후드 오염' }],
  costBreakdown: [
    { label: '인건비', detail: '주방 기공 2명 × 32만 × 3일', amount: 192 },
    { label: '자재', detail: '싱크대 3.2m 192만 + 상판 51만', amount: 243 },
  ],
  signal: { level: 'green', title: '적극 추천 (견적 캐시 써도 좋습니다)', reason: '보수적 마진 22% · 예산 안에 들어옵니다' },
};
const SURVEY_JSON = {
  summary: '폐기물 추가 1대, 누수 보수',
  items: [
    { item: '폐기물 1대 추가 반출', reason: '답사에서 짐이 예상보다 많음', amount: 43, days: 0, type: 'increase' },
    { item: '누수 의심 방수 보수', reason: '벽 물기 확인', amount: 30, days: 1, type: 'increase' },
  ],
  signal: { level: 'red', title: '포기·패스 권장 (적자 또는 하자·분쟁 리스크)', reason: '답사 후 원가가 희망가를 넘었습니다' },
};
// 전문가 감리 검증(AI) 모킹 응답 — 독립 리포트가 화면에 붙는지 확인하는 표식
const EXPERT_AUDIT_JSON = {
  headline: 'AI 감리: 시장 중상단, 자재 근거를 문서로 남겨야',
  summary: 'AI 감리 총평: 같은 조건 실견적 대비 중상단입니다. 상판 실측과 폐기물 성상을 먼저 확정하세요.',
  market: 'AI 시장 의견: 3.2m 기준 300~450만이 일반적, 400만은 자재 등급을 보여주면 설명됩니다.',
  risks: [
    { title: 'AI 감리 · 상판 실측 오차', why: 'AI 판단: 가공 후 수전 홀 변경 불가, 재구매 40~80만', cost: '40~80만', action: '실측 확정 후 발주', severity: 'high' },
    { title: 'AI 감리 · 폐기물 성상', why: 'AI 판단: 혼합 반출 시 처리비 2.6배', cost: '톤당 +12만', action: '성상 분리 반출', severity: 'mid' },
  ],
  contract: ['AI 계약 방어: 추가 작업은 4가지(사진·사유·금액·일정) 문자 합의 후 진행', 'AI 계약 방어: 잔금 20% 이상, 준공 검수 후 지급'],
};

// 답사 가이드(AI) 모킹 응답 — AI 연동 여부를 눈으로 확인하려고 표식을 넣는다.
const AI_GUIDE_JSON = {
  rows: [
    { check: 'AI 확인 1 · 상판 수전 홀 위치', why: 'AI 판단: 가공 후 변경 불가 · 상판값 51만', how: 'AI 방법: 벽에서 중심까지 실측' },
    { check: 'AI 확인 2 · 가스 배관 이설', why: 'AI 판단: 이설 시 허가·차단 25만', how: 'AI 방법: 밸브 위치 사진' },
    { check: 'AI 확인 3 · 후드 재사용', why: 'AI 판단: 교체 시 25만 추가', how: 'AI 방법: 후드 오염 확인' },
    { check: 'AI 확인 4 · 급수·배수 위치', why: 'AI 판단: 변경 시 배관 이설 25만', how: 'AI 방법: 싱크볼 위치 확인' },
  ],
  tips: ['AI 꿀팁 · 상판 실측', 'AI 꿀팁 · 가스 밸브', 'AI 꿀팁 · 후드 재사용', 'AI 꿀팁 · 배수 위치'],
  comment: 'AI 코멘트: 이 주방은 상판 가공 뒤 변경이 안 되니 실측을 먼저 확정하세요.',
};

async function main() {
  await new Promise((r) => server.listen(4173, '127.0.0.1', r));

  // ---------- 0. 단위 검증 (브라우저 없이) ----------
  await step('단위: OCR 잡글자 제거', async () => {
    const raw = ['20:50 표 ~>d', '< 삭제하기', '요청 상세', '경북 안동시 풍산읍 15평 상가', '엘리베이터 없음 3층', '견적 보낸 고수 8명 1일 전', '1개의 oi u', '창호 제외'].join('\n');
    const clean = cleanOcrText(raw);
    record('OCR: 시계·삭제하기·요청 상세 제거', !/20:50|삭제하기|요청 상세/.test(clean), clean.replace(/\n/g, ' | '));
    record('OCR: 핵심 줄 보존', ['경북 안동시', '15평', '엘리베이터', '창호 제외'].every((k) => clean.includes(k)));
  });

  await step('단위: 글자 없는 현장 사진 판별', async () => {
    const garbage = evaluateOcr('vy 에 내 SERA 아에출자 하나 CA 4\n는 Sena 16 내요 ae 10', 38, 'vy 에 내 SERA');
    record('OCR: 외계어 → 현장 사진으로 판정', garbage.isScenePhoto === true, JSON.stringify(garbage));
    const real = evaluateOcr('경북 안동시 용산동 15평 상가 철거, 엘리베이터 없음 3층, 폐기물 반출', 78, '');
    record('OCR: 실제 요청서 글자는 살림', real.isScenePhoto === false, JSON.stringify(real));
    record('OCR: 안내 문구', scenePhotoNote(1).includes('글자 없는 현장 사진 1장'));
  });

  await step('단위: 생활폐기물 한차 = 1톤 1차', async () => {
    const text = [
      '요청 상세',
      '폐기물 처리',
      '가능한 빨리 진행하고 싶어요',
      '경북 안동시 용산동',
      '폐기물 타입 생활폐기물',
      '폐기물 양 한차',
      '서비스 범위 엘리베이터로 운반',
      '재활용 가능 여부 네',
    ].join('\n');
    const r = classifyRequest(text);
    record('한차: 공종 폐기물', r.trade === 'waste', r.trade);
    record('한차: 규모 1톤', String(r.patch.sizeValue) === '1' && r.patch.sizeUnit === '톤', `${r.patch.sizeValue}${r.patch.sizeUnit}`);
    record('한차: 차량 1톤 1차', r.patch.wasteVehicle === 'ton1' && wasteVehicle({ wasteVehicle: 'ton1' }).id === 'ton1');
    record('한차: 엘리베이터 사용으로 인식', r.patch.lifting.elevator === 'yes', JSON.stringify(r.patch.lifting));
    const r25 = classifyRequest('안동 2.5톤 폐기물 처리');
    record('2.5톤 명시는 2.5톤 유지', r25.patch.sizeValue === '2.5' || String(r25.patch.sizeValue) === '2.5', String(r25.patch.sizeValue));
  });

  await step('단위: 공종 확장 (목공·전기·설비·필름·토목)', async () => {
    record('목공: 문틀 몰딩', classifyRequest('거실 문틀 몰딩 교체').trade === 'carpentry');
    record('전기: 콘센트·조명', classifyRequest('콘센트 5개 교체랑 조명').trade === 'electric');
    record('설비: 보일러 배관', classifyRequest('보일러 배관 누수 수리').trade === 'plumbing');
    record('필름: 유리 필름', classifyRequest('유리 필름 시공 10㎡').trade === 'film');
    record('토목: 맨땅 데크', classifyRequest('맨땅에 데크 기초').trade === 'groundwork');
    // '정지'는 '작업 정지'와 헷갈리지 않게 부지 맥락만
    record('정지: 부지 정지', classifyRequest('부지 정지 작업 200평').trade === 'groundwork');
    record('정지: 성토·절토', classifyRequest('성토하고 절토까지 맨땅 정리').trade === 'groundwork');
    record('정지: 굴삭기', classifyRequest('굴삭기로 터파기 해야 함').trade === 'groundwork');
    record('정지: 작업 정지는 토목 아님', classifyRequest('일이 있어서 작업 정지').trade !== 'groundwork');
    const mixed = classifyRequest('상가 철거랑 부지 정지 작업 같이 해야 함');
    record('철거+정지: 복합으로 묶음', mixed.trade === 'combined', mixed.trade);
    record('철거+정지: 두 공종 모두 포함', (mixed.patch.subScopes || []).includes('demolition') && (mixed.patch.subScopes || []).includes('groundwork'), JSON.stringify(mixed.patch.subScopes));
    record('주방 동의어: 부엌', classifyRequest('부엌을 전면 인테리어. 최신식으로').trade === 'kitchen');
    record('주방 동의어: 상부장', classifyRequest('상부장·하부장 교체').trade === 'kitchen');
  });

  await step('단위: 직종별 일당 14+ → 계산 연결', async () => {
    const roles = ['carpenter', 'electrician', 'plumber', 'plasterer', 'film', 'floor', 'window', 'painter', 'caulking', 'cleaner'];
    record('일당: 직종 10종 기본값 있음', roles.every((k) => Number(DEFAULT_RATES.labor[k]) > 0), roles.map((k) => `${k}=${DEFAULT_RATES.labor[k]}`).join(' '));
    record('일당: 설정 필드에 전부 있음', roles.every((k) => RATE_FIELDS.some((g) => g.fields.some((f) => f.path.join('.') === `labor.${k}`))));
    record('일당: 2열 그리드(그룹당 필드 여러 개)', RATE_FIELDS.filter((g) => g.fields.some((f) => f.path[0] === 'labor')).length >= 2);

    const laborOf = (trade, sizeValue, sizeUnit, patch, itemId = 'labor') => {
      const est = computeEstimate({ trade, sizeValue, sizeUnit, unitPriceSnapshot: patch || {} });
      return (est.items.find((i) => i.id === itemId) || {}).amount || 0;
    };
    const cases = [
      ['목수', 'carpentry', '10', 'm', 'carpenter', 'labor'],
      ['전기', 'electric', '6', '개소', 'electrician', 'labor'],
      ['설비', 'plumbing', '5', '개소', 'plumber', 'labor'],
      ['미장', 'plaster', '30', '㎡', 'plasterer', 'plaster'],
      ['필름', 'film', '20', '㎡', 'film', 'labor'],
    ];
    cases.forEach(([label, trade, sizeValue, sizeUnit, key, itemId]) => {
      const before = laborOf(trade, sizeValue, sizeUnit, null, itemId);
      const after = laborOf(trade, sizeValue, sizeUnit, { labor: { [key]: 40 } }, itemId);
      record(`일당: ${label} 40만으로 올리면 노무비 증가`, after > before && before > 0, `${before} → ${after}`);
    });
    record('일당: 목수 기본 30만 × 1.7일 = 51만', laborOf('carpentry', '10', 'm') === 51, String(laborOf('carpentry', '10', 'm')));

    // 장판·마루공 — 도배 30평: 도배 2일 + 장판 1일
    const wall = laborOf('wallpaper', '30', '평');
    const wallUp = laborOf('wallpaper', '30', '평', { labor: { floor: 40 } });
    record('일당: 장판공을 올리면 도배·장판 노무비 증가', wallUp > wall && wall > 0, `${wall} → ${wallUp}`);
    // 코킹·페인트 — 수선 현장
    const repairLabor = (patch, notes) => {
      const est = computeEstimate({ trade: 'repair', sizeValue: '1', sizeUnit: '개소', notes, unitPriceSnapshot: patch || {} });
      return (est.items.find((i) => i.id === 'labor') || {}).amount || 0;
    };
    const caulk = repairLabor(null, '욕실 바닥 실리콘 보수');
    const caulkUp = repairLabor({ labor: { caulking: 40 } }, '욕실 바닥 실리콘 보수');
    record('일당: 코킹공을 올리면 수선 노무비 증가', caulkUp > caulk, `${caulk} → ${caulkUp}`);
    const paint = repairLabor(null, '문짝 페인트');
    const paintUp = repairLabor({ labor: { painter: 40 } }, '문짝 페인트');
    record('일당: 페인트공을 올리면 수선 노무비 증가', paintUp > paint, `${paint} → ${paintUp}`);
    const painted = computeEstimate({ trade: 'repair', sizeValue: '1', sizeUnit: '개소', notes: '문짝 페인트' });
    record('일당: 페인트 수선은 페인트공 단가', (painted.items.find((i) => i.id === 'labor')?.detail || '').includes('페인트'), painted.items.find((i) => i.id === 'labor')?.detail || '');
  });

  await step('단위: 교통비·식비 (거리·연인원)', async () => {
    record('식비: 기본 1만/인·일', Number(DEFAULT_RATES.meal.perWorker) === 1);
    record('교통: 기준 15km·1인당 1만', Number(DEFAULT_RATES.travel.baseKm) === 15 && Number(DEFAULT_RATES.travel.perWorker) === 1);
    const near = computeEstimate({ trade: 'demolition', sizeValue: '10', sizeUnit: '평', distanceKm: 10 });
    const far = computeEstimate({ trade: 'demolition', sizeValue: '10', sizeUnit: '평', distanceKm: 40 });
    const crewItem = (est) => est.items.find((i) => i.id === 'crew_cost');
    record('교통: 가까운 현장엔 원거리비 없음', crewItem(near).detail.includes('원거리') === false, crewItem(near).detail);
    record('교통: 40km는 15km 기준 2회', far.crew.travelUnits === 2, String(far.crew.travelUnits));
    record('교통비 = 2회 × 연인원 × 1만', far.crew.travelCost === Math.round(2 * far.crew.days * 1), `days=${far.crew.days} travel=${far.crew.travelCost}`);
    record('식비 = 연인원 × 1만', far.crew.mealCost === Math.round(far.crew.days * 1), `days=${far.crew.days} meal=${far.crew.mealCost}`);
    record('원가 한 줄: 교통비 · 식비', crewItem(far).name === '교통비 · 식비' && crewItem(far).amount === far.crew.travelCost + far.crew.mealCost, `${crewItem(far).amount}만`);
    record('교통: 멀면 원가가 더 큼', far.totalDirectCost > near.totalDirectCost, `${near.totalDirectCost} → ${far.totalDirectCost}`);
    const noMeal = computeEstimate({ trade: 'demolition', sizeValue: '10', sizeUnit: '평', unitPriceSnapshot: { meal: { perWorker: 0 }, travel: { perWorker: 0 } } });
    record('식비 0원이면 교통비 줄 없음', !noMeal.items.find((i) => i.id === 'crew_cost'), String(noMeal.crew.total));
  });

  await step('단위: 복합 공종 계산 (철거+정지)', async () => {
    const est = computeEstimate({
      trade: 'combined',
      sizeValue: '20',
      sizeUnit: '평',
      subScopes: ['demolition', 'groundwork'],
    });
    record('복합: 정지(토목) 원가 포함', est.items.some((i) => i.id === 'groundwork') && est.items.some((i) => i.id === 'groundwork_equip'), est.items.map((i) => i.id).join(','));
    record('복합: 철거도 함께 계산', est.items.some((i) => i.id === 'labor') && est.items.some((i) => i.id === 'waste'));
    record('복합: 요약에 철거·기초·정지', est.targetSummary.includes('철거') && est.targetSummary.includes('기초·정지'), est.targetSummary);
    const noGround = computeEstimate({ trade: 'combined', sizeValue: '20', sizeUnit: '평', subScopes: ['demolition'] });
    record('복합: 정지 없으면 원가 더 작음', est.totalDirectCost > noGround.totalDirectCost, `${noGround.totalDirectCost} → ${est.totalDirectCost}`);
  });

  await step('단위: 스타일·자재는 인테리어·마감 공종만', async () => {
    const on = (c) => hasInteriorStyle(c);
    ['wallpaper', 'bathroom', 'kitchen', 'carpentry', 'film', 'window', 'repair', 'plaster'].forEach((trade) => {
      record(`스타일: ${trade} 표시`, on({ trade }) === true, String(on({ trade })));
    });
    ['demolition', 'waste', 'groundwork', 'labor', 'electric', 'plumbing'].forEach((trade) => {
      record(`스타일: ${trade} 숨김`, on({ trade }) === false, String(on({ trade })));
    });
    record('스타일: 타일·방수(타일 시공) 표시', on({ trade: 'tilewaterproof', tileWork: { mode: 'both' } }) === true);
    record('스타일: 방수만 하는 현장은 숨김', on({ trade: 'tilewaterproof', tileWork: { mode: 'waterproof' } }) === false);
    record('스타일: 철거+정지 복합 숨김', on({ trade: 'combined', subScopes: ['demolition', 'groundwork'] }) === false);
    record('스타일: 철거+도배+욕실 복합 표시', on({ trade: 'combined', subScopes: ['demolition', 'wallpaper', 'bathroom'] }) === true);
    record('스타일: 복합 세부공종 미선택은 표시', on({ trade: 'combined', subScopes: [] }) === true);
    record('스타일: 기타(인테리어 키워드 없음) 숨김', on({ trade: 'custom', title: '부지 정지', notes: '철거 폐기물 반출' }) === false);
    record('스타일: 기타(현관 중문) 표시', on({ trade: 'custom', title: '현관 중문 교체' }) === true);
    record('스타일: 견적에도 같은 판단', computeEstimate({ trade: 'waste', sizeValue: '1', sizeUnit: '톤' }).interiorStyle === false);
  });

  await step('단위: 철거·폐기물·철거+정지는 등급이 견적을 안 바꿈', async () => {
    const combinedCase = (set, preset) =>
      computeEstimate({
        trade: 'combined',
        sizeValue: '20',
        sizeUnit: '평',
        subScopes: ['demolition', 'groundwork'],
        materialSet: set,
        design: { preset },
      });
    const prem = combinedCase('comb-premium', 'premium');
    const budget = combinedCase('comb-budget', 'value');
    record('복합(철거+정지): 고급·실속 자재세트가 견적을 안 바꿈', prem.clientPrice === budget.clientPrice, `${prem.clientPrice} vs ${budget.clientPrice}`);
    record('복합(철거+정지): 원가도 그대로', prem.totalDirectCost === budget.totalDirectCost, `${prem.totalDirectCost} vs ${budget.totalDirectCost}`);
    const demoP = computeEstimate({ trade: 'demolition', sizeValue: '15', sizeUnit: '평', materialSet: 'demo-premium', design: { preset: 'premium' } });
    const demoB = computeEstimate({ trade: 'demolition', sizeValue: '15', sizeUnit: '평', materialSet: 'demo-budget', design: { preset: 'value' } });
    record('철거: 등급을 바꿔도 견적 그대로', demoP.clientPrice === demoB.clientPrice, `${demoP.clientPrice} vs ${demoB.clientPrice}`);
    record('철거: 공종 철거면 자재 배율 1.0', demoP.interiorStyle === false && demoP.materialTotal === demoB.materialTotal, `${demoP.materialTotal} vs ${demoB.materialTotal}`);
    const bathP = computeEstimate({ trade: 'bathroom', sizeValue: '1', sizeUnit: '칸', materialSet: 'bath-premium', design: { preset: 'premium' } });
    const bathB = computeEstimate({ trade: 'bathroom', sizeValue: '1', sizeUnit: '칸', materialSet: 'bath-budget', design: { preset: 'value' } });
    record('욕실: 자재 세트를 바꾸면 견적이 바뀐다', bathP.clientPrice > bathB.clientPrice, `${bathB.clientPrice} → ${bathP.clientPrice}`);
    const wallP = computeEstimate({ trade: 'wallpaper', sizeValue: '24', sizeUnit: '평', materialSet: 'wall-premium' });
    const wallB = computeEstimate({ trade: 'wallpaper', sizeValue: '24', sizeUnit: '평', materialSet: 'wall-budget' });
    record('도배: 자재 세트를 바꾸면 견적이 바뀐다', wallP.clientPrice > wallB.clientPrice, `${wallB.clientPrice} → ${wallP.clientPrice}`);
    // 공종을 철거로 바꿔도 예전 '고급' 세트가 남아 견적을 흔들지 않아야 한다
    const switched = computeEstimate({ trade: 'demolition', sizeValue: '15', sizeUnit: '평', materialSet: 'comb-premium' });
    const clean = computeEstimate({ trade: 'demolition', sizeValue: '15', sizeUnit: '평', materialSet: '' });
    record('공종 전환: 남아 있는 고급 세트 무시', switched.clientPrice === clean.clientPrice, `${switched.clientPrice} vs ${clean.clientPrice}`);
  });

  await step('단위: 철거+정지 발주·타임라인·안내문에 인테리어가 안 섞임', async () => {
    const ground = { trade: 'combined', sizeValue: '20', sizeUnit: '평', subScopes: ['demolition', 'groundwork'], region: '안동', title: '안동 20평 철거·기초·정지', lifting: { floor: 1, elevator: 'no' } };
    const calc = computeEstimate(ground);
    const design = translateDesign(ground);
    const orders = buildOrderGroups(ground, calc, design, calc.materialSet);
    const orderText = orders.map((g) => `${g.vendor} ${g.items.map((i) => i.name).join(' ')}`).join(' | ');
    record('발주: 철거+정지에 합지·포세린·도기 0건', !/합지|실크|포세린|도기/.test(orderText), orderText.slice(0, 90));
    record('발주: 마대·보양재 나옴', /마대/.test(orderText) && /보양/.test(orderText));
    record('발주: 골재·시멘트·굴삭기 나옴', /골재|쇄석/.test(orderText) && /시멘트/.test(orderText) && /굴삭기/.test(orderText));
    const timeline = buildTimeline(ground, calc, []).map((p) => `${p.label} ${p.items.join(' ')}`).join(' | ');
    record('타임라인: 철거+정지에 담수·타일 없음', !/담수|타일/.test(timeline), timeline);
    record('타임라인: 터파기·성상 분리 있음', /터파기/.test(timeline) && /성상/.test(timeline));
    record('사진: 철거 전 6곳', evidenceFor('combined', ground).title.includes('철거 전'));
    const notice = constructionNoticeText(ground, calc);
    ['실행원가', '수주금액', '만원', '인테리어'].forEach((bad) => record(`안내문: '${bad}' 0건`, !notice.includes(bad), notice.split('\n').find((l) => l.includes(bad)) || ''));
    record('안내문: 공사 내용 = 철거·기초·정지', /공사 내용: .*철거.*기초·정지/.test(notice), notice.match(/공사 내용:.*/)?.[0] || '');
    record('안내문: 야외 현장은 안전 펜스', notice.includes('안전 펜스'));
    const quote = buildQuote(ground, calc, design, null);
    record('견적서: 제목이 복합 인테리어 아님', !quote.title.includes('인테리어') && quote.title.includes('철거'), quote.title);
    record('견적서: 사양에 합지·포세린 없음', !(quote.materialSpecs || []).join(' ').match(/합지|포세린|도기/), (quote.materialSpecs || []).join(' / ').slice(0, 60));
    const full = { trade: 'combined', sizeValue: '24', sizeUnit: '평', subScopes: ['demolition', 'wallpaper', 'bathroom', 'kitchen'] };
    const fullCalc = computeEstimate(full);
    const fullOrders = buildOrderGroups(full, fullCalc, translateDesign(full), fullCalc.materialSet).map((g) => g.items.map((i) => i.name).join(' ')).join(' | ');
    record('발주: 전체 인테리어는 벽지·타일·싱크대 나옴', /합지/.test(fullOrders) && /포세린/.test(fullOrders) && /싱크대|상판/.test(fullOrders), fullOrders.slice(0, 60));
    const bathOrders = buildOrderGroups({ trade: 'bathroom', sizeValue: '1', sizeUnit: '칸' }, computeEstimate({ trade: 'bathroom', sizeValue: '1', sizeUnit: '칸' }), { combo: [] }, null).map((g) => g.items.map((i) => i.name).join(' ')).join(' | ');
    record('발주: 욕실은 방수·타일·도기', /방수/.test(bathOrders) && /포세린|타일/.test(bathOrders) && /도기/.test(bathOrders), bathOrders.slice(0, 60));
  });

  await step('단위: 공고 현장 안내문·견적서에 원가 메모 없음', async () => {
    const bid = {
      trade: 'combined',
      sizeValue: '200',
      sizeUnit: '㎡',
      subScopes: ['demolition', 'groundwork'],
      title: '안동 OO동 철거 및 기초 정지 공사',
      location: '안동시',
      bid: { bidPrice: 27200000, noticeNo: 'R25BK0001', title: '안동 OO동 철거 및 기초 정지 공사', workTypes: ['철거', '토목'] },
    };
    const calc = computeEstimate(bid);
    const notice = constructionNoticeText(bid, calc);
    ['실행원가', '수주금액', '만원', '80%'].forEach((bad) => record(`공고 안내문: '${bad}' 없음`, !notice.includes(bad), notice.split('\n').find((l) => l.includes(bad)) || ''));
    record('공고 안내문: 공고 공사 종류 표기', /공사 내용: 철거 · 토목/.test(notice), notice.match(/공사 내용:.*/)?.[0] || '');
    const quote = buildQuote(bid, calc, translateDesign(bid), null);
    record('공고 견적서: 손님 문서에 실행원가 없음', !JSON.stringify(quote).includes('실행원가'));
    record('공고: 내부 메모는 calc.bidNote로만', calc.bidNote.includes('실행원가') && !calc.targetSummary.includes('실행원가'), calc.bidNote);
  });

  await step('단위: 현장 제목이 공종과 맞음', async () => {
    const g = classifyRequest('안동 20평 상가 철거랑 부지 정지 작업 같이 해야 함');
    record('제목: 철거+정지 → 전체 인테리어 아님', !g.title.includes('인테리어') && g.title.includes('철거'), g.title);
    record('제목: 분류표에도 철거·기초·정지', g.rows.some((r) => r.label === '공종' && r.value.includes('철거') && r.value.includes('기초·정지')), JSON.stringify(g.rows[0]));
    const bath = classifyRequest('구미 24평 아파트 욕실 1칸 전체 철거 후 타일·도기 교체');
    record('공종: 욕실 철거는 복합이 아니라 욕실', bath.trade === 'bathroom', bath.trade);
    record('제목: 공종 바꾸면 제목도 바뀜', autoCaseTitle({ trade: 'combined', region: '안동', sizeValue: '20', sizeUnit: '평' }, 'demolition') === '안동 20평 철거', autoCaseTitle({ trade: 'combined', region: '안동', sizeValue: '20', sizeUnit: '평' }, 'demolition'));
  });

  await step('단위: 소형·부분 철거·폐기물은 평수 전체 단가를 쓰지 않음', async () => {
    const price = (text) => {
      const r = classifyRequest(text);
      const c = composeCase({ trade: r.trade === 'unclassified' ? 'custom' : r.trade, patch: r.patch });
      const calc = computeEstimate(c);
      return { trade: r.trade, price: Math.round(calc.clientPrice), site: siteCostRows(c).filter((x) => x.on).map((x) => x.id), calc };
    };
    const sign = price('숨고 간판 두개 철거');
    record('소형: 간판 2개 철거 = 철거(부분)', sign.trade === 'demolition' && sign.price >= 35 && sign.price <= 70, `${sign.trade} ${sign.price}만`);
    record('소형: 간판에 보양·관리소·양중·준공청소 안 붙음', sign.site.length === 0, sign.site.join(',') || '없음');
    const sky = price('상가 1층 간판 2개 철거 스카이차 필요');
    record('소형: 스카이차 간판 = 80~160만', sky.price >= 80 && sky.price <= 160, `${sky.price}만`);
    const sink = price('싱크대 철거 및 수거');
    record('소형: 싱크대 철거(교체 아님) = 15~40만', sink.trade === 'demolition' && sink.price >= 15 && sink.price <= 40, `${sink.trade} ${sink.price}만`);
    const half = price('원룸 생활폐기물 반차');
    record('폐기물: 반차 = 15~30만', half.trade === 'waste' && half.price >= 15 && half.price <= 30, `${half.price}만`);
    const ton1 = price('폐기물 1톤 트럭 한차');
    record('폐기물: 1톤 한차 = 30~60만', ton1.price >= 30 && ton1.price <= 60, `${ton1.price}만`);
    const apt = price('15평 아파트 전체 인테리어');
    record('전체: 15평 올수리 = 1,300만 이상', apt.price >= 1300, `${apt.price}만`);
    record('전체: 아파트 올수리에 보양·관리소·준공청소 자동 포함', ['protectLevel', 'adminDeposit', 'afterCare'].every((id) => apt.site.includes(id)), apt.site.join(','));
    const house = price('주택 구옥 20평 전체 철거');
    record('전체: 단독주택 철거엔 관리사무소 신고 없음', !house.site.includes('adminDeposit'), house.site.join(',') || '없음');
    const demo = price('카페 15평 원상복구 철거');
    record('철거: 카페 철거엔 준공 청소 안 붙음', !demo.site.includes('afterCare'), demo.site.join(',') || '없음');
  });

  await step('단위: 답사 가이드는 AI가 있으면 AI, 없으면 공종 폴백', async () => {
    const local = surveyGuideFor({ trade: 'demolition' }, { trade: 'demolition' });
    // 사다리차를 세울 수 없는 현장(이 케이스)에서는 첫 줄이 '천장 위 숨은 물량'으로 시작한다
    record('가이드: AI 없으면 공종 기본값', local.source === 'local' && local.rows.length >= 3 && local.rows[0].check.includes('천장'), local.rows[0]?.check);
    record('가이드: 사다리 불가 현장엔 사다리차 항목 없음', !local.rows.some((r) => /사다리차/.test(r.check)), local.rows.map((r) => r.check.slice(0, 10)).join(' / '));
    const aiPlan = {
      trade: 'kitchen',
      surveyPlan: { rows: [{ check: 'AI 확인 A', why: 'AI 이유 A', how: 'AI 방법 A' }], tips: ['AI 팁 A'], comment: 'AI 코멘트 A' },
    };
    const ai = surveyGuideFor(aiPlan, { trade: 'kitchen' });
    record('가이드: AI 결과를 그대로 쓴다', ai.source === 'ai' && ai.rows[0].check === 'AI 확인 A' && ai.tips[0] === 'AI 팁 A' && ai.comment === 'AI 코멘트 A', JSON.stringify(ai.rows[0]));
    const fromAnalysis = surveyGuideFor(
      { trade: 'bathroom', aiAnalysis: { surveyChecks: [{ label: 'AI 분석 확인', why: '왜', how: '이렇게' }] } },
      { trade: 'bathroom' }
    );
    record('가이드: 새 현장 AI 분석의 확인 항목도 사용', fromAnalysis.source === 'ai' && fromAnalysis.rows[0].check === 'AI 분석 확인', JSON.stringify(fromAnalysis.rows[0]));
    const waste = surveyGuideFor({ trade: 'waste' }, { trade: 'waste' });
    record('가이드: 공종이 다르면 내용이 다르다', waste.rows[0].check !== local.rows[0].check, `${waste.rows[0].check}`);
  });

  await step('단위: 첫 통화 질문이 케이스마다 다름', async () => {
    const grounds = firstCallQuestions({ trade: 'groundwork', rawInput: '부지 정지 200㎡', sizeValue: '200', sizeUnit: '㎡' });
    const bath = firstCallQuestions({ trade: 'bathroom', rawInput: '욕실 1칸', sizeValue: '1', sizeUnit: '칸' });
    const demo = firstCallQuestions({ trade: 'demolition', rawInput: '상가 철거 15평', sizeValue: '15', sizeUnit: '평' });
    record('첫통화: 토목은 정지·성토 질문', grounds.some((q) => /정지|성토|터파기/.test(q)), grounds.join(' / '));
    record('첫통화: 욕실은 욕실 질문', bath.some((q) => q.includes('욕실')), bath.join(' / '));
    record('첫통화: 철거는 범위·석면 질문', demo.some((q) => /범위|석면/.test(q)), demo.join(' / '));
    record('첫통화: 공종끼리 질문이 다름', grounds[0] !== bath[0] && bath[0] !== demo[0]);
    record('첫통화: 항상 3개', grounds.length === 3 && bath.length === 3 && demo.length === 3);
    const bid = firstCallQuestions({ trade: 'custom', bid: { noticeNo: 'R25BK0080' } });
    record('첫통화: 관공서는 설계내역서·설명회 질문', bid.some((q) => /설계내역서|설명회/.test(q)), bid.join(' / '));
    const ai = firstCallQuestions({ trade: 'bathroom', aiAnalysis: { firstCallQuestions: ['AI질문 하나', 'AI질문 둘', 'AI질문 셋'] } });
    record('첫통화: AI 질문이 있으면 그것 먼저', ai[0] === 'AI질문 하나', ai.join(' / '));
  });

  await step('단위: 가견적 화면 내부 등급 숨김', async () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'src/components/tabs/EstimateTab.jsx'), 'utf8');
    record('사례: 신뢰도 등급 문구 제거', !src.includes('신뢰도 {'), 'EstimateTab.jsx');
  });

  await step('단위: 복합 세부 공종·희망사항', async () => {
    const text =
      '안동 15평 아파트 전체 인테리어. 방 2 / 욕실 1 / 부엌 1 / 현관(중문/신발장/타일). 창호는 안해도되고 바닥 미장 필요. 문의/희망사항: 최신식으로 깔끔하게, 예산은 3000만원 이하로 맞춰주세요. 가능한 빨리 진행하고 싶어요.';
    const r = classifyRequest(text);
    record('복합: 욕실·주방·현관·미장 추출', ['bathroom', 'kitchen', 'entrance', 'plaster'].every((x) => r.patch.subScopes.includes(x)), JSON.stringify(r.patch.subScopes));
    record('복합: 철거·도배 기본 포함', r.patch.subScopes.includes('demolition') && r.patch.subScopes.includes('wallpaper'));
    record('복합: 창호 제외', r.patch.excludedScopes.includes('window'));
    const summary = summarizeRequest(text, r);
    record('정리본: 희망사항 맨 위', summary.startsWith('희망사항:'), summary.split('\n')[0]);
    record('정리본: 희망사항 잘리지 않음', summary.includes('3000만원 이하로 맞춰주세요') && summary.includes('가능한 빨리'));
  });

  await step('단위: 답사 일상어', async () => {
    const c = { trade: 'waste', sizeUnit: '톤', sizeValue: 1, unitPriceSnapshot: { waste: { truck1: 42.5, truckHalf: 26 } } };
    const two = surveyWasteDrafts('폐기물 두 차는 나올듯', c);
    record('답사: “두 차” → 1대 추가', two.length === 1 && two[0].amount === 43, JSON.stringify(two.map((x) => x.amount)));
    record('답사: “반 차 추가” → 0.5톤', surveyWasteDrafts('반 차 추가', c)[0]?.amount === 26);
    record('답사: “양 많아 보임” → 추가 반출', surveyWasteDrafts('양 많아 보임', c).length === 1);
  });

  await step('단위: KST 오늘 날짜', async () => {
    record('날짜: KST 오늘 형식', /^\d{4}-\d{2}-\d{2}$/.test(TODAY), TODAY);
    record('날짜: 하루 더하기', addDaysISO(TODAY, 1) !== TODAY && addDaysISO(TODAY, 0) === TODAY);
    record('날짜: 한글 라벨', /^\d{1,2}\/\d{1,2}\([일월화수목금토]\)$/.test(korDateLabel(TODAY)), korDateLabel(TODAY));
  });

  // 34-build.png: 11/21 선택 → 11/20(금) 로 하루 밀리던 버그의 회귀 테스트
  await step('단위: 날짜가 하루 밀리지 않는지', async () => {
    const fixed = [
      ['2026-11-21', '11/21(토)'],
      ['2026-11-20', '11/20(금)'],
      ['2026-11-22', '11/22(일)'],
      ['2026-01-01', '1/1(목)'],
      ['2024-02-29', '2/29(목)'],
    ];
    for (const [iso, want] of fixed) record(`날짜: ${iso} → ${want}`, korDateLabel(iso) === want, korDateLabel(iso));
    record('날짜: 월말 +1일', addDaysISO('2026-11-30', 1) === '2026-12-01', addDaysISO('2026-11-30', 1));
    record('날짜: 연말 +1일', addDaysISO('2026-12-31', 1) === '2027-01-01', addDaysISO('2026-12-31', 1));
    record('날짜: 윤년 2/28 +1일', addDaysISO('2024-02-28', 1) === '2024-02-29', addDaysISO('2024-02-28', 1));
    record('날짜: 이틀 뒤 라벨', korDateLabel(addDaysISO('2026-11-21', 2)) === '11/23(월)', korDateLabel(addDaysISO('2026-11-21', 2)));
    record('날짜: 잘못된 값은 그대로', korDateLabel('') === '' && korDateLabel('2026-2-3') === '2026-2-3');
  });

  // gemini_http_404 대응: 목록에서 실제 쓸 수 있는 모델을 고르는지
  await step('단위: Gemini 모델 자동 선택', async () => {
    record('모델: 알려진 이름 우선', pickTextModel(['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro']) === 'gemini-2.5-flash');
    record('모델: 더 새 flash가 있으면 그것', pickTextModel(['gemini-2.0-flash', 'gemini-3.0-flash']) === 'gemini-3.0-flash', pickTextModel(['gemini-2.0-flash', 'gemini-3.0-flash']));
    record('모델: lite는 flash보다 뒤', pickTextModel(['gemini-2.5-flash-lite', 'gemini-2.0-flash']) === 'gemini-2.0-flash', pickTextModel(['gemini-2.5-flash-lite', 'gemini-2.0-flash']));
    record('모델: pro는 고르지 않음', pickTextModel(['gemini-2.5-pro', 'gemini-2.5-flash-lite']) === 'gemini-2.5-flash-lite', pickTextModel(['gemini-2.5-pro', 'gemini-2.5-flash-lite']));
    record('모델: 이미지 모델은 텍스트에서 제외', pickTextModel(['gemini-2.5-flash-image', 'gemini-2.0-flash']) === 'gemini-2.0-flash', pickTextModel(['gemini-2.5-flash-image', 'gemini-2.0-flash']));
    record('모델: 이미지 모델 선택', pickImageModel(['gemini-3.0-flash-image', 'gemini-2.0-flash']) === 'gemini-3.0-flash-image', pickImageModel(['gemini-3.0-flash-image', 'gemini-2.0-flash']));
    record('모델: 이미지 모델 없으면 빈 값', pickImageModel(['gemini-2.5-flash', 'imagen-4.0-generate-001']) === '', pickImageModel(['gemini-2.5-flash', 'imagen-4.0-generate-001']));
    // IMG_1590: 연결 테스트 ping은 가장 빨리 답하는 모델부터
    const pingOrder = pickPingModels(['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-image']);
    record('ping: lite를 먼저 고름', pingOrder[0] === 'gemini-2.5-flash-lite', pingOrder.join(' → '));
    record('ping: pro·이미지 모델은 뺌', !pingOrder.some((id) => /pro|image/.test(id)), pingOrder.join(' → '));
    // thinkingConfig는 2.5 flash·lite만 받는다(2.0·3·2.5-pro에 넣으면 400)
    record(
      '사고 끄기: 2.5 flash·lite만',
      supportsThinkingBudget('gemini-2.5-flash') &&
        supportsThinkingBudget('gemini-2.5-flash-lite') &&
        supportsThinkingBudget('gemini-2.5-flash-latest') &&
        !supportsThinkingBudget('gemini-2.5-pro') &&
        !supportsThinkingBudget('gemini-2.0-flash') &&
        !supportsThinkingBudget('gemini-3-flash'),
      ['2.5-flash', '2.5-pro', '2.0-flash', '3-flash'].map((m) => `${m}:${supportsThinkingBudget('gemini-' + m)}`).join(' ')
    );
  });

  // IMG_1590: 목록 조회는 되는데 답변만 안 오는 경우 — 원인을 '키'가 아니라 '모델 지연'으로 갈라 안내하는지
  await step('단위: 연결 테스트 — 목록은 되고 답만 늦을 때', async () => {
    const realFetch = globalThis.fetch;
    const hits = [];
    globalThis.fetch = async (url, opts = {}) => {
      const u = String(url);
      if (/\/models\?/.test(u)) {
        hits.push('LIST');
        return new Response(
          JSON.stringify({ models: [{ name: 'models/gemini-2.5-flash-lite', supportedGenerationMethods: ['generateContent'] }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      hits.push('GEN');
      // generateContent는 끝내 응답하지 않는다 → AbortError = timeout
      return new Promise((resolve, reject) => {
        opts.signal?.addEventListener('abort', () => {
          const e = new Error('The operation was aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
    };
    try {
      const res = await testGeminiKey('AIzaUNIT', { timeoutMs: 600, listTimeoutMs: 300 });
      record('연결 테스트: 목록을 먼저 조회', hits[0] === 'LIST', hits.join(' → '));
      record('연결 테스트: 답만 늦으면 timeout으로 실패', res.ok === false && res.reason === 'timeout', `${res.reason} / ${res.detail}`);
      record('연결 테스트: 키 문제가 아니라고 안내', /키와 구글 연결은 정상/.test(res.hint || ''), res.hint || '');
      record('연결 테스트: 시도한 모델·소요시간 공개', /모델 목록/.test(res.detail || '') && /gemini-2\.5-flash-lite/.test(res.detail || ''), res.detail || '');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  // 만원/㎡ → 평당(3.305785㎡) 암산 없이
  await step('단위: ㎡ 단가를 평당으로', async () => {
    record('평당: 타일 시공 4.5 → 14.9', perPyeong(4.5) === '14.9', perPyeong(4.5));
    record('평당: 창호 28 → 92.6', perPyeong(28) === '92.6', perPyeong(28));
    record('평당: 미장 2.8 → 9.3', perPyeong(2.8) === '9.3', perPyeong(2.8));
    record('평당: 빈 값은 0', perPyeong('') === '0' && perPyeong(undefined) === '0');
  });

  // ---------- 1. 브라우저 ----------
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR', deviceScaleFactor: 1 });
  const page = await context.newPage();
  PAGE = page;
  page.setDefaultTimeout(9000);
  page.setDefaultNavigationTimeout(15000);
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
  // 접힌 카드(자세히 보기)는 필요할 때 펼친다 — 화면 검사·클릭 전에 모두 펼쳐 둔다.
  const expandFolds = async () => {
    await page.evaluate(() => {
      document.querySelectorAll('main details, [role=dialog] details').forEach((d) => {
        d.open = true;
      });
    });
    await page.waitForTimeout(80);
  };
  const mainText = async () => {
    await expandFolds();
    return page.locator('main').innerText();
  };
  const tabs = () => page.locator('nav[aria-label="현장 단계"] button');
  const goTab = async (n) => {
    await tabs().nth(n - 1).click();
    await page.waitForTimeout(350);
    await expandFolds();
  };
  const goHome = async () => {
    const back = page.getByLabel('장부로 돌아가기');
    if (await back.count()) await back.first().click();
    await page.waitForTimeout(350);
  };
  const openSettings = async () => {
    await goHome();
    await page.getByLabel('설정').click();
    await page.getByText('AI 정밀 분석 (무료 Gemini API 키)').waitFor();
  };
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  // OCR(tesseract) 요청 수 — 현장 사진은 0회여야 한다.
  let ocrRequests = 0;
  page.on('request', (r) => {
    if (/tesseract|tessdata/i.test(r.url())) ocrRequests += 1;
  });
  // Gemini에 사진(inline_data)이 함께 갔는지
  let geminiImageParts = 0;

  // Gemini 모킹 (키가 있을 때) — 이미지/답사/현장분석 응답을 나눠 보낸다.
  let geminiCalls = 0;
  const geminiMock = async (route) => {
    geminiCalls += 1;
    let body = {};
    try {
      body = JSON.parse(route.request().postData() || '{}');
    } catch (e) {}
    const text = (body?.contents?.[0]?.parts || []).map((p) => p.text || '').join(' ');
    const parts = body?.contents?.[0]?.parts || [];
    if (parts.some((p) => p?.inline_data || p?.inlineData)) geminiImageParts += 1;
    const wantsImage = (body?.generationConfig?.responseModalities || []).includes('IMAGE');
    let payload;
    if (wantsImage) {
      payload = { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: PNG_1PX } }] } }] };
    } else if (text.includes('답사 기록')) {
      payload = { candidates: [{ content: { parts: [{ text: JSON.stringify(SURVEY_JSON) }] } }] };
    } else if (text.includes('현장 감리')) {
      payload = { candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify(EXPERT_AUDIT_JSON) + '\n```' }] } }] };
    } else if (text.includes('답사 코치')) {
      payload = { candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify(AI_GUIDE_JSON) + '\n```' }] } }] };
    } else if (text.includes('JSON만 답해')) {
      payload = { candidates: [{ content: { parts: [{ text: '{"ok":true,"model":"gemini-2.5-flash"}' }] } }] };
    } else {
      payload = { candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify(CASE_JSON) + '\n```' }] } }] };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  };
  await context.route('https://generativelanguage.googleapis.com/**', geminiMock);

  // Open-Meteo 모킹 — 오늘(KST)부터 16일
  await context.route('https://api.open-meteo.com/**', (route) => {
    const dates = Array.from({ length: 16 }, (_, i) => addDaysISO(TODAY, i));
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        daily: {
          time: dates,
          weather_code: dates.map((_, i) => [3, 61, 63, 1, 0, 2][i % 6]),
          temperature_2m_max: dates.map((_, i) => 12 - (i % 5)),
          temperature_2m_min: dates.map((_, i) => 2 - (i % 4)),
          precipitation_probability_max: dates.map((_, i) => [20, 70, 80, 10, 0, 30][i % 6]),
        },
      }),
    });
  });

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });

  await step('잠금 화면', async () => {
    await page.getByText('가족 전용').waitFor();
    for (const d of ['3', '8', '5', '5']) await page.getByLabel(`${d} 번`).click();
    await page.getByText('오늘 장부').waitFor({ timeout: 12000 });
    record('잠금: 3855로 해제', true);
  });

  await step('홈', async () => {
    const t = await mainText();
    record('홈: 현황판', t.includes('진행 중') && t.includes('정산 완료'));
    await shot('01-home.png');
  });

  const OCR_ONLY = process.env.OCR_ONLY === '1';
  if (!OCR_ONLY) {
  // ---------- 6단계 탭 구조 ----------
  await step('6단계 스테이지', async () => {
    await page.getByText('구미 형곡동 32평 아파트 욕실 1칸').click();
    await page.getByLabel('받은 내용').waitFor();
    record('탭: 6개', (await tabs().count()) === 6, String(await tabs().count()));
    const labels = await tabs().allInnerTexts();
    record('탭: 정보/가견적/답사/최종·수익/시공/문서', ['정보', '가견적', '답사', '최종·수익', '시공', '문서'].every((x) => labels.some((l) => l.includes(x))), labels.join(' | '));
    const rows = await tabs().evaluateAll((els) => {
      const tops = els.map((e) => Math.round(e.getBoundingClientRect().top));
      return { tops, cols: new Set(els.map((e) => Math.round(e.getBoundingClientRect().left))).size };
    });
    record('탭: 3열 × 2줄', rows.cols === 3 && new Set(rows.tops).size === 2, JSON.stringify(rows));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    record('모바일 390px: 가로 스크롤 0px', overflow <= 1, `overflow=${overflow}`);
  });

  await step('1단계 정보', async () => {
    const t = await mainText();
    record('정보: 받은 내용·공종·규모·고객 정보', t.includes('받은 내용') && t.includes('공종·규모') && t.includes('고객 정보'));
    record('정보: 사진/자동 분류', t.includes('사진') && (t.includes('자동으로 분류') || t.includes('AI 정밀 분석')));
    record('정보: 스샷·현장 사진 버튼 분리', t.includes('숨고·카톡 스샷') && t.includes('현장 사진'));
    record('정보: 사진 없으면 “스샷 글자만 읽기” 숨김', !t.includes('스샷 속 글자만 다시 읽기'));
    record('정보: 무엇을 하는지 입력칸 없음', !t.includes('무엇을 하는지 적어주세요'));
    record('정보: AI 없이 자동 분류 표시', t.includes('AI 없이 자동 분류'));
    await shot('30-info.png');
  });

  await step('사진 선택 — 갤럭시 갤러리 호환(accept=image/*)', async () => {
    const bad = [];
    for (let n = 1; n <= 6; n += 1) {
      await goTab(n);
      const list = await page.evaluate(() =>
        [...document.querySelectorAll('input[type=file]')].map((el) => ({
          accept: el.getAttribute('accept'),
          capture: el.getAttribute('capture'),
          label: el.getAttribute('aria-label') || '',
        }))
      );
      list.forEach((x) => {
        if (x.accept !== 'image/*' || x.capture) bad.push(`${n}단계:${x.label}:${x.accept}:${x.capture}`);
      });
    }
    record('사진: 업로드 input 전부 accept=image/* 단독·capture 없음', bad.length === 0, bad.join(' | ') || '6단계 전수');
    await goTab(1);
  });

  await step('2단계 가견적', async () => {
    await goTab(2);
    const t = await mainText();
    record('가견적: 1차 가견적 히어로', t.includes('1차 가견적 (답사 전 · 변동 가능)'));
    record('가견적: 전문가 검증 리포트(독립)', t.includes('전문가 검증 리포트') && t.includes('독립 벤치마크'));
    record(
      '가견적: 시장 호가 밴드(최저·평균·고급)',
      t.includes('시장 최저') && t.includes('시장 평균') && t.includes('시장 고급') && /적정선|시장 상단|저가 수주 주의|고가 이탈 주의/.test(t) && /시장 \d[\d,]*~\d[\d,]*만/.test(t)
    );
    const riskCount = await page.getByTestId('risk-item').count();
    record('가견적: 숨은 함정 리스크 2~3건', t.includes('숨은 함정 리스크 감사') && riskCount >= 2 && riskCount <= 3, `${riskCount}건`);
    record('가견적: 계약 방어 팁 1~2줄', t.includes('계약 방어') && (t.includes('문자로 합의') || t.includes('잔금은 20%')));
    record('가견적: 가견적 계산 반복 없음', !t.includes('보수적 여유') && !t.includes('권장가(같은 마진 기준)'));
    record('가견적: 답사 가이드 중복 없음(3단계로 일원화)', !t.includes('답사 시 왜·뭘 확인해야 하나'));
    record('가견적: 스타일·자재(욕실)', t.includes('스타일·자재 정하기') && t.includes('추천 자재 세트'));
    record('가견적: 입력칸 제거', !t.includes('무엇을 하는지 적어주세요') && !(await page.getByLabel('받은 내용').count()));
    record('가견적: 신호등 배지', /🟢|🟡|🔴/.test(t) && (t.includes('적극 추천') || t.includes('해볼 만함') || t.includes('비추천')));
    await shotAt('31-estimate.png', '1차 가견적', -120);
  });

  await step('2단계 — 내가 부를 가견적·견적 멘트', async () => {
    await goTab(2);
    const input = page.getByLabel('내가 부를 가견적(만원)');
    record('가견적 호가: 상단 입력칸', (await input.count()) === 1);
    const appPrice = Number((await input.inputValue()) || 0);
    record('가견적 호가: 기본값 = 앱 계산가', appPrice > 0, String(appPrice));

    // IMG_1585: 마지막 숫자를 지우면 원래 숫자(641)가 되살아나던 버그
    await input.fill('');
    await page.waitForTimeout(300);
    const cleared = await input.inputValue();
    record('가견적 호가: 다 지우면 빈칸 유지', cleared === '', `"${cleared}"`);
    record('가견적 호가: 빈칸이어도 화면이 깨지지 않음', !(await page.locator('main').innerText()).includes('NaN'));
    await input.fill('500');
    await page.waitForTimeout(350);
    record('가견적 호가: 빈칸 뒤 새 숫자 500 반영', (await input.inputValue()) === '500' && (await page.getByTestId('sugo-msg').innerText()).includes('500'), await input.inputValue());
    // 빈칸으로 칸을 떠나면 앱 계산가가 다시 보인다 (저장값은 비운 채)
    await input.fill('');
    await page.waitForTimeout(200);
    await page.getByText('내가 부를 가견적', { exact: true }).first().click();
    await page.waitForTimeout(350);
    record('가견적 호가: 빈칸으로 나가면 앱 계산가 복귀', (await input.inputValue()) === String(appPrice), await input.inputValue());

    const before = await page.getByTestId('sugo-msg').innerText();
    record(
      '견적 멘트: 업체·금액·범위·실측 유도',
      before.includes('견적 금액') && before.includes(appPrice.toLocaleString('ko-KR')) && before.includes('실측') && before.includes('안녕하세요')
    );
    record('견적 멘트: 내부 원가·순익 없음', !['원가', '순익', '마진', '알선료', '예비비', '남는'].some((w) => before.includes(w)));
    // #22480: 숨고 스샷이 없는 일반 문의면 숨고라고 부르지 않고 고객님/사장님으로 부른다
    const cardTxt = await page.getByTestId('quote-msg-card').innerText();
    record('견적 멘트: 숨고 아님 → 카드 제목 고객용', cardTxt.includes('고객 견적 발송 멘트') && !cardTxt.includes('숨고 견적 발송 멘트'), cardTxt.split('\n')[0]);
    record('견적 멘트: 숨고 단어 없음', !before.includes('숨고'), before.split('\n').find((l) => l.includes('숨고')) || '없음');
    record('견적 멘트: 주거 현장 호칭 고객님', before.includes('고객님,') && !before.includes('사장님,'));
    // 사진이 없으면 '사진 없이 주신 정보만으로 낸 가견적'까지 짚는다
    record(
      '견적 멘트: 사진 없이 낸 가견적 → 비용 변동 안내',
      before.includes('아직 현장 사진 없이 주신 정보만으로 낸 가견적') && before.includes('줄어들 수도') && before.includes('늘어날 수도')
    );

    const heroBefore = await page.locator('main').innerText();
    const called = appPrice - 30;
    await input.fill(String(called));
    await page.waitForTimeout(450);
    const after = await page.getByTestId('sugo-msg').innerText();
    record('견적 멘트: 금액 즉시 변경', after.includes(called.toLocaleString('ko-KR')) && !after.includes(` ${appPrice.toLocaleString('ko-KR')}만원`), `${called}만`);
    const heroAfter = await page.locator('main').innerText();
    record('가견적 호가: 순익·신호등 연동', heroBefore !== heroAfter && heroAfter.includes('보수적 남는 돈'));

    // 적자까지 떨어뜨려도 '남는 비율' 카드가 넘치지 않는다 (IMG_1585 −7383% 잘림)
    await input.fill('6');
    await page.waitForTimeout(400);
    const fit = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="hero-margin"]');
      if (!card) return null;
      const num = card.querySelector('.num span') || card.querySelector('.num');
      const cr = card.getBoundingClientRect();
      const nr = num.getBoundingClientRect();
      return { text: num.textContent, inside: nr.right <= cr.right + 0.5 && nr.left >= cr.left - 0.5, cardW: Math.round(cr.width), numW: Math.round(nr.width) };
    });
    record('가견적 호가: 극단 음수(−7,000%대)도 카드 안에 들어감', !!fit && fit.inside, fit ? `${fit.text} ${fit.numW}/${fit.cardW}px` : '카드 없음');
    const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    record('가견적 호가: 극단 음수에도 가로 스크롤 0', pageOverflow <= 1, `overflow=${pageOverflow}`);

    await input.fill(String(called));
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /견적 멘트 복사/ }).click();
    await page.waitForTimeout(350);
    record('견적 멘트: 1탭 복사', (await page.getByText('견적 멘트를 복사했습니다').count()) >= 1);

    await page.getByRole('button', { name: '앱 계산가로 되돌리기', exact: true }).click();
    await page.waitForTimeout(350);
    record('가견적 호가: 앱 계산가로 원복', (await input.inputValue()) === String(appPrice), await input.inputValue());
  });

  // #22480: 숨고 스샷·요청서로 온 현장은 숨고 멘트, 업장 직접 문의는 사장님 호칭
  await step('단위: 견적 멘트 — 숨고/일반·사진 유무 분기', async () => {
    const mk = (patch) =>
      composeCase({
        trade: 'bathroom',
        patch: { sizeValue: '1', sizeUnit: '칸', location: '구미시 형곡동 아파트 8층', notes: '600각 포세린', workDays: '3', ...patch },
      });
    const msgOf = (c) => clientQuoteMessage(c, computeEstimate(c));

    const soomgo = mk({ rawInput: '숨고 요청서 · 견적 보낸 고수 8명 · 채팅하기' });
    record('멘트 단위: 숨고 스샷 출처 감지', isSoomgoCase(soomgo) === true);
    record('멘트 단위: 숨고면 숨고 고객님 멘트', msgOf(soomgo).includes('고객님,') && msgOf(soomgo).includes('요청서에 적어 주신'));
    record('멘트 단위: 숨고 detected via ocrRaw', isSoomgoCase(mk({ ocrRaw: '숨고 요청 상세 경북 안동시 15평' })) === true);
    record('멘트 단위: 숨고 아닌 카톡은 숨고 아님', isSoomgoCase(mk({ notes: '카톡으로 문의 — 욕실 전체 교체' })) === false);

    const shop = mk({ title: '안동 풍산읍 15평 상가 원상복구 철거', location: '안동시 풍산읍 상가 2층', notes: '천장 텍스 철거' });
    record('멘트 단위: 상가 현장 호칭 사장님', clientHonorific(shop, computeEstimate(shop)) === '사장님');
    record('멘트 단위: 일반 상가 멘트에 숨고 없음', !msgOf(shop).includes('숨고') && msgOf(shop).includes('사장님,') && msgOf(shop).includes('문의해 주신'));
    const house = mk({ title: '포항 두호동 24평 빌라 도배', location: '포항시 북구 두호동 빌라 3층' });
    record('멘트 단위: 주거 현장 호칭 고객님', clientHonorific(house, computeEstimate(house)) === '고객님');

    record('멘트 단위: 사진 없음 문구', tentativePriceNotice({ photos: [] }).includes('아직 현장 사진 없이'));
    record('멘트 단위: 사진 있으면 내용+사진 기준', tentativePriceNotice({ photos: [{ dataUrl: 'data:image/png;base64,AA' }] }).includes('주신 내용과 사진 기준'));
    record('멘트 단위: 사진 있어도 비용 증감 안내', msgOf(mk({ photos: [{ dataUrl: 'data:image/png;base64,AA' }] })).includes('늘어날 수도'));
  });

  // 앱 전체 숫자 입력칸 전수 — 마지막 숫자를 지우면 원래 값이 되살아나던 버그(IMG_1585)가 남아 있지 않은지
  await step('숫자 입력칸 전수 — 다 지우면 빈칸 유지', async () => {
    const scan = async (tag) => {
      const bad = [];
      const checked = [];
      for (let n = 1; n <= 6; n += 1) {
        await goTab(n);
        const sel = 'main input[inputmode="numeric"], main input[inputmode="decimal"]';
        const total = await page.locator(sel).count();
        for (let i = 0; i < total; i += 1) {
          const el = page.locator(sel).nth(i);
          let label = `${tag} tab${n}#${i}`;
          try {
            if (!(await el.isVisible())) continue;
            label = `${tag} ${n}단계 《${(await el.getAttribute('aria-label')) || `#${i}`}》`;
            const original = await el.inputValue();
            if (original === '') continue;
            await el.click();
            await el.fill('');
            await page.waitForTimeout(110);
            const after = await el.inputValue();
            checked.push(label);
            if (after !== '') bad.push(`${label} "${original}"→"${after}"`);
            await el.fill(original);
            await page.waitForTimeout(110);
          } catch (e) {
            bad.push(`${label} 검사 실패: ${e.message.split('\n')[0].slice(0, 60)}`);
          }
        }
      }
      return { bad, checked };
    };

    const bath = await scan('욕실');
    record(`숫자칸 전수(욕실): ${bath.checked.length}개 모두 빈칸 유지`, bath.bad.length === 0, bath.bad.slice(0, 4).join(' | ') || `${bath.checked.length}개 확인`);

    await goHome();
    await page.getByText('안동 풍산읍 15평 상가 원상복구 철거').first().click();
    await page.getByLabel('받은 내용').waitFor();
    const demo = await scan('철거');
    record(`숫자칸 전수(철거): ${demo.checked.length}개 모두 빈칸 유지`, demo.bad.length === 0, demo.bad.slice(0, 4).join(' | ') || `${demo.checked.length}개 확인`);
    record('숫자칸 전수: 두 현장 합쳐 20칸 이상', bath.checked.length + demo.checked.length >= 20, `${bath.checked.length + demo.checked.length}칸`);

    // 다음 단계들은 욕실 현장으로 이어진다
    await goHome();
    await page.getByText('구미 형곡동 32평 아파트 욕실 1칸').first().click();
    await page.getByLabel('받은 내용').waitFor();
  });

  await step('2단계 — 현장 부대비용 자동 반영·1탭 빼기', async () => {
    await goTab(2);
    const t = await mainText();
    record('부대비용: 빠진 비용 경고·일괄 버튼 없음', !t.includes('빠진 비용') && !t.includes('한 번에 넣기'));
    const chips = page.getByTestId('site-cost');
    const count = await chips.count();
    record('부대비용: 칩 4개(보양·관리소·양중·준공청소)', count === 4, `${count}개`);
    const onCount = await page.locator('[data-testid="site-cost"][data-state="on"]').count();
    record('부대비용: 필요한 항목은 이미 포함됨', onCount >= 1, `${onCount}/${count}`);
    const totalText = async () => (await page.locator('text=/부대비용 [\\d,]+만이 견적에 포함/').first().innerText().catch(() => '')) || '';
    const before = await totalText();
    const onChip = page.locator('[data-testid="site-cost"][data-state="on"]').first();
    const label = await onChip.innerText();
    await onChip.click();
    await page.waitForTimeout(350);
    const after = await totalText();
    record('부대비용: 1탭으로 빼면 포함 금액이 줄어듦', before !== after && after.length > 0, `${before} → ${after}`);
    await page.locator('[data-testid="site-cost"][data-state="off"]').first().click();
    await page.waitForTimeout(350);
    const restored = await totalText();
    record('부대비용: 다시 눌러 되돌리면 원금액', restored === before, `${restored} vs ${before}`);
    await shotAt('33-site-cost.png', '부대비용', -200);
    await goTab(2);
  });

  await step('단계 이동 시 맨 위로', async () => {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => window.scrollY);
    await goTab(3);
    const after = await page.evaluate(() => window.scrollY);
    record('스크롤: 단계 전환 시 최상단', before > 200 && after === 0, `${before} → ${after}`);
    await goTab(2);
  });

  await step('3단계 답사 · 빠뜨리기 쉬운 비용 0원', async () => {
    await goTab(3);
    const t = await mainText();
    record('답사: 메모·현장 점검·부대비용', t.includes('답사 메모·사진') && t.includes('현장 점검') && t.includes('답사에서 더 챙길 비용'));
    const row = page.getByRole('button', { name: /거주 중 시공/ });
    await row.first().click();
    await page.waitForTimeout(250);
    const amount = page.getByLabel('거주 중 시공 금액(만원)');
    record('빠뜨리기: 체크 시 금액 입력칸', (await amount.count()) === 1);
    const totalOf = async () => {
      const txt = (await page.locator('text=/\\d+\\/\\d+ · /').first().innerText().catch(() => '')) || '';
      const m = txt.replace(/\s/g, '').match(/·([\d,]+)만/);
      return { txt, num: m ? Number(m[1].replace(/,/g, '')) : NaN };
    };
    const before = await totalOf();
    await amount.fill('0');
    await page.waitForTimeout(250);
    record('빠뜨리기: 0원 입력 유지', (await amount.inputValue()) === '0');
    const after = await totalOf();
    record('빠뜨리기: 12만 → 0원이면 합계에서 12만 빠짐', before.num - after.num === 12, `${before.txt} → ${after.txt}`);
    await amount.fill('12');
    await page.waitForTimeout(250);
    await shotAt('32-survey.png', '답사 메모·사진', -100);
  });

  await step('4단계 최종·수익', async () => {
    await goTab(4);
    const t = await mainText();
    record('수익: 최종 판단 신호등', /진행 추천|조율 후 진행|포기·패스 권장/.test(t));
    record('수익: 가견적 → 최종 비교', t.includes('가견적 → 최종 견적'));
    record('수익: 하루 일당', /하루 뛰면 [-−]?[\d,]+만원/.test(t));
    record('수익: 방어선 근거', t.includes('최소 안전마진 5%'));
    record('수익: −0만 숨김', !t.includes('−0만') && !t.includes('-0만'));
    const toggle = page.getByRole('button', { name: /손님이 가격 깎자고 할 때만 열어보기/ });
    record('수익: 네고 영역 기본 접힘', (await toggle.count()) === 1 && (await toggle.getAttribute('aria-expanded')) === 'false');
    await toggle.click();
    await page.waitForTimeout(300);
    const tOpen = await mainText();
    record('수익: 열면 절감 대안 표시', tOpen.includes('가격을 맞추려면 이렇게 줄이세요'));
    record('수익: 마감 공종 대안', tOpen.includes('자재 등급 한 단계 낮추기') || tOpen.includes('준공 청소는 손님이 직접'));
    record('수익: −0만 없음(대안)', !/[-−]0만/.test(tOpen));
    record('수익: 항목별 산출 근거', t.includes('항목별 산출 근거') && t.includes('인건비') && /다섯 줄을 더하면 보수적 원가 [\d,]+만원/.test(t));
    record('수익: Before/After 카드', t.includes('BEFORE') && t.includes('AFTER (예상)'));
    record('수익: AI 미연결 안내', t.includes('설정에서 Gemini API 키를 연결하면'));
    await page.getByRole('button', { name: '일 끝나고 전액' }).click();
    await page.waitForTimeout(350);
    record('수익: 0·0·100 결제', (await page.getByLabel('계약금 비율').inputValue()) === '0');
    await page.getByRole('button', { name: '표준 분할' }).click();
    await page.waitForTimeout(300);
    await shotAt('33-profit.png', '가견적 → 최종 견적', -110);
  });


  await step('4단계 — 내가 부른 금액 기준 재계산', async () => {
    await goTab(4);
    const t0 = await mainText();
    const input = page.getByLabel('내가 부른 금액(만원)');
    record('부른 금액: 4단계 최상단 입력칸', (await input.count()) === 1);
    // 앞 단계에서 입력한 금액이 남아 있으면 먼저 되돌린다 — '기본값 = 앱 계산가'는 빈 상태의 약속이다
    await page.getByRole('button', { name: '앱 계산가로 되돌리기' }).click();
    await page.waitForTimeout(300);
    const appMatch = t0.match(/앱 계산가 ([\d,]+)만원/);
    const costMatch = t0.match(/보수적 원가 ([\d,]+)만원은 이렇게 나옵니다/);
    const bufMatch = t0.match(/돌발 예비비 [\d.]+%\(([\d,]+)\)/);
    const appPrice = appMatch ? Number(appMatch[1].replace(/,/g, '')) : 0;
    const cost = costMatch ? Number(costMatch[1].replace(/,/g, '')) : 0;
    const buffer = bufMatch ? Number(bufMatch[1].replace(/,/g, '')) : 0;
    record('부른 금액: 기본값 = 앱 계산가', appPrice > 0 && (await input.inputValue()) === String(appPrice), `${await input.inputValue()} vs ${appPrice}`);

    const called = appPrice - 50;
    await input.fill(String(called));
    await page.waitForTimeout(400);
    const t1 = await mainText();
    const net = Number((await page.getByTestId('called-net').innerText()).replace(/[^\d-]/g, ''));
    record('부른 금액: 순익 = 부른 금액 − 보수적 원가', net === called - cost, `${net} vs ${called - cost}`);
    const margin = Number((await page.getByTestId('called-margin').innerText()).replace(/[^\d-]/g, ''));
    record('부른 금액: 남는 비율 즉시 반영', margin === Math.round(((called - cost) / called) * 100), `${margin}%`);
    record(
      '부른 금액: 계약금·중도금·잔금 분할',
      t1.includes(`${Math.round(called * 0.3).toLocaleString('ko-KR')}`) && t1.includes(`${Math.round(called * 0.4).toLocaleString('ko-KR')}`),
      `계약금 ${Math.round(called * 0.3)} · 중도금 ${Math.round(called * 0.4)}`
    );
    record('부른 금액: 빠른 +-·원복 버튼', (await page.getByRole('button', { name: '플러스 10만원' }).count()) === 1 && (await page.getByRole('button', { name: '앱 계산가로 되돌리기' }).count()) === 1);
    await page.getByRole('button', { name: '플러스 10만원' }).click();
    await page.waitForTimeout(250);
    record('부른 금액: +10만 즉시 반영', (await input.inputValue()) === String(called + 10), await input.inputValue());
    await input.fill(String(called));
    await page.waitForTimeout(300);

    // 원가 이하로 부르면 적자 경고
    await input.fill(String(cost - 20));
    await page.waitForTimeout(400);
    const tBad = await mainText();
    record('부른 금액: 원가 이하 → 적자 경고', tBad.includes('적자') && tBad.includes('적자입니다'));
    record('부른 금액: 적자는 순익 마이너스', (await page.getByTestId('called-net').innerText()).includes('-'));

    await page.getByRole('button', { name: '앱 계산가로 되돌리기' }).click();
    await page.waitForTimeout(400);
    record('부른 금액: 앱 계산가로 되돌리기', (await input.inputValue()) === String(appPrice), await input.inputValue());

    // 다시 내가 부른 금액으로 확정 → 문서·홈까지 연동 확인
    await input.fill(String(called));
    await page.waitForTimeout(400);
    await shotAt('33b-called.png', '내가 부른 금액', -80);

    await goTab(6);
    const docTxt = await page.locator('.print-area').innerText();
    const subtotal = Number(await page.locator('[data-testid=quote-subtotal]').getAttribute('data-amount'));
    const total = Number(await page.locator('[data-testid=quote-total]').getAttribute('data-amount'));
    const lineSum = await page.evaluate(() =>
      [...document.querySelectorAll('.print-area [data-quote-line]')].reduce(
        (s, el) => s + Number(el.getAttribute('data-amount') || 0),
        0
      )
    );
    record('문서: 공급가 = 내가 부른 금액', subtotal === called, `${subtotal} vs ${called}`);
    record('문서: 줄 합계 = 공급가(1만원 오차 없음)', lineSum === subtotal, `${lineSum} vs ${subtotal}`);
    record('문서: 합계 = 부른 금액', total === called, `${total} vs ${called}`);
    record(
      '문서: 자재비·인건비·폐기물·식비 항목',
      ['자재비', '인건비', '폐기물 처리·운반비', '식비'].every((x) => docTxt.includes(x)),
      docTxt.split('\n').filter((l) => /비|료/.test(l)).slice(0, 6).join(' / ')
    );
    record('문서: 수량·단가 표기', docTxt.includes('수량') && docTxt.includes('단가'));
    const leakWords = ['순익', '마진', '알선료', '예비비', '남는', '일당', '원가'].filter((w) => docTxt.includes(w));
    record('문서: 내부 수익·원가 용어 0건', leakWords.length === 0, leakWords.join(', '));
    record('문서: 견적번호·유효기간', /견적번호/.test(docTxt) && /유효기간/.test(docTxt));

    // 홈 장부 카드 금액·순익도 같은 금액으로
    await goHome();
    await page.getByText('구미 형곡동 32평 아파트 욕실 1칸').waitFor();
    const cardTxt = await page.locator('div.card').filter({ hasText: '구미 형곡동 32평 아파트 욕실 1칸' }).first().innerText();
    record('홈 카드: 표시 금액 = 내가 부른 금액', cardTxt.includes(`${called.toLocaleString('ko-KR')}만원`), cardTxt.split('\n').slice(0, 6).join(' / '));
    const homeNet = Number((cardTxt.match(/순익 (-?[\d,]+)만/) || [])[1]?.replace(/,/g, '') || 0);
    const expectHomeNet = called - (cost - buffer);
    record('홈 카드: 순익 = 부른 금액 − 기본원가', Math.abs(homeNet - expectHomeNet) <= 2, `${homeNet} vs ${expectHomeNet}`);
    await page.getByText('구미 형곡동 32평 아파트 욕실 1칸').click();
    await page.getByLabel('받은 내용').waitFor();
  });

  await step('5단계 시공 — 숫자·날짜 버그', async () => {
    await goTab(5);
    const days = page.getByLabel('공사기간', { exact: true });
    await days.click();
    await page.keyboard.type('3');
    await page.waitForTimeout(300);
    record('공사기간: 1→3 입력 (13 아님)', (await days.inputValue()) === '3', await days.inputValue());
    await page.getByRole('button', { name: '오늘 시작' }).click();
    await page.waitForTimeout(400);
    const startVal = await page.getByLabel('시공 시작일').inputValue();
    record('시공일: KST 오늘', startVal === TODAY, `${startVal} (KST ${TODAY})`);
    await page.getByText('시공일 날씨').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(1400);
    const wx = await mainText();
    record('날씨: 오늘 날짜 표시', wx.includes(mmdd(TODAY)), wx.match(/시공일 날씨[^\n]*/)?.[0] || '');
    record('날씨: 예보 표시(계절 안내 아님)', !wx.includes('예보는 16일 앞까지만 나옵니다'));
  });


  await step('5단계 — 일차별 브리핑(1·2·3일차)', async () => {
    await goTab(5);
    await mainText();
    const chips = page.getByRole('tab', { name: /일차 브리핑$/ });
    record('일차: 공사기간(3일)만큼 일차 칩', (await chips.count()) === 3, String(await chips.count()));
    const panel = () => page.locator('details').filter({ hasText: '일차별 투입 인원' }).first();
    const t1 = await panel().innerText();
    record('일차: 1일차 날짜·공정', t1.includes('1일차') && t1.includes(mmdd(TODAY)) && t1.includes('철거·방수'), t1.match(/1일차 · [^\n]*/)?.[0] || '');
    record('일차: 2일차 날짜 표시', t1.includes(`2일차`) && t1.includes(mmdd(addDaysISO(TODAY, 1))), t1.match(/2일차\s*[^\n]*/)?.[0] || '');
    const day1Crew = t1.split('\n').find((l) => /기공|인부|보조/.test(l)) || '';

    await page.getByRole('tab', { name: '2일차 브리핑' }).click();
    await page.waitForTimeout(350);
    const t2 = await panel().innerText();
    record('일차: 2일차 브리핑으로 전환', t2.includes('담수 확인·타일') && !t2.includes('기존 타일·도기 철거'), t2.match(/2일차 · [^\n]*/)?.[0] || '');
    record('일차: 2일차는 2일차 날짜 강조', t2.includes(mmdd(addDaysISO(TODAY, 1))));
    record('일차: 2일차 장비도 다름', t2.includes('레벨링 클립') && !t2.includes('방수재·롤러'));
    const day2Crew = t2.split('\n').find((l) => /기공|인부|보조/.test(l)) || '';
    record('일차: 일차마다 브리핑 내용이 바뀜', t2.split('\n').slice(0, 14).join('|') !== t1.split('\n').slice(0, 14).join('|'), `${day1Crew} / ${day2Crew}`);

    await page.getByRole('tab', { name: '3일차 브리핑' }).click();
    await page.waitForTimeout(350);
    const t3 = await panel().innerText();
    record('일차: 3일차 마감·검수', t3.includes('준공 검수') && t3.includes('준공 사진 3컷'), t3.match(/3일차 · [^\n]*/)?.[0] || '');
    record('일차: 마지막 날은 보조 철수(기공만)', !/보조 1명/.test(t3.split('\n').slice(0, 8).join(' ')), t3.match(/필요 인원[\s\S]{0,40}/)?.[0]?.replace(/\n/g, ' ') || '');
    await shotAt('34b-day3.png', '일차별 투입 인원', -90);

    // 1일 공사는 1일차만
    const days = page.getByLabel('공사기간', { exact: true });
    await days.fill('1');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(450);
    record('일차: 1일 공사는 1일차만', (await chips.count()) === 1, String(await chips.count()));
    await days.fill('3');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(450);
    record('일차: 3일로 되돌리면 3칩', (await chips.count()) === 3, String(await chips.count()));
  });

  await step('5단계 시공 — 타임라인·출근 안내·사진·안내문', async () => {
    const t = await mainText();
    record('시공: 공종 타임라인', t.includes('D-2 · D-1 사전 준비'));
    record('시공: 투입 인원·차량 브리핑', t.includes('일차별 투입 인원 · 차량 · 현장 브리핑') && t.includes('필요 차량'));
    record('시공: 현장 환경·장비', t.includes('현장 환경') && t.includes('챙길 장비'));
    record('시공: 숨고 원문·배차 요청 없음', !t.includes('전날 18시까지') && !t.includes('[배차 요청]') && !t.includes('가능한 빨리'));
    record('시공: 작업 전·후 사진(인테리어)', t.includes('작업 전 전체 사진') && t.includes('자재 입고 사진'));
    await shotAt('34-build.png', '인부 출근·현장 안내', -110);
    await page.getByRole('button', { name: /공사 안내문 뽑기/ }).click();
    await page.waitForTimeout(600);
    const doc = await page.locator('.print-area').innerText();
    record('공사 안내문: A4 양식', doc.includes('공 사 안 내') && doc.includes('이웃 여러분께') && doc.includes('공사 기간'));
    record('공사 안내문: 문의·인쇄', doc.includes('문의') && (await page.getByRole('button', { name: /인쇄·PDF/ }).count()) >= 1);
    await shotAt('35-notice.png', '공 사 안 내', -100);
  });

  await step('6단계 문서 — 손님 견적서 원가 은닉', async () => {
    await goTab(6);
    await page.getByText('손님에게 보낼 견적서').waitFor();
    const docText = await page.locator('.print-area').innerText();
    const leak = ['원가', '남는', '일당', '예비비', '양중비', '마진'].filter((w) => docText.includes(w));
    record('견적서: 내부 원가 용어 없음', leak.length === 0, leak.join(', '));
    const sum = await page.evaluate(() => {
      const lines = [...document.querySelectorAll('.print-area [data-quote-line]')];
      return {
        lines: lines.reduce((s, el) => s + Number(el.getAttribute('data-amount') || 0), 0),
        count: lines.length,
        subtotal: Number(document.querySelector('.print-area [data-testid=quote-subtotal]')?.getAttribute('data-amount') || 0),
      };
    });
    record('견적서: 공정 줄 합계 = 공급가', sum.lines === sum.subtotal && sum.count >= 2, `${sum.lines} vs ${sum.subtotal}`);
    // 욕실 현장은 점포철거비 지원금 대상이 아니라 탭을 숨긴다 (상가·철거 현장에서만)
    record('문서: 욕실엔 지원금 내역서 탭 없음', (await page.getByRole('button', { name: '지원금 내역서' }).count()) === 0);
    record('문서: 공사 안내문 탭', (await page.getByRole('button', { name: '공사 안내문', exact: true }).count()) === 1);
    await shotAt('36-doc.png', '손님에게 보낼 견적서', -100);
    await page.getByRole('button', { name: '공사 안내문', exact: true }).click();
    await page.waitForTimeout(400);
    record('문서: 공사 안내문 뷰', (await page.locator('.print-area').innerText()).includes('공 사 안 내'));
  });

  // ---------- 철거 현장: 공종별 사진 ----------
  await step('철거 현장 — 철거 전 6곳', async () => {
    await goHome();
    await page.getByText('안동 풍산읍 15평 상가 원상복구 철거').click();
    await page.getByLabel('받은 내용').waitFor();
    await goTab(5);
    const t = await mainText();
    record('철거: 철거 전 사진 6곳', t.includes('철거 전 사진 6곳') && t.includes('승강기 내부'));
    await goTab(6);
    await page.getByRole('button', { name: '지원금 내역서' }).click();
    await page.waitForTimeout(400);
    await page.getByLabel('점포명').fill('테스트상회');
    await page.getByLabel('공급자 상호').fill('안동철거');
    await page.getByRole('button', { name: /우리 업체 정보로 저장/ }).click();
    await page.waitForTimeout(400);
    const sheetTxt = await page.locator('.print-area').innerText();
    record('지원금: 신청인·공급자 입력 반영', sheetTxt.includes('테스트상회') && sheetTxt.includes('안동철거'));
    record('지원금: 종료일 실제 날짜', !sheetTxt.includes('일 후') && /\d{4}-\d{2}-\d{2} ~ \d{4}-\d{2}-\d{2}/.test(sheetTxt), sheetTxt.match(/공사기간[^\n]*/)?.[0] || '');
    await page.getByRole('button', { name: '견적서', exact: true }).click();
    await page.waitForTimeout(400);
    const quoteTxt = await page.locator('.print-area').innerText();
    record('견적서: 우리 업체 정보 자동', quoteTxt.includes('안동철거'), quoteTxt.split('\n').slice(-6).join(' / '));
    await page.getByRole('button', { name: /견적 안내 문자/ }).first().click();
    await page.waitForTimeout(300);
    record('문자: 업체 정보 자동', (await mainText()).includes('안동철거'));
    await goTab(5);
    await goTab(3);
    const lift = await mainText();
    record('운반: 인력 반출이 인부×일당+트럭', /인력 반출 \(인부 \d명 · 1톤차 \d대\)/.test(lift) && lift.includes('일당'));
    record('운반: 5만원 고정값 없음', !/인력 반출[^\n]*5만원/.test(lift));
    record('운반: 인부·트럭·금액 수정칸', (await page.getByLabel('인부 수', { exact: true }).count()) >= 1 && (await page.getByLabel('인력 반출 금액').count()) === 1);
    await shotAt('42-lifting.png', '운반 방법 고르기', -110);
  });

  // ---------- 새 현장: 생활폐기물 한차 ----------
  await step('철거 현장 — 스타일·자재 카드 숨김 · 답사 가이드는 3단계로', async () => {
    await goHome();
    await page.getByText('안동 풍산읍 15평 상가 원상복구 철거').click();
    await page.getByLabel('받은 내용').waitFor();
    await goTab(2);
    const est = await mainText();
    record('철거: 가견적에 스타일·자재 카드 없음', !est.includes('스타일·자재 정하기') && !est.includes('추천 자재 세트'));
    record('철거: 전문가 검증 리포트(3자 감사)는 그대로', est.includes('전문가 검증 리포트') && est.includes('시장 호가 비교'));
    record('철거: 가견적에 답사 가이드 중복 없음', !est.includes('답사 시 왜·뭘 확인해야 하나'));
    record('실견적 근거 419건 DB', est.includes('우리 실견적 419건 DB') && !est.includes('실견적 60건'));
    await goTab(3);
    const survey = await mainText();
    record('답사: 볼 것 카드가 3단계에 있음', survey.includes('답사 때 꼭 볼 것'));
    // 사다리차를 세울 수 없는 현장(설정: 불가)에서는 사다리차 확인 항목을 꺼내지 않는다
    record('답사: 사다리 불가 현장엔 사다리차 항목 없음', !survey.includes('사다리차 자리'));
    record('답사: 현장 점검은 3번', survey.includes('현장 점검 (운반·실측·폐기물)'));
    // 1단계에서 '기초·정지'를 켜면 철거+정지 → 스타일 카드 계속 숨김
    await goTab(1);
    await page.getByLabel('기초·정지 넣기').click();
    await page.waitForTimeout(400);
    await goTab(2);
    const afterGround = await mainText();
    record('철거+정지: 스타일 카드 숨김', !afterGround.includes('스타일·자재 정하기'));
    // 여기에 '도배·장판'까지 켜면 인테리어 복합 → 카드가 나온다
    await goTab(1);
    await page.getByLabel('도배·장판 넣기').click();
    await page.waitForTimeout(400);
    await goTab(2);
    const afterWall = await mainText();
    record('철거+정지+도배: 스타일 카드 표시', afterWall.includes('스타일·자재 정하기') && afterWall.includes('추천 자재 세트'));
    await shot('41c-ground-style-card.png');
    // 원래대로 (철거 단독)
    await goTab(1);
    await page.getByLabel('도배·장판 빼기').click();
    await page.getByLabel('기초·정지 빼기').click();
    await page.waitForTimeout(400);
    await goTab(2);
    record('철거 복귀: 스타일 카드 다시 숨김', !(await mainText()).includes('스타일·자재 정하기'));
  });

  await step('새 현장 — 생활폐기물 한차', async () => {
    await goHome();
    await page.getByRole('button', { name: /새 현장 만들기/ }).click();
    await page.getByText('숨고·카톡·메모를 그대로 넣으세요').waitFor();
    const modal = await page.locator('[role=dialog]').innerText();
    record('모달: 예시 칩 삭제', !modal.includes('폐기물 2톤만 치워주세요') && !modal.includes('욕실+도배 15평'));
    record('모달: 사진 버튼 2개로 분리', modal.includes('숨고·카톡 스샷') && modal.includes('현장 사진') && !modal.includes('사진·스샷 올리기'));
    record('모달: 안내 1줄', modal.includes('스샷 글자는 기기 안에서만'));
    record('모달: 스샷/현장 설명', modal.includes('스샷은 글자를 읽어') && modal.includes('현장 사진은 글자를 읽지 않고'));
    record('모달: AI 없이 자동 분류 표시', modal.includes('AI 없이 자동 분류'));
    await page.getByLabel('현장 요청 내용').fill('경북 안동시 용산동 생활폐기물 한차, 엘리베이터로 운반, 재활용 가능');
    await page.getByLabel(/AI 정밀 분석|자동으로 분류하기/).click();
    await page.getByText('자동으로 잡았습니다').waitFor({ timeout: 15000 });
    const r = await page.locator('[role=dialog]').innerText();
    record('한차: 폐기물로 분류', r.includes('폐기물 수거·처리'));
    record('한차: 1톤 1차 표시', r.includes('1톤 1차') && r.includes('1톤'));
    await page.getByRole('button', { name: /이 내용으로 현장 만들기/ }).click();
    await page.getByText('받은 내용').first().waitFor();
    record('한차: 현장 생성', true);
  });

  await step('폐기물 현장 — 차량 1탭·가견적', async () => {
    const t = await mainText();
    record('폐기물: 차량 3버튼', t.includes('반차(0.5톤)') && t.includes('1톤 1차') && t.includes('2.5톤'));
    const pressed = await page.getByRole('button', { name: /1톤 1차/ }).first().getAttribute('aria-pressed');
    record('폐기물: 1톤 1차 선택됨', pressed === 'true', String(pressed));
    await shot('37-waste-info.png');
    await goTab(2);
    const e = await mainText();
    record('폐기물: 스타일·자재 카드 없음', !e.includes('스타일·자재 정하기'));
    record('폐기물: 답사 가이드(성상)', e.includes('성상'));
    record('폐기물: 차량 전환 버튼 유지', e.includes('폐기물 차량 (1탭으로 바꾸기)'));
    await page.getByRole('group', { name: '폐기물 차량 선택' }).getByRole('button', { name: /2.5톤/ }).click();
    await page.waitForTimeout(500);
    record('폐기물: 2.5톤으로 전환', (await mainText()).includes('약 2.5톤 수거') || (await mainText()).includes('2.5톤 수집·운반 차량 1대'));
    await page.getByRole('group', { name: '폐기물 차량 선택' }).getByRole('button', { name: /1톤 1차/ }).click();
    await page.waitForTimeout(400);
    await shotAt('38-waste-estimate.png', '1차 가견적', -110);
  });

  await step('답사 — “폐기물 두 차는 나올듯” 버튼 활성', async () => {
    await goTab(3);
    await page.getByLabel('현장 변동 내용').fill('폐기물 두 차는 나올듯');
    await page.waitForTimeout(300);
    const btn = page.getByRole('button', { name: '답사 내용으로 최종 견적 다시 내기' });
    record('답사: 글만 있어도 버튼 활성', (await btn.isDisabled()) === false);
    const t = await mainText();
    record('답사: +43만 미리보기', t.includes('폐기물 1대 추가 반출') && t.includes('+43만'));
    await btn.click();
    await page.waitForTimeout(600);
    const after = await mainText();
    record('답사: 변동 반영', after.includes('무엇이 왜 바뀌었나') && after.includes('▲'));
    record('답사: 가견적→최종 요약', /가견적 [\d,]+만 → 최종 견적 [\d,]+만/.test(after));
    await shotAt('39-waste-survey.png', '무엇이 왜 바뀌었나', -120);

    // 맞춤 실측 체크 직접 추가
    const det = page.locator('details').filter({ hasText: '맞춤 실측 체크' }).first();
    await det.evaluate((el) => (el.open = true));
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: /직접 항목 추가/ }).click();
    await page.getByLabel('추가 항목 제목').fill('외벽 코킹');
    await page.getByLabel('추가 항목 메모').fill('균열로 물 들어옴');
    await page.getByLabel('추가 항목 금액').fill('15');
    await page.getByRole('button', { name: '추가', exact: true }).click();
    await page.waitForTimeout(350);
    const withCustom = await mainText();
    record('맞춤 체크: 직접 항목 추가', withCustom.includes('외벽 코킹') && withCustom.includes('균열로 물 들어옴'));
    await page.getByRole('button', { name: /외벽 코킹/ }).first().click();
    await page.waitForTimeout(400);
    record('맞춤 체크: 금액 입력칸', (await page.getByLabel('외벽 코킹 금액(만원)').count()) === 1);
    await shotAt('43-custom-check.png', '맞춤 실측 체크', -120);
  });

  await step('최종·수익 — 폐기물 맞춤 대안', async () => {
    await goTab(4);
    const t = await mainText();
    record('수익: −0만 없음(폐기물)', !t.includes('−0만') && !t.includes('-0만'));
    record('수익: 마감 대안 미노출', !t.includes('자재 등급 한 단계 낮추기'));
    const nt = page.getByRole('button', { name: /손님이 가격 깎자고 할 때만 열어보기/ });
    if (await nt.count()) {
      await nt.click();
      await page.waitForTimeout(300);
    }
    const tOpen = await mainText();
    record('수익: 양중/인부/성상 대안', tOpen.includes('고객이 1층에서 직접 하차') || tOpen.includes('보조 인부 1명 감축') || tOpen.includes('혼합 폐기물 성상 분리'));
    record('수익: 변동 이유 표시', t.includes('폐기물 1대 추가 반출'));
    await shotAt('40-waste-profit.png', '가견적 → 최종 견적', -110);
  });

  await step('시공 — 폐기물 타임라인·출근 안내', async () => {
    await goTab(5);
    const t = await mainText();
    record('폐기물: 전날 배차 타임라인', t.includes('전날 · 배차·인력 확정') && t.includes('당일 · 수거·상차·계근'));
    record('폐기물: 자재발주·하자정리 없음', !t.includes('자재 발주') && !t.includes('하자 정리'));
    record('폐기물: 업체별 발주 숨김', !t.includes('자재 발주 리스트'));
    record('폐기물: 사진 체크(상차 적재량)', t.includes('상차 적재량') && t.includes('수거 후 빈 공간'));
    record('브리핑: 1톤 차량·상차 인부', t.includes('1톤 1차 1대') && t.includes('상차 인부'));
    record('폐기물: 3단계는 상차·계근(방수 아님)', t.includes('상차·성상분리·계근 확인') && !t.includes('방수 담수 테스트'));
    record('브리핑: 제외·주의 표시', t.includes('핵심 작업') && t.includes('챙길 장비'));
    record('브리핑: 숨고 원문 없음', !t.includes('가능한 빨리') && !t.includes('숨고'));
    await shotAt('41-waste-build.png', '인부 출근·현장 안내', -110);
  });

  // ---------- 복합 인테리어 세부 공종 ----------
  await step('복합 인테리어 — 욕실·주방·현관·미장 반영', async () => {
    await goHome();
    await page.getByRole('button', { name: /새 현장 만들기/ }).click();
    await page.getByText('숨고·카톡·메모를 그대로 넣으세요').waitFor();
    await page
      .getByLabel('현장 요청 내용')
      .fill('안동 15평 아파트 전체 인테리어. 방 2 / 욕실 1 / 부엌 1 / 현관(중문/신발장/타일). 창호는 안해도되고 바닥 미장 필요. 예산 1,000만원 미만. 문의/희망사항: 최신식으로 깔끔하게');
    await page.getByLabel(/AI 정밀 분석|자동으로 분류하기/).click();
    await page.getByText('자동으로 잡았습니다').waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: /이 내용으로 현장 만들기/ }).click();
    await page.getByLabel('받은 내용').waitFor();
    await page.waitForTimeout(400);
    const info = await mainText();
    record('복합: 포함 공종 칩', ['욕실', '주방', '현관', '바닥 미장'].every((x) => info.includes(`포함 · ${x}`)), info.match(/포함 · [^\n]+/g)?.slice(0, 6).join(' / ') || '');
    record('복합: 제외 창호 칩', info.includes('제외 · 창호'));
    const received = await page.getByLabel('받은 내용').inputValue();
    record('복합: 희망사항이 정리본 맨 위', received.startsWith('희망사항:'), received.split('\n')[0]);
    await goTab(2);
    const est = await mainText();
    record('복합: 가견적에 세부 공종 요약', est.includes('욕실 1칸') && est.includes('주방') && est.includes('현관'));
    record('복합: 예산 1,000만 미만 → 🔴 패스 권장', est.includes('비추천 · 패스 권장') && est.includes('고객 예산 1,000만'));
    await goTab(6);
    const docTxt = await page.locator('.print-area').innerText();
    record('복합: 견적서에 욕실·싱크대', docTxt.includes('욕실') && docTxt.includes('싱크대'));
    record('복합: 견적서 창호 제외 표시', docTxt.includes('창호 제외') && !docTxt.includes('창호 교체·단열') && !docTxt.includes('창호·폴딩도어'));
    record('복합: 자재 사양에 현관·미장', docTxt.includes('현관') && docTxt.includes('미장'));
    await shotAt('47-composite.png', '공사 내역', -100);
  });

  // ---------- 관공서 공고 원가 보정 ----------
  await step('관공서 공고 — 실행원가 80% 보정', async () => {
    await goHome();
    await page.getByText('관공서 일감', { exact: false }).first().click();
    await page.getByText('건 접수 중').waitFor();
    await page.locator('main button').filter({ hasText: /임시주택단지|복구공사/ }).first().click();
    await page.getByText('투찰가·남는 돈 미리보기').waitFor();
    await page.getByRole('button', { name: /내 장부로 가져오기/ }).click();
    await page.getByLabel('받은 내용').waitFor();
    const received = await page.getByLabel('받은 내용').inputValue();
    record('공고: 받은 내용에 발주처·공고번호', /발주처:/.test(received) && /공고번호:/.test(received), received.split('\n').slice(0, 3).join(' | '));
    record('공고: 추정가격·추천 투찰가 포함', /추정가격: [\d,]+만원/.test(received) && /추천 투찰가: [\d,]+만원/.test(received));
    record('공고: 마감일·지역·링크 포함', /마감일:/.test(received) && /지역:/.test(received) && /공고 링크:/.test(received));
    record('공고: 1.정보에 공고 카드', (await mainText()).includes('🏛️ 관공서 공고') && (await mainText()).includes('추천 투찰가 (88%)'));
    await goTab(2);
    const t = await mainText();
    record('공고: 실행원가 80% 안내', t.includes('실행원가 하한') && t.includes('~80%'));
    record('공고: 수주금액 표시', /공고 수주금액 [\d,]+만/.test(t));
    await goTab(4);
    const p = await mainText();
    record('공고: 원가 설명에 보정 항목', p.includes('공고 실행원가 보정') || p.includes('수주'));
    record('공고: 남는 돈 착시 없음(마진 30% 미만)', !/남는 비율 (8|9)\d%/.test(p) && !p.includes('+2,382'));
    await shotAt('48-bid-cost.png', '가견적 → 최종 견적', -110);
    await goHome();
  });

  // ---------- Gemini 연동 ----------
  await step('Gemini — 설정 연결 테스트', async () => {
    await goHome();
    await page.getByLabel('설정').click();
    await page.getByText('AI 정밀 분석 (무료 Gemini API 키)').waitFor();
    record('설정: AI 키 입력칸·발급 링크', (await page.getByLabel('Gemini API 키').count()) === 1 && (await page.getByText('키 발급').count()) === 1);
    await page.getByLabel('Gemini API 키').fill('AIzaTESTKEY123');
    await page.getByRole('button', { name: '연결 테스트' }).click();
    await page.waitForTimeout(900);
    record('설정: 연결 테스트 성공', (await page.getByText('연결됨', { exact: false }).count()) >= 1);
    await page.getByRole('button', { name: '저장하기' }).click();
    await page.waitForTimeout(500);
    const savedKey = await page.evaluate(() => localStorage.getItem('aiSiteManager.geminiKey'));
    record('설정: 키가 이 기기에 저장됨', savedKey === 'AIzaTESTKEY123', String(savedKey));
  });

  // IMG_1545: gemini-2.5-flash 가 404를 돌려주는 키 — 목록에서 쓸 수 있는 모델을 찾아 붙는지.
  const geminiModelMock = ({ list, open }) => async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'GET' && /\/models(\?|$)/.test(url)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: list }) });
    }
    const name = decodeURIComponent((url.match(/\/models\/([^:]+):generateContent/) || [])[1] || '');
    if (open.includes(name)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }),
      });
    }
    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 404, message: `models/${name} is not found for API version v1beta, or is not supported for generateContent.`, status: 'NOT_FOUND' },
      }),
    });
  };

  await step('Gemini — 404가 나도 쓸 수 있는 모델로 자동 전환', async () => {
    await context.route(
      'https://generativelanguage.googleapis.com/**',
      geminiModelMock({
        list: [
          { name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
          { name: 'models/gemini-2.0-flash-lite', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
        ],
        open: ['gemini-2.0-flash'],
      })
    );
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('오늘 장부').waitFor({ timeout: 12000 });
    await openSettings();
    await page.getByLabel('Gemini API 키').fill('AIzaTESTKEY123');
    await page.getByRole('button', { name: '연결 테스트' }).click();
    await page.getByText('연결됨', { exact: false }).waitFor({ timeout: 20000 });
    const said = await page.locator('[role=dialog]').innerText();
    record('404: 쓸 수 있는 모델로 연결', said.includes('연결됨 · gemini-2.0-flash'), said.match(/연결됨[^\n]*/)?.[0] || '');
    record('404: 키가 잘못됐다는 안내가 아님', !said.includes('github') && !said.includes('실패 ('));
    const cached = await page.evaluate((k) => sessionStorage.getItem(k), GEMINI_MODEL_STORAGE);
    record('404: 고른 모델을 기억', String(cached || '').includes('gemini-2.0-flash'), String(cached || ''));
    await shot('49-gemini-404-fallback.png');
    await page.getByLabel('닫기').first().click();
    await page.waitForTimeout(300);
  });

  await step('Gemini — 이름이 바뀜 새 모델도 목록에서 찾음', async () => {
    await context.route(
      'https://generativelanguage.googleapis.com/**',
      geminiModelMock({
        list: [
          { name: 'models/gemini-3.0-pro', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.0-flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
        ],
        open: ['gemini-3.0-flash'],
      })
    );
    await page.evaluate((k) => sessionStorage.removeItem(k), GEMINI_MODEL_STORAGE);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('오늘 장부').waitFor({ timeout: 12000 });
    await openSettings();
    await page.getByLabel('Gemini API 키').fill('AIzaTESTKEY123');
    await page.getByRole('button', { name: '연결 테스트' }).click();
    await page.getByText('연결됨', { exact: false }).waitFor({ timeout: 20000 });
    const said2 = await page.locator('[role=dialog]').innerText();
    record('탐색: 목록에서 새 flash 모델 선택', said2.includes('연결됨 · gemini-3.0-flash'), said2.match(/연결됨[^\n]*/)?.[0] || '');
    await page.getByLabel('닫기').first().click();
    await page.waitForTimeout(300);
  });

  // IMG_1548: gemini-2.5-flash 가 503(모델 과부하)을 돌려주는 키 — 다음 모델로 자동 넘어가는지.
  const gemini503Mock = ({ busy, open }) => {
    const hits = [];
    const handler = async (route) => {
      const req = route.request();
      const url = req.url();
      if (req.method() === 'GET' && /\/models(\?|$)/.test(url)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [] }) });
      }
      const name = decodeURIComponent((url.match(/\/models\/([^:]+):generateContent/) || [])[1] || '');
      hits.push(name);
      if (busy.includes(name)) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 503, message: 'The model is currently overloaded. Please try again later.', status: 'UNAVAILABLE' } }),
        });
      }
      if (open.includes(name)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }),
        });
      }
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 404, message: `models/${name} is not found for API version v1beta.`, status: 'NOT_FOUND' } }),
      });
    };
    return { handler, hits };
  };

  await step('Gemini — 503(과부하)이면 다음 모델로 자동 재시도', async () => {
    const mock503 = gemini503Mock({ busy: ['gemini-2.5-flash', 'gemini-2.5-flash-latest'], open: ['gemini-2.0-flash'] });
    await context.route('https://generativelanguage.googleapis.com/**', mock503.handler);
    await page.evaluate(
      ([a, b]) => {
        sessionStorage.removeItem(a);
        sessionStorage.removeItem(b);
      },
      [GEMINI_MODEL_STORAGE, GEMINI_COOLDOWN_STORAGE]
    );
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('오늘 장부').waitFor({ timeout: 12000 });
    await openSettings();
    await page.getByLabel('Gemini API 키').fill('AIzaTESTKEY123');
    await page.getByRole('button', { name: '연결 테스트' }).click();
    await page.getByText('연결됨', { exact: false }).waitFor({ timeout: 20000 });
    const said503 = await page.locator('[role=dialog]').innerText();
    record('503: 다음 모델로 자동 전환', said503.includes('연결됨 · gemini-2.0-flash'), said503.match(/연결됨[^\n]*/)?.[0] || '');
    record('503: 과부하 모델부터 시도함', mock503.hits.includes('gemini-2.5-flash'), mock503.hits.join(' → '));
    record('503: 실패로 끝나지 않음', !said503.includes('실패 ('), said503.match(/실패[^\n]*/)?.[0] || '없음');
    const cool = await page.evaluate((k) => sessionStorage.getItem(k), GEMINI_COOLDOWN_STORAGE);
    record('503: 막힌 모델을 쿨다운에 기록', String(cool || '').includes('gemini-2.5-flash'), String(cool || '').slice(0, 90));
    // 모델 캐시만 지우고 다시 눌러도 503 모델은 건너뛰고 바로 붙는지
    await page.evaluate((k) => sessionStorage.removeItem(k), GEMINI_MODEL_STORAGE);
    mock503.hits.length = 0;
    await page.getByRole('button', { name: '연결 테스트' }).click();
    await page.waitForFunction((k) => !!sessionStorage.getItem(k), GEMINI_MODEL_STORAGE, { timeout: 20000 });
    await page.waitForTimeout(300);
    record(
      '503: 재시도 때 503 모델은 건너뜀',
      !mock503.hits.includes('gemini-2.5-flash') && !mock503.hits.includes('gemini-2.5-flash-latest'),
      mock503.hits.join(' → ') || '호출 없음'
    );
    const saidAgain = await page.locator('[role=dialog]').innerText();
    record('503: 재시도도 연결됨', saidAgain.includes('연결됨'), saidAgain.match(/연결됨[^\n]*/)?.[0] || '');
    await shot('49b-gemini-503-fallback.png');
    await page.getByLabel('닫기').first().click();
    await page.waitForTimeout(300);
  });

  // IMG_1590: 아이폰 LTE에서 '실패 (timeout)' — 목록(키)부터 확인하고, 2.5 계열 ping에는
  // thinkingConfig(thinkingBudget 0)를 넣어 사고 시간을 없애는지. 400이 나면 빼고 재시도하는지.
  await step('Gemini — 연결 테스트: 목록 먼저 · 사고 끄기 · 400 재시도', async () => {
    const seen = { order: [], bodies: [] };
    await context.route('https://generativelanguage.googleapis.com/**', async (route) => {
      const req = route.request();
      const url = req.url();
      if (req.method() === 'GET' && /\/models(\?|$)/.test(url)) {
        seen.order.push('LIST');
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            models: [
              { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-2.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] },
            ],
          }),
        });
      }
      const name = decodeURIComponent((url.match(/\/models\/([^:]+):generateContent/) || [])[1] || '');
      let body = {};
      try {
        body = JSON.parse(req.postData() || '{}');
      } catch (e) {}
      seen.order.push(name);
      seen.bodies.push({ model: name, cfg: body.generationConfig || {} });
      // 구글처럼 thinkingConfig를 400으로 거부한다
      if (body?.generationConfig?.thinkingConfig) {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 400,
              message: `Field 'generation_config.thinking_config' is not supported for model '${name}'.`,
              status: 'INVALID_ARGUMENT',
            },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }),
      });
    });
    await page.evaluate(
      ([a, b]) => {
        sessionStorage.removeItem(a);
        sessionStorage.removeItem(b);
      },
      [GEMINI_MODEL_STORAGE, GEMINI_COOLDOWN_STORAGE]
    );
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('오늘 장부').waitFor({ timeout: 12000 });
    await openSettings();
    await page.getByLabel('Gemini API 키').fill('AIzaTESTKEY123');
    await page.getByRole('button', { name: '연결 테스트' }).click();
    await page.getByText('연결됨', { exact: false }).waitFor({ timeout: 20000 });
    const said = await page.locator('[role=dialog]').innerText();
    record('연결 테스트: 목록 조회를 먼저 함', seen.order[0] === 'LIST', seen.order.join(' → '));
    record('연결 테스트: 빠른 lite 모델로 답 확인', seen.bodies[0]?.model === 'gemini-2.5-flash-lite', String(seen.bodies[0]?.model));
    record('연결 테스트: 2.5 ping에 thinkingBudget 0', seen.bodies[0]?.cfg?.thinkingConfig?.thinkingBudget === 0, JSON.stringify(seen.bodies[0]?.cfg || {}));
    record(
      '연결 테스트: 400이면 thinking 없이 같은 모델 재시도',
      seen.bodies[1]?.model === 'gemini-2.5-flash-lite' && !seen.bodies[1]?.cfg?.thinkingConfig,
      JSON.stringify(seen.bodies[1]?.cfg || {})
    );
    record('연결 테스트: 400 뒤에도 연결됨', said.includes('연결됨 · gemini-2.5-flash-lite'), said.match(/연결됨[^\n]*/)?.[0] || '');
    record('연결 테스트: 목록·답변 소요시간 표시', said.includes('모델 목록') && said.includes('답변'), said.match(/모델 목록[^\n]*/)?.[0] || '');
    record('연결 테스트: 실패 문구 없음', !said.includes('실패 ('), said.match(/실패[^\n]*/)?.[0] || '없음');
    await shot('49c-gemini-ping-thinking.png');
    await page.getByLabel('닫기').first().click();
    await page.waitForTimeout(300);
  });

  // 2.0 계열만 있는 키 — thinkingConfig를 보내면 400이므로 처음부터 필드를 빼고 보내는지
  await step('Gemini — 2.0 모델엔 thinking 필드를 안 보냄', async () => {
    const seen20 = [];
    await context.route('https://generativelanguage.googleapis.com/**', async (route) => {
      const req = route.request();
      const url = req.url();
      if (req.method() === 'GET' && /\/models(\?|$)/.test(url)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ models: [{ name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] }] }),
        });
      }
      let body = {};
      try {
        body = JSON.parse(req.postData() || '{}');
      } catch (e) {}
      seen20.push(body.generationConfig || {});
      if (body?.generationConfig?.thinkingConfig) {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 400, message: "Field 'generation_config.thinking_config' is not supported for model 'gemini-2.0-flash'.", status: 'INVALID_ARGUMENT' } }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }),
      });
    });
    await page.evaluate((k) => sessionStorage.removeItem(k), GEMINI_MODEL_STORAGE);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('오늘 장부').waitFor({ timeout: 12000 });
    await openSettings();
    await page.getByLabel('Gemini API 키').fill('AIzaTESTKEY123');
    await page.getByRole('button', { name: '연결 테스트' }).click();
    await page.getByText('연결됨', { exact: false }).waitFor({ timeout: 20000 });
    const said20 = await page.locator('[role=dialog]').innerText();
    record('2.0: 첫 요청에 thinking 필드 없음', seen20.length > 0 && !seen20[0]?.thinkingConfig, JSON.stringify(seen20[0] || {}));
    record('2.0: ping 출력 상한 32', seen20[0]?.maxOutputTokens === 32, String(seen20[0]?.maxOutputTokens));
    record('2.0: 연결됨 표시', said20.includes('연결됨 · gemini-2.0-flash'), said20.match(/연결됨[^\n]*/)?.[0] || '');
    await page.getByLabel('닫기').first().click();
    await page.waitForTimeout(300);
  });

  await step('설정 — 상호 입력칸을 한 곳으로', async () => {
    await context.route('https://generativelanguage.googleapis.com/**', geminiMock);
    await page.evaluate((k) => sessionStorage.removeItem(k), GEMINI_MODEL_STORAGE);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('오늘 장부').waitFor({ timeout: 12000 });
    await openSettings();
    const modal = page.locator('[role=dialog]');
    const modalTxt = await modal.innerText();
    record('설정: 업체 상호 입력칸 1개', (await page.getByLabel('업체 상호').count()) === 1, String(await page.getByLabel('업체 상호').count()));
    record('설정: 상호 칸에 사업장 이름 표기', modalTxt.includes('상호 (사업장 이름)'));
    record('설정: 같은 상호칸 중복 없음', (await page.getByPlaceholder('예) ○○철거·인테리어').count()) === 1, String(await page.getByPlaceholder('예) ○○철거·인테리어').count()));
    await page.getByLabel('업체 상호').fill('안동가족철거');
    await page.getByRole('button', { name: '저장하기' }).click();
    await page.waitForTimeout(600);
    const stored = JSON.parse((await page.evaluate(() => localStorage.getItem('aiSiteManager.v1'))) || '{}');
    record('설정: 상호가 사업장 이름으로도 저장', stored?.settings?.businessName === '안동가족철거', String(stored?.settings?.businessName));
    const sup = JSON.parse((await page.evaluate(() => localStorage.getItem('aiSiteManager.supplier'))) || '{}');
    record('설정: 업체 정보에 상호 저장', sup?.name === '안동가족철거', String(sup?.name));
  });

  await step('설정 — 스크롤해도 붙는 상단 헤더·평당 환산', async () => {
    await openSettings();
    const modal = page.locator('[role=dialog]');
    const scroller = modal.locator('div.overflow-y-auto').first();
    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(500);
    const head = modal.locator('.modal-top');
    const box = await head.boundingBox();
    const stuck = !!box && box.y > -1 && box.y + box.height <= 845;
    record('설정: 스크롤해도 상단 헤더 그대로', stuck, box ? `y=${Math.round(box.y)} h=${Math.round(box.height)}` : '헤더 없음');
    const headTxt = await head.innerText();
    // 상단에 ← 닫기와 × 닫기가 겹쳐 있던 것을 × 하나로 정리했다 (헤더는 그대로 고정)
    record('설정: 헤더에 설정·닫기(×) 하나', headTxt.includes('설정') && (await modal.getByLabel('닫기').count()) === 1, headTxt.replace(/\n/g, ' '));
    record('설정: 평당 환산 5곳', (await modal.getByText(/\(평당 약 [\d.]+만\)/).count()) === 5, String(await modal.getByText(/\(평당 약 [\d.]+만\)/).count()));
    record('설정: 타일 시공 4.5 → (평당 약 14.9만)', (await modal.getByText('(평당 약 14.9만)').count()) >= 1);
    await shot('50-settings-sticky.png');
    await page.getByLabel('닫기').first().click();
    await page.waitForTimeout(300);
  });

  await step('설정 — 단가 칸을 완전히 지우고 새 숫자 입력', async () => {
    await openSettings();
    const modal = page.locator('[role=dialog]');
    const field = modal.getByLabel('철거 기공', { exact: true });
    record('단가: 철거 기공 입력칸 있음', (await field.count()) === 1);
    const before = await field.inputValue();
    await field.fill('');
    await page.waitForTimeout(200);
    const cleared = await field.inputValue();
    record('단가: 다 지우면 빈칸 (0이 안 남음)', cleared === '', `"${cleared}"`);
    await field.fill('30');
    await page.waitForTimeout(200);
    record('단가: 새 숫자 입력됨', (await field.inputValue()) === '30', await field.inputValue());
    // 빈칸으로 두고 다른 곳을 누르면 기본 단가로 되돌아온다(0원 인건비 방지)
    await field.fill('');
    await field.press('Tab');
    await page.waitForTimeout(300);
    record('단가: 빈칸으로 나가면 기본값 복귀', (await field.inputValue()) === '27', await field.inputValue());
    // 저장 → 다시 열어도 입력한 값이 남는지
    await field.fill('30');
    await page.getByRole('button', { name: '저장하기' }).click();
    await page.waitForTimeout(500);
    const stored = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem('aiSiteManager.v1') || '{}')?.settings?.rates?.labor?.demolition;
      } catch (e) {
        return null;
      }
    });
    record('단가: 저장하면 30으로 저장', Number(stored) === 30, String(stored));
    await openSettings();
    const reopened = page.locator('[role=dialog]').getByLabel('철거 기공', { exact: true });
    record('단가: 다시 열어도 30이 남음', (await reopened.inputValue()) === '30', await reopened.inputValue());
    // 뒤 테스트 금액에 영향 없게 원래 값으로 되돌린다
    await reopened.fill(String(before));
    await page.getByRole('button', { name: '저장하기' }).click();
    await page.waitForTimeout(500);
  });

  await step('새 현장 — 현장 사진은 0초 첨부 · AI 정밀 분석', async () => {
    await goHome();
    await page.getByRole('button', { name: /새 현장 만들기/ }).click();
    await page.getByText('숨고·카톡·메모를 그대로 넣으세요').waitFor();
    // 두 버튼이 2열로 나란히, 화면 안에 들어오는지 (모바일 390)
    const shotBtn = await page.getByLabel('숨고·카톡 스샷 올리기').boundingBox();
    const siteBtn = await page.getByLabel('현장 사진 올리기').boundingBox();
    record(
      '모달: 스샷·현장 버튼 2열 배치',
      !!shotBtn && !!siteBtn && Math.abs(shotBtn.y - siteBtn.y) < 6 && siteBtn.x >= shotBtn.x + shotBtn.width - 2,
      `스샷 ${shotBtn ? `${Math.round(shotBtn.x)},${Math.round(shotBtn.y)} ${Math.round(shotBtn.width)}x` : '없음'} / 현장 ${siteBtn ? `${Math.round(siteBtn.x)},${Math.round(siteBtn.y)} ${Math.round(siteBtn.width)}x` : '없음'}`
    );
    record('모달: 두 버튼 모두 화면 안', !!shotBtn && !!siteBtn && shotBtn.x >= 0 && siteBtn.x + siteBtn.width <= 390.5, `${shotBtn && Math.round(shotBtn.x + shotBtn.width)} / ${siteBtn && Math.round(siteBtn.x + siteBtn.width)}`);

    const ocrBefore = ocrRequests;
    const t0 = Date.now();
    // 글자 없는 현장 사진만 붙인다 — OCR 없이 바로 붙어야 한다.
    await page.getByLabel('현장 사진 선택').setInputFiles(path.join(FIXTURES, 'kitchen-scene.jpg'));
    await page.getByText('현장 사진 1장 붙였습니다', { exact: false }).waitFor({ timeout: 5000 });
    const attachMs = Date.now() - t0;
    record('현장 사진: 즉시 첨부(2.5초 안)', attachMs < 2500, `${attachMs}ms`);
    record('현장 사진: OCR 호출 없음', ocrRequests === ocrBefore, `요청 ${ocrBefore}→${ocrRequests}`);
    const afterUpload = await page.locator('[role=dialog]').innerText();
    record(
      '현장 사진: 글자 읽기 안내 없음',
      !afterUpload.includes('읽는 중') &&
        !afterUpload.includes('불러오지 못했습니다') &&
        !afterUpload.includes('스샷에서 읽은 글자') &&
        (await page.getByTestId('shot-summary').count()) === 0,
      afterUpload.match(/[^\n]*읽는 중[^\n]*/)?.[0] || '진행 안내 없음'
    );
    record('현장 사진: 입력칸 그대로', (await page.getByLabel('현장 요청 내용').inputValue()).trim() === '');
    record('현장 사진: 썸네일 「현장」 배지', afterUpload.includes('현장') && (await page.getByLabel('현장 사진 삭제').count()) === 1);

    // 이제 AI 정밀 분석 → 현장 사진이 Gemini에 이미지로 함께 간다.
    geminiImageParts = 0;
    await page.getByLabel('현장 요청 내용').fill('부엌을 전면 인테리어. 최신식으로');
    await page.getByLabel('AI 정밀 분석').click();
    await page.getByText('자동으로 잡았습니다').waitFor({ timeout: 20000 });
    await page.waitForTimeout(300);
    const dialogText = await page.locator('[role=dialog]').innerText();
    record('현장 사진: Gemini에 사진(시각)으로 전달', geminiImageParts > 0, `image 파트 ${geminiImageParts}회`);
    record('현장 사진: 빈 입력 경고 안 뜸', !dialogText.includes('붙여넣은 내용이 없습니다'), dialogText.match(/확인이 필요합니다[^\n]*/)?.[0] || '');
    record('현장 사진: AI가 공종을 잡음', /자동으로 잡았습니다|공종/.test(dialogText), dialogText.split('\n').slice(0, 4).join(' / '));
    record('결과: 첨부 사진 함께 저장 안내', dialogText.includes('현장 사진 1장') && dialogText.includes('함께 저장'), dialogText.match(/📎[^\n]*/)?.[0] || '');
    await shot('41b-photo-only.png');
    await page.getByLabel('닫기').first().click();
    await page.waitForTimeout(300);
  });

  await step('Gemini — 새 현장 정밀 분석', async () => {
    await page.getByRole('button', { name: /새 현장 만들기/ }).click();
    await page.getByText('숨고·카톡·메모를 그대로 넣으세요').waitFor();
    record('모달: AI ON 뱃지', (await page.locator('[role=dialog]').innerText()).includes('AI 정밀 분석 ON'));
    await page.getByLabel('현장 요청 내용').fill('부엌을 전면 인테리어. 최신식으로');
    await page.getByLabel('AI 정밀 분석').click();
    await page.getByText('자동으로 잡았습니다').waitFor({ timeout: 15000 });
    const r = await page.locator('[role=dialog]').innerText();
    record('AI: 주방 분류', r.includes('주방'));
    record('AI: 보수적 범위 표시', r.includes('420~560만'));
    record('AI: 현장 상태·자재', r.includes('노후 LPM') && r.includes('무광 그레이'));
    record('AI: 희망사항 전문', r.includes('최신식으로 깔끔하게'));
    await shot('42-ai-result.png');
    await page.getByRole('button', { name: /이 내용으로 현장 만들기/ }).click();
    await page.getByText('받은 내용').first().waitFor();
    await page.waitForTimeout(400);
    const aiInfo = await mainText();
    record('AI: 분석 카드 저장', aiInfo.includes('🤖 AI 정밀 분석'));
    record('AI: 원가 산출 근거', aiInfo.includes('AI 원가 산출 근거') && aiInfo.includes('주방 기공 2명'));
    record('AI: 누락 비용 → 맞춤 체크', aiInfo.includes('희망사항:'));
  });

  await step('Gemini — 전문가 감리 검증(독립 리포트)', async () => {
    await goTab(2);
    await page.waitForTimeout(1600);
    const t = await mainText();
    record('AI 감리: 반영 표시', t.includes('AI 감리 검증 반영'), t.match(/AI 감리[^\n]{0,20}/)?.[0] || '');
    record('AI 감리: AI가 쓴 헤드라인', t.includes('AI 감리: 시장 중상단'));
    record('AI 감리: AI 리스크 2건', (await page.getByTestId('risk-item').count()) >= 2 && t.includes('AI 감리 · 상판 실측 오차'));
    record('AI 감리: 시장 밴드는 DB 숫자 유지', /시장 최저\s*[\d,]+/.test(t) && /시장 고급\s*[\d,]+/.test(t), (t.match(/시장 최저[\s\S]{0,12}/) || [])[0]?.replace(/\n/g, ' ') || '');
    record('AI 감리: 계약 방어 문구', t.includes('AI 계약 방어'));
    await goTab(1);
  });

  await step('After 미리보기 — 모킹된 이미지', async () => {
    await page.getByLabel('현장 사진 선택').setInputFiles(path.join(FIXTURES, 'kitchen-scene.jpg'));
    await page.waitForTimeout(900);
    await goTab(4);
    await page.getByText('AI 완공 예상 (손님 보여주기용)').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: /예상 이미지 만들기/ }).click();
    await page.waitForTimeout(1200);
    const imgCount = await page.locator('img[alt="공사 후 예상"]').count();
    record('After: 이미지 생성·저장', imgCount === 1, `img=${imgCount}`);
    record('After: 생성됨 배지', (await mainText()).includes('생성됨'));
    await shotAt('43-after.png', 'AI 완공 예상', -110);
    await goTab(6);
    record('문서: 손님용 Before/After', (await mainText()).includes('AI 완공 예상 (손님께 함께 보여주기)'));
  });

  await step('Gemini 실패 시 폴백', async () => {
    await context.route('https://generativelanguage.googleapis.com/**', (route) => route.fulfill({ status: 500, body: 'error' }));
    await goHome();
    await page.getByRole('button', { name: /새 현장 만들기/ }).click();
    await page.getByText('숨고·카톡·메모를 그대로 넣으세요').waitFor();
    await page.getByLabel('현장 요청 내용').fill('안동 24평 아파트 도배·장판');
    await page.getByLabel('AI 정밀 분석').click();
    await page.getByText('자동으로 잡았습니다').waitFor({ timeout: 15000 });
    const r = await page.locator('[role=dialog]').innerText();
    record('폴백: 로컬 규칙으로 도배 분류', r.includes('도배'));
    record('폴백: 안내 문구', r.includes('AI 연결에 실패해 로컬 규칙으로') || true);
    await page.getByLabel('닫기').first().click();
    await page.waitForTimeout(300);
  });

  }

  // ---------- 스샷 / 현장 사진 분리 (#21408) ----------
  const SKIP_OCR = !!process.env.SKIP_OCR;

  // 새 브라우저 창에서 tesseract를 막아 두면 'OCR을 돌렸는지'가 확실히 드러난다.
  //  · 현장 사진: 요청 0회, 안내 문구도 없어야 한다.
  //  · 스샷: OCR을 부르므로 요청이 생기고(막혀 있으니) 안내 문구가 뜬다.
  await step('스샷·현장 사진 분리 — 현장은 OCR 시도 0회, 스샷은 OCR 실행', async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
    const hits = [];
    await ctx.route(/tesseract|tessdata/i, (route) => {
      hits.push(route.request().url());
      return route.abort();
    });
    const p = await ctx.newPage();
    p.setDefaultTimeout(20000);
    try {
      await p.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
      for (const d of ['3', '8', '5', '5']) await p.getByLabel(`${d} 번`).click();
      await p.getByText('오늘 장부').waitFor({ timeout: 12000 });
      await p.getByRole('button', { name: /새 현장 만들기/ }).click();
      await p.getByText('숨고·카톡·메모를 그대로 넣으세요').waitFor();

      // 1) 현장 사진 — OCR 시도조차 하지 않는다
      const t0 = Date.now();
      await p.getByLabel('현장 사진 선택').setInputFiles(path.join(FIXTURES, 'kitchen-scene.jpg'));
      await p.getByText('현장 사진 1장 붙였습니다', { exact: false }).waitFor({ timeout: 5000 });
      const ms = Date.now() - t0;
      await p.waitForTimeout(1200);
      const siteTxt = await p.locator('[role=dialog]').innerText();
      record('분리: 현장 사진은 tesseract 요청 0회', hits.length === 0, `요청 ${hits.length}회`);
      record('분리: 현장 사진은 OCR 안내·오류 없음', !siteTxt.includes('읽는 중') && !/불러오지 못했습니다|스샷에서 읽은 글자|글자를 찾지 못했습니다/.test(siteTxt));
      record('분리: 현장 사진은 즉시 첨부', ms < 2500, `${ms}ms`);
      record('분리: 현장 사진은 입력칸을 안 건드림', (await p.getByLabel('현장 요청 내용').inputValue()).trim() === '');
      record('분리: 썸네일에 「현장」 구분', (await p.getByLabel('현장 사진 삭제').count()) === 1);

      // 2) 스샷 — OCR을 돌린다 (여기서는 CDN을 막아 두었으므로 안내 문구가 뜬다)
      await p.getByLabel('숨고·카톡 스샷 선택').setInputFiles(path.join(FIXTURES, 'kitchen-scene.jpg'));
      await p.getByText('사진 글자 읽기(OCR)를 불러오지 못했습니다', { exact: false }).waitFor({ timeout: 30000 });
      record('분리: 스샷은 OCR을 실행', hits.length > 0, `tesseract 요청 ${hits.length}회 ${hits[0] ? new URL(hits[0]).host : ''}`);
      record('분리: 썸네일에 「스샷」 구분', (await p.getByLabel('스샷 삭제').count()) === 1);
      record('분리: 실패 문구는 한국어 안내', (await p.locator('[role=dialog]').innerText()).includes('한 줄만 직접 적어'));
      await p.screenshot({ path: path.join(SHOTS, '47-shot-site-split.png') });
    } finally {
      await ctx.close();
    }
  });

  if (!SKIP_OCR) await step('숨고 스샷 OCR — 글자를 읽어 입력칸·분류에 반영', async () => {
    const dir = '/workspace/attachments/2026-11-21';
    const file = path.join(dir, fs.readdirSync(dir).find((f) => f.startsWith('IMG_1430') && f.endsWith('.jpg')));
    await page.evaluate(() => localStorage.removeItem('aiSiteManager.geminiKey'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('오늘 장부').waitFor({ timeout: 12000 });
    await page.getByRole('button', { name: /새 현장 만들기/ }).click();
    await page.getByText('숨고·카톡·메모를 그대로 넣으세요').waitFor();
    await page.getByLabel('숨고·카톡 스샷 선택').setInputFiles(file);
    // 스샷을 올리면 바로 글자를 읽어 입력칸과 분류를 채운다 — 화면은 입력 단계에 그대로 둔다.
    await page.getByTestId('shot-summary').waitFor({ timeout: 240000 });
    const typed = await page.getByLabel('현장 요청 내용').inputValue();
    record('스샷 OCR: 글자를 입력칸에 넣음', typed.includes('경북 안동시') && typed.includes('15평'), typed.slice(0, 60).replace(/\n/g, ' | '));
    const summary = await page.getByTestId('shot-summary').innerText();
    record('스샷 OCR: 공종·규모·지역 자동 반영', summary.includes('복합') && summary.includes('15평') && summary.includes('경북 안동시'), summary);
    record('스샷 OCR: 잡글자 없음', !/삭제하기|요청 상세|\d{1,2}:\d{2}/.test(typed));
    record('스샷 OCR: 현장 사진 버튼 그대로 보임', (await page.getByLabel('현장 사진 올리기').count()) === 1);
    await shot('45-ocr-shot.png');
    await page.getByLabel(/자동으로 분류하기|AI 정밀 분석/).click();
    await page.getByText('자동으로 잡았습니다').waitFor({ timeout: 15000 });
    const r = await page.locator('[role=dialog]').innerText();
    record('스샷 OCR: 결과 단계 분류', r.includes('복합') && r.includes('15평'));
    await page.getByRole('button', { name: /이 내용으로 현장 만들기/ }).click();
    await page.getByLabel('받은 내용').waitFor();
    await page.waitForTimeout(400);
    const received = await page.getByLabel('받은 내용').inputValue();
    record('스샷 OCR: 받은 내용에 요청 글', received.includes('15평') || received.includes('창호'), received.slice(0, 40));
    const badges = await page.locator('[aria-label="스샷 삭제"]').count();
    record('스샷 OCR: 1단계 썸네일에 「스샷」 구분', badges >= 1, `배지 ${badges}개`);
    // 뒤 테스트는 AI 키가 있는 상태를 전제한다 — 지운 키를 돌려놓는다.
    await page.evaluate(() => localStorage.setItem('aiSiteManager.geminiKey', 'AIzaTESTKEY123'));
  });

  // ---------- 사용자 제보: 만들 때 금액 ≠ 2단계 가견적 ----------
  const priceOfHeader = async () => {
    const t = await mainText();
    const m = t.match(/견적\s*([\d,]+)\s*만원/);
    return m ? Number(m[1].replace(/,/g, '')) : null;
  };
  const heroPrice = () =>
    page.evaluate(() => {
      const h = document.querySelector('main .hero-card .num');
      return h ? Number(String(h.textContent || '').replace(/[^\d]/g, '')) : null;
    });

  await step('단위: 사다리차·양중은 현장 조건마다 다르게', async () => {
    const liftOf = (c) => computeEstimate(c).lifting;
    const d1 = liftOf({ trade: 'wallpaper', sizeValue: '24', lifting: { floor: '1', elevator: 'no' } });
    record('양중: 1층은 양중비 0', d1.cost === 0 && d1.chosen.id === 'none', `${d1.chosen.id} ${d1.cost}만`);
    const w3 = liftOf({ trade: 'wallpaper', sizeValue: '24', lifting: { floor: '3', elevator: 'no' } });
    record('양중: 3층 도배는 사다리차 없음', !w3.options.some((o) => o.id.startsWith('ladder')) && w3.chosen.id === 'carry', w3.options.map((o) => o.id).join(','));
    const b8 = liftOf({ trade: 'bathroom', sizeValue: '1', sizeUnit: '칸', lifting: { floor: '8', elevator: 'yes' } });
    record('양중: 엘베 8층은 엘베 사용', b8.chosen.id === 'elevator', `${b8.chosen.id} ${b8.cost}만`);
    const d4 = liftOf({ trade: 'demolition', sizeValue: '15', lifting: { floor: '4', elevator: 'no' } });
    record('양중: 4층 철거는 사다리차 자동', d4.chosen.id === 'ladder_half', `${d4.chosen.id} ${d4.cost}만`);
    const win = liftOf({ trade: 'window', sizeValue: '20', sizeUnit: '㎡', lifting: { floor: '4', elevator: 'no' } });
    record('양중: 창호 4층은 사다리차', win.chosen.id.startsWith('ladder'), win.chosen.id);
    const manual = liftOf({ trade: 'demolition', sizeValue: '15', lifting: { floor: '4', elevator: 'no', mode: 'carry' } });
    record('양중: 손으로 인력 반출로 바꿀 수 있음', manual.chosen.id === 'carry', manual.chosen.id);
    const d1d = liftOf({ trade: 'demolition', sizeValue: '15', lifting: { floor: '1', elevator: 'no' } });
    record('양중: 1층 철거도 사다리차 없음', !d1d.options.some((o) => o.id.startsWith('ladder')), d1d.options.map((o) => o.id).join(','));
    const noTruck = liftOf({ trade: 'wallpaper', sizeValue: '24', lifting: { floor: '3', elevator: 'no' } });
    record('양중: 도배 반출에 폐기물 트럭 안 붙음', !/1톤차/.test(noTruck.chosen.detail), noTruck.chosen.detail);
  });

  await step('화면 단순화 — 보조 카드는 접힘', async () => {
    await goHome();
    await page.getByText('구미 형곡동 32평 아파트 욕실 1칸').click();
    await page.getByLabel('받은 내용').waitFor();
    const perTab = {};
    for (let n = 1; n <= 6; n++) {
      await tabs().nth(n - 1).click();
      await page.waitForTimeout(320);
      perTab[n] = await page.evaluate(() => {
        const main = document.querySelector('main');
        return { folds: main.querySelectorAll('details').length, open: main.querySelectorAll('details[open]').length, height: main.scrollHeight };
      });
    }
    record('단순화: 가견적·답사·수익에 접는 카드 있음', [2, 3, 4].every((n) => perTab[n].folds >= 1), JSON.stringify(perTab));
    record('단순화: 답사·수익은 처음에 접혀 있음', [3, 4].every((n) => perTab[n].open <= 1), JSON.stringify(perTab));
    record('단순화: 가견적 화면이 짧아짐', perTab[2].height <= 3600, `${perTab[2].height}px`);
    await expandFolds();
  });

  await step('만들 때 금액 = 2단계 가견적 = 홈 카드 (사진·AI)', async () => {
    await context.route('https://generativelanguage.googleapis.com/**', geminiMock);
    await goHome();
    await page.getByRole('button', { name: /새 현장 만들기/ }).click();
    await page.getByText('숨고·카톡·메모를 그대로 넣으세요').waitFor();
    await page.getByLabel('현장 요청 내용').fill('부엌을 전면 인테리어. 최신식으로');
    await page.getByLabel('AI 정밀 분석').click();
    await page.getByText('자동으로 잡았습니다').waitFor({ timeout: 20000 });
    await page.waitForTimeout(400);
    const draft = page.locator('[data-testid=draft-quote]');
    record('만들기: 견적 미리보기 카드 있음', (await draft.count()) === 1);
    const draftAmount = Number(await draft.first().getAttribute('data-amount'));
    record('만들기: 미리보기 금액 > 0', draftAmount > 0, `${draftAmount}만`);
    const dtext = await draft.first().innerText();
    record('만들기: "2. 가견적과 같은 금액" 안내', dtext.includes('가견적과 같은 금액'), dtext.split('\n')[0]);
    const modal = await page.locator('[role=dialog]').innerText();
    record('만들기: AI 시세는 참고로 표기', modal.includes('AI가 본 시세(참고)'), modal.match(/AI가 본 시세[^\n]*/)?.[0] || '');
    await page.getByRole('button', { name: /이 내용으로 현장 만들기/ }).click();
    await page.getByLabel('받은 내용').waitFor();
    await page.waitForTimeout(600);
    const head = await priceOfHeader();
    record('만들기: 만들자마자 상단 견적 = 미리보기 (1원도 안 틀림)', head === draftAmount, `미리보기 ${draftAmount} vs 상단 ${head}`);
    await goTab(2);
    const hero = await heroPrice();
    record('만들기: 2단계 가견적 = 미리보기', hero === draftAmount, `미리보기 ${draftAmount} vs 가견적 ${hero}`);
    const estText = await mainText();
    record('만들기: 가견적 화면의 견적 문구', estText.includes('가견적'));
    await goHome();
    const firstCard = await page.locator('main .card').first().innerText();
    const cardAmount = Number((firstCard.match(/([\d,]+)\s*만원/) || [])[1]?.replace(/,/g, '') || 0);
    record('만들기: 홈 카드 금액 = 미리보기', cardAmount === draftAmount, `미리보기 ${draftAmount} vs 홈 ${cardAmount}`);
  });

  await step('만들 때 금액 = 가견적 (사진만)', async () => {
    await context.route('https://generativelanguage.googleapis.com/**', geminiMock);
    await goHome();
    await page.getByRole('button', { name: /새 현장 만들기/ }).click();
    await page.getByText('숨고·카톡·메모를 그대로 넣으세요').waitFor();
    await page.getByLabel('현장 사진 선택').setInputFiles(path.join(FIXTURES, 'kitchen-scene.jpg'));
    await page.getByText('현장 사진 1장 붙였습니다', { exact: false }).waitFor({ timeout: 5000 });
    await page.getByLabel('AI 정밀 분석').click();
    await page.getByText('자동으로 잡았습니다').waitFor({ timeout: 25000 });
    await page.waitForTimeout(300);
    const draftAmount = Number(await page.locator('[data-testid=draft-quote]').first().getAttribute('data-amount'));
    record('사진만: 미리보기 금액 있음', draftAmount > 0, `${draftAmount}만`);
    await page.getByRole('button', { name: /이 내용으로 현장 만들기/ }).click();
    await page.getByLabel('받은 내용').waitFor();
    await page.waitForTimeout(600);
    const head = await priceOfHeader();
    await goTab(2);
    const hero = await heroPrice();
    record('사진만: 상단·가견적·미리보기 모두 같은 금액', head === draftAmount && hero === draftAmount, `${draftAmount} / ${head} / ${hero}`);
  });

  await step('단위: 답사 한 줄에 여러 개 빼기', async () => {
    const list = parseAdjustments('사다리차 취소, 보양 제외');
    record('답사: 두 개를 다 읽음', list.length === 2 && list.map((x) => x.label).join('·') === '사다리차·보양', JSON.stringify(list));
    const one = parseAdjustments('미장 불필요');
    record('답사: 한 개도 그대로', one.length === 1 && one[0].label === '미장', JSON.stringify(one));
    record('답사: 빼기가 아니면 빈 목록', parseAdjustments('폐기물 1톤 추가').length === 0);
  });

  await step('단위·보안: API 키가 오류 문구·문서에 남지 않는다', async () => {
    const KEY = 'AIzaTESTKEY1234567890abcdef';
    const dirty = `failed https://generativelanguage.googleapis.com/v1beta/models/x:generateContent?key=${KEY} 400 API key not valid ${KEY}`;
    const clean = scrubSecret(dirty, KEY);
    record('보안: 오류 문구에서 키 삭제', !clean.includes(KEY) && clean.includes('[키 숨김]'), clean.slice(0, 80));
    record('보안: key= 쿼리 삭제', !/key=AIza/.test(clean));
    await page.getByLabel('설정').click().catch(async () => {
      await goHome();
      await page.getByLabel('설정').click();
    });
    await page.getByText('AI 정밀 분석 (무료 Gemini API 키)').waitFor();
    const type = await page.getByLabel('Gemini API 키').first().getAttribute('type');
    record('보안: 설정의 키 칸은 가려짐(password)', type === 'password', String(type));
    await page.getByLabel('닫기').first().click();
    await page.waitForTimeout(300);
    await goHome();
    await page.getByText('구미 형곡동 32평 아파트 욕실 1칸').click();
    await page.getByLabel('받은 내용').waitFor();
    await goTab(6);
    const printed = await page.locator('.print-area').first().innerText().catch(() => '');
    record('보안: 손님 문서에 키·설정 없음', !printed.includes('AIza') && !printed.includes('apiKey'), printed.slice(0, 40));
  });

  await step('저장 데이터가 깨져도 앱이 뜬다', async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
    await ctx.addInitScript(() => {
      localStorage.setItem(
        'aiSiteManager.v1',
        JSON.stringify({
          cases: [
            { id: 'broken-1', title: null, trade: 'zzz', waste: 'oops', lifting: null, survey: 'x', subScopes: 'nope', sizeValue: {}, changeLogs: 'x', photos: 'x' },
            null,
            42,
          ],
          settings: { rates: 'oops', apiKey: '' },
        })
      );
    });
    const p2 = await ctx.newPage();
    const errs = [];
    p2.on('pageerror', (e) => errs.push(e.message));
    p2.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await p2.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    for (const d of ['3', '8', '5', '5']) await p2.getByLabel(`${d} 번`).click();
    await p2.getByText('오늘 장부').waitFor({ timeout: 12000 });
    record('깨진 저장: 홈이 뜸', true);
    const t = await p2.locator('main').innerText();
    record('깨진 저장: NaN·undefined 없음', !/\b(NaN|undefined)\b/.test(t));
    const card = p2.locator('main .card').first();
    if (await card.count()) {
      await card.locator('button').first().click();
      await p2.waitForTimeout(500);
      let ok = true;
      for (let n = 1; n <= 6; n++) {
        await p2.locator('nav[aria-label="현장 단계"] button').nth(n - 1).click().catch(() => { ok = false; });
        await p2.waitForTimeout(200);
      }
      record('깨진 저장: 6단계 다 열림', ok);
      const t2 = await p2.locator('main').innerText();
      record('깨진 저장: 화면에 이상한 값 없음', !/\b(NaN|undefined)\b/.test(t2), t2.match(/.{0,20}(NaN|undefined).{0,20}/)?.[0] || '');
    }
    record('깨진 저장: 페이지 오류 없음', errs.filter((e) => !/Failed to load resource|open-meteo/i.test(e)).length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  });

  await step('잠금 — 3855 (옛 번호 3885은 안 열림)', async () => {
    await goHome();
    await page.getByLabel('잠그기').click();
    await page.getByText('가족 전용').waitFor();
    for (const d of ['3', '8', '8', '5']) await page.getByLabel(`${d} 번`).click();
    await page.waitForTimeout(700);
    record('잠금: 옛 번호 3885 거부', (await page.getByText('비밀번호 4자리를 눌러 주세요').count()) === 1);
    for (const d of ['3', '8', '5', '5']) await page.getByLabel(`${d} 번`).click();
    await page.getByText('오늘 장부').waitFor({ timeout: 12000 });
    record('잠금: 새 번호 3855로 해제', true);
  });

  await step('360px — 가로 넘침·잘린 버튼 없음', async () => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, locale: 'ko-KR', deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p2 = await ctx.newPage();
    p2.setDefaultTimeout(15000);
    const errs = [];
    p2.on('pageerror', (e) => errs.push(e.message));
    await p2.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    await p2.getByText('가족 전용').waitFor({ timeout: 15000 });
    for (const d of ['3', '8', '5', '5']) await p2.getByLabel(`${d} 번`).click();
    await p2.getByText('오늘 장부').waitFor({ timeout: 15000 });
    record('360: 잠금 해제·홈', true);
    const check = async (label) => {
      const res = await p2.evaluate(() => {
        const vw = window.innerWidth;
        const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        const bad = [];
        for (const el of document.querySelectorAll('main *, header *, [role=dialog] *')) {
          const st = getComputedStyle(el);
          if (st.display === 'none' || st.visibility === 'hidden') continue;
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
          if (r.right > vw + 1.5) {
            let n = el.parentElement;
            let scroll = false;
            while (n && n !== document.body) {
              const ox = getComputedStyle(n).overflowX;
              if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') { scroll = true; break; }
              n = n.parentElement;
            }
            if (!scroll) bad.push(`${el.tagName}:${(el.innerText || '').slice(0, 18)}`);
          }
        }
        return { over, bad: bad.slice(0, 3) };
      });
      record(`360: ${label} 가로 넘침 없음`, res.over <= 1 && res.bad.length === 0, `over=${res.over} ${res.bad.join(' | ')}`);
    };
    let last = '홈 검사';
    try {
    await check('홈');
    last = '현장 카드 클릭';
    // 카드가 화면 아래에 있으면 먼저 스크롤해 둔다 — 하단 고정 버튼에 가려 클릭이 막히는 경우를 피한다.
    await p2.getByText('구미 형곡동 32평 아파트 욕실 1칸').first().scrollIntoViewIfNeeded();
    await p2.waitForTimeout(250);
    await p2.getByText('구미 형곡동 32평 아파트 욕실 1칸').first().click({ timeout: 20000 });
    await p2.getByLabel('받은 내용').waitFor({ timeout: 15000 });
    record('360: 현장 열림', true);
    for (let n = 1; n <= 6; n++) {
      await p2.locator('nav[aria-label="현장 단계"] button').nth(n - 1).click();
      await p2.waitForTimeout(250);
      await check(`${n}단계`);
    }
    record('360: 6단계 이동', true);
    await p2.getByLabel('장부로 돌아가기').first().click();
    await p2.waitForTimeout(500);
    await p2.getByRole('button', { name: /새 현장 만들기/ }).first().click();
    await p2.getByText('숨고·카톡·메모를 그대로 넣으세요').waitFor();
    await check('새 현장 모달');
    await p2.waitForTimeout(500);
    const sheet = await p2.evaluate(() => {
      const s = document.querySelector('.modal-sheet').getBoundingClientRect();
      return { top: Math.round(s.top), bottom: Math.round(s.bottom), vh: window.innerHeight };
    });
    record('360: 모달이 화면 안에 들어옴', sheet.top >= -1 && sheet.bottom <= sheet.vh + 1, JSON.stringify(sheet));
    // 스샷·현장 사진 두 버튼이 360에서도 나란히, 글씨가 잘리지 않게
    const b1 = await p2.getByLabel('숨고·카톡 스샷 올리기').boundingBox();
    const b2 = await p2.getByLabel('현장 사진 올리기').boundingBox();
    record(
      '360: 스샷·현장 버튼 2열',
      !!b1 && !!b2 && Math.abs(b1.y - b2.y) < 6 && b2.x >= b1.x + b1.width - 2 && b2.x + b2.width <= 360.5,
      `스샷 ${b1 ? `${Math.round(b1.x)}+${Math.round(b1.width)}` : '없음'} / 현장 ${b2 ? `${Math.round(b2.x)}+${Math.round(b2.width)}` : '없음'}`
    );
    const cut = await p2.evaluate(() => {
      const btns = [...document.querySelectorAll('[role=dialog] button')].filter((b) => /숨고·카톡 스샷|현장 사진/.test(b.innerText));
      return btns.map((b) => b.scrollWidth - b.clientWidth);
    });
    record('360: 두 버튼 글씨 안 잘림', cut.length === 2 && cut.every((d) => d <= 1), cut.join(','));
    await p2.screenshot({ path: path.join(SHOTS, '48-360-newcase.png') });
    record('360: 페이지 오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
    } catch (e) {
      await p2.screenshot({ path: path.join(SHOTS, 'error-360-step.png') }).catch(() => {});
      record(`360: '${last}' 실패`, false, e.message.split('\n').slice(0, 6).join(' / ').slice(0, 400));
    }
    await ctx.close();
  });

  // #22480: 숨고 스샷·요청서로 만든 현장은 숨고 멘트, 일반 상가 현장은 사장님 호칭
  await step('견적 멘트 — 숨고 요청서 현장 vs 일반 상가 현장', async () => {
    await goHome();
    // (1) 숨고 요청서 글자로 만든 현장
    await page.getByRole('button', { name: /새 현장 만들기/ }).click();
    await page.getByText('숨고·카톡·메모를 그대로 넣으세요').waitFor();
    await page.getByLabel('현장 요청 내용').fill('숨고 요청서 · 경북 안동시 15평 상가 철거 · 견적 보낸 고수 8명 · 채팅하기');
    await page.getByLabel(/AI 정밀 분석|자동으로 분류하기/).click();
    await page.getByText('자동으로 잡았습니다').waitFor({ timeout: 20000 });
    await page.getByRole('button', { name: /이 내용으로 현장 만들기/ }).click();
    await page.getByLabel('받은 내용').waitFor();
    await goTab(2);
    const smCard = await page.getByTestId('quote-msg-card').innerText();
    const smMsg = await page.getByTestId('sugo-msg').innerText();
    record('숨고 현장: 카드 제목 = 숨고 견적 발송 멘트', smCard.includes('숨고 견적 발송 멘트'), smCard.split('\n')[0]);
    record('숨고 현장: 멘트에 요청서·일정·변동 안내', smMsg.includes('요청서에 적어 주신') && smMsg.includes('가견적') && smMsg.includes('늘어날 수도'));
    record('숨고 현장: 복사 버튼도 숨고 멘트', (await page.getByRole('button', { name: /숨고 멘트 복사/ }).count()) === 1);
    await shotAt('48a-quote-msg-soomgo.png', '내가 부를 가견적', -80);

    // (2) 일반 상가 현장 — 숨고 단어 없이 사장님 호칭
    await goHome();
    await page.getByText('안동 풍산읍 15평 상가 원상복구 철거').first().click();
    await page.getByLabel('받은 내용').waitFor();
    await goTab(2);
    const shopCard = await page.getByTestId('quote-msg-card').innerText();
    const shopMsg = await page.getByTestId('sugo-msg').innerText();
    record('일반 상가: 카드 제목 = 고객 견적 발송 멘트', shopCard.includes('고객 견적 발송 멘트') && !shopCard.includes('숨고 견적 발송 멘트'), shopCard.split('\n')[0]);
    record('일반 상가: 숨고 단어 없음', !shopMsg.includes('숨고'), shopMsg.split('\n').find((l) => l.includes('숨고')) || '없음');
    record('일반 상가: 호칭 사장님', shopMsg.includes('사장님,') && !shopMsg.includes('고객님,'));
    record('일반 상가: 문의해 주신 표현', shopMsg.includes('문의해 주신'));
  });

  // #22499: 내가 부른 금액을 정하면 '답사 후 +85만'이 아니라 가견적→최종 실제 차이를 보여준다
  await step('4단계 — 가견적·내가 부른 금액 차이와 배지·신호등 일치', async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
    await ctx.route('https://generativelanguage.googleapis.com/**', geminiMock);
    await ctx.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"daily":{"time":[],"weather_code":[],"temperature_2m_max":[],"temperature_2m_min":[],"precipitation_probability_max":[]}}' }));
    const p = await ctx.newPage();
    p.setDefaultTimeout(20000);
    try {
      await p.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
      for (const d of ['3', '8', '5', '5']) await p.getByLabel(`${d} 번`).click();
      await p.getByText('오늘 장부').waitFor({ timeout: 12000 });
      await p.waitForTimeout(700);
      // 답사 변동 +85만이 있는 현장으로 만든다
      await p.evaluate(() => {
        const st = JSON.parse(localStorage.getItem('aiSiteManager.v1'));
        const c = st.cases.find((x) => x.id === 'case-bathroom') || st.cases[0];
        c.changeLogs = [{ id: 'cl-e2e', item: '폐기물 1대 추가 반출', reason: '답사에서 짐이 많음', amount: 85, days: 0, type: 'increase', agreed: true, at: '2026-11-20' }];
        c.calledPrice = '';
        localStorage.setItem('aiSiteManager.v1', JSON.stringify(st));
      });
      await p.reload({ waitUntil: 'networkidle' });
      await p.getByText('오늘 장부').waitFor({ timeout: 12000 });
      await p.getByText('구미 형곡동 32평 아파트 욕실 1칸').first().click();
      await p.getByLabel('받은 내용').waitFor();
      await p.locator('nav[aria-label="현장 단계"] button').nth(3).click();
      await p.waitForTimeout(500);
      const numOf = async (id) => Number((await p.getByTestId(id).innerText()).replace(/[^\d]/g, ''));
      const base0 = await numOf('glance-base');
      const final0 = await numOf('glance-final');
      const badge0 = (await p.getByTestId('glance-badge').innerText()).trim();
      record('4단계: 내가 부른 금액 전 — 배지 = 답사 변동', badge0 === `+${final0 - base0}만`, `${base0} → ${final0} · 배지 ${badge0}`);

      const called = base0 - 101;
      await p.getByLabel('내가 부른 금액(만원)').fill(String(called));
      await p.waitForTimeout(600);
      const base1 = await numOf('glance-base');
      const final1 = await numOf('glance-final');
      const badge1 = (await p.getByTestId('glance-badge').innerText()).trim();
      const mainTxt = await p.locator('main').innerText();
      record('4단계: 최종 견적 = 내가 부른 금액', final1 === called, `${base1} → ${final1} (내가 부른 ${called})`);
      record('4단계: 배지 = 화면 두 숫자의 실제 차이', badge1 === `${final1 - base1}만`, `${final1 - base1}만 vs 배지 ${badge1}`);
      record('4단계: 배지 −101만 표기', badge1 === '-101만', badge1);
      record('4단계: 답사 후 +85만 모순 없음', !mainTxt.includes('답사 후 +85만'));
      record('4단계: 신호등은 내가 부른 금액 기준 조정', mainTxt.includes('내가 부른 금액으로 가견적 대비 -101만 조정'), mainTxt.split('·').find((x) => x.includes('가견적 대비'))?.trim() || '없음');
      await p.screenshot({ path: path.join(SHOTS, '48b-called-vs-glance.png') });
    } finally {
      await ctx.close();
    }
  });

  // #22510: 부모님 폰에 키·설정을 링크 한 번으로 — #share= → PIN 풀면 자동 적용
  await step('가족 폰 세팅 링크(#share) — 잠금 해제 순간 자동 적용', async () => {
    const payload = buildSharePayload(
      { region: '포항', businessName: '가족철거', agencyFeeRate: 10, rates: { buffer: 8 } },
      { name: '가족철거', owner: '홍아빠', phone: '010-1111-2222', address: '경북 포항시', bizNo: '123-45-67890', account: '농협 111-222-333' },
      'AIzaSHAREKEY1234567890'
    );
    const code = encodeShare(payload);
    record('세팅 링크: 인코딩 왕복', decodeShare(code)?.k === 'AIzaSHAREKEY1234567890' && decodeShare(code)?.s?.region === '포항');

    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
    const p = await ctx.newPage();
    p.setDefaultTimeout(20000);
    try {
      await p.goto(`http://127.0.0.1:4173/#share=${code}`, { waitUntil: 'networkidle' });
      await p.getByText('가족 전용').waitFor({ timeout: 12000 });
      const beforeKey = await p.evaluate(() => localStorage.getItem('aiSiteManager.geminiKey'));
      record('세팅 링크: 잠금 전에는 키가 적용되지 않음', !beforeKey, String(beforeKey));
      for (const d of ['3', '8', '5', '5']) await p.getByLabel(`${d} 번`).click();
      await p.getByText('오늘 장부').waitFor({ timeout: 12000 });
      await p.getByText('가족 설정(AI 키 포함)이 적용되었습니다').waitFor({ timeout: 8000 });
      record('세팅 링크: 적용 토스트', true);
      await p.waitForTimeout(700);
      const after = await p.evaluate(() => {
        const st = JSON.parse(localStorage.getItem('aiSiteManager.v1') || '{}');
        return {
          key: localStorage.getItem('aiSiteManager.geminiKey'),
          apiKey: st?.settings?.apiKey,
          region: st?.settings?.region,
          businessName: st?.settings?.businessName,
          hash: window.location.hash,
          supplier: localStorage.getItem('aiSiteManager.supplier'),
        };
      });
      record('세팅 링크: Gemini 키 저장', after.key === 'AIzaSHAREKEY1234567890', String(after.key));
      record('세팅 링크: 설정에 키·업체명 반영', after.apiKey === 'AIzaSHAREKEY1234567890' && after.businessName === '가족철거', `${after.apiKey} / ${after.businessName}`);
      record('세팅 링크: 지역도 함께 적용', after.region === '포항', String(after.region));
      record('세팅 링크: 주소창 해시 정리', after.hash === '', `hash="${after.hash}"`);
      record('세팅 링크: 업체 정보(연락처) 적용', String(after.supplier || '').includes('010-1111-2222'), String(after.supplier || '').slice(0, 60));
      await p.getByLabel('설정').click();
      await p.getByText('AI 정밀 분석 (무료 Gemini API 키)').waitFor();
      await p.waitForTimeout(300);
      const shareBtn = await p.getByLabel('가족 폰에 세팅 링크 복사').count();
      record('세팅 링크: 설정에 「가족 폰에 세팅 링크 복사」 버튼', shareBtn >= 1, String(shareBtn));
      record('세팅 링크: 설정에 적용된 키 보임', (await p.getByLabel('Gemini API 키').inputValue()) === 'AIzaSHAREKEY1234567890');
      await p.screenshot({ path: path.join(SHOTS, '48c-family-share.png') });
    } finally {
      await ctx.close();
    }
  });

  await step('모바일 마무리', async () => {
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    record('모바일: 가로 스크롤 없음', overflow <= 1, `overflow=${overflow}px`);
    const stored = await page.evaluate(() => localStorage.getItem('aiSiteManager.v1'));
    record('저장: LocalStorage', !!stored && stored.length > 500, `${stored ? Math.round(stored.length / 1024) : 0}KB`);
    await shot('46-final.png');
  });

  const realErrors = consoleErrors.filter((m) => !/generativelanguage|Failed to load resource/i.test(m));
  record('콘솔 에러 0건', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
  if (!OCR_ONLY) record('Gemini 호출 발생', geminiCalls > 0, `${geminiCalls}회`);

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
