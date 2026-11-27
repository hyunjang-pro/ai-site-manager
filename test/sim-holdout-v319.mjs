// v3.19 Holdout — 엔진을 만들 때 **쓰지 않은** 실전 문장 90건을 한 번에 돌린다.
// 실행: node test/sim-holdout-v319.mjs   (결과: screenshots/sim-holdout-v319.json)
//
// 이 파일의 문장은 v3.19 리팩토링(구조화 파서 → 일감 명세 → 4축 적산)을 만들면서
// 한 번도 예시로 쓰지 않은 것이다. 케이스별 예외 코드를 넣지 않고도 통과해야 한다.
//
// 판정 기준(시세) — v3.13~v3.18 테스트와 같은 공개 자료
//  · 상가 원상복구: 안동·지방 평당 22~25만(중간 23) / 청년철거 32평 810만 / 무촌철거 18~28만
//  · 주거 마감 철거: 평당 15~20만 (아파트 24평 280~480)
//  · 욕실: 철거만 60~160만/칸, 올수리 380~700만/칸, 타일만 250~400만, 2칸 올수리 700~1350만
//  · 주방: 싱크대 3m 교체 300~560만, 상판만 100~220만
//  · 도배: 24평 합지 150~330만 / 장판 1.8T 2만·2.2T 2.1만·4.5T 2.6만·강마루 15만/평
//  · 타일: 2.7~7.7만/㎡ (자재+시공), 방수 3.4만/㎡
//  · 폐기물: 차량 실비 반차 26만·1톤 42.5만·2.5톤 75만 + 올바로 3만 + 진행비 10~15%
//    → 반차 30~35 · 1톤 45~55 · 2.5톤 85~95
//  · 인력: 1명 1일 청구 26만(기능공 32만)
//  · 사다리차 12~65만(층별) · 스카이 반나절 45만 · 미니굴삭기 25~40만/일
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyRequest } from '../src/lib/classify.js';
import { composeCase } from '../src/lib/storage.js';
import { computeEstimate } from '../src/lib/pricing.js';
import { isDemoOnlyText } from '../src/lib/scope.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'screenshots', 'sim-holdout-v319.json');

// [요청문, 허용 공종, 고객가 범위(만원), 조건]
const CASES = [
  // ── A. 상가·사무실 원상복구·해체 (12) ─────────────────────────────
  ['안동 시내 카페 16평 원상복구 해주세요', ['demolition'], [300, 470], {}],
  ['경북 안동 학원 22평 전부 철거하고 원상복구', ['demolition'], [400, 620], {}],
  ['예천 사무실 18평 원상복구 견적 문의', ['demolition'], [300, 560], { region: '예천' }],
  ['상가 12평 폐업해서 다 뜯어내고 빈 공간으로', ['demolition'], [230, 420], {}],
  ['식당 40평 통째로 철거 (주방기구 포함)', ['demolition', 'combined'], [700, 1300], {}],
  ['마트 25평 천장까지 전부 철거', ['demolition'], [450, 750], {}],
  ['학원 교실 6개 칸막이벽 철거 30평', ['demolition', 'combined'], [120, 400], {}], // 칸막이 6면(18m) 해체+반출 — 건물 전체 철거가 아니다
  ['병원 15평 원상복구, 폐기물 처리 포함', ['demolition'], [280, 430], {}],
  ['안동 상가건물 3층 20평 원상복구 (엘베 없음)', ['demolition'], [350, 640], { floor: 3 }],
  ['노래방 18평 원상복구 철거', ['demolition'], [330, 520], {}],
  ['공장 창고 50평 철거', ['demolition'], [800, 1600], {}],
  ['옛날 한옥 단독주택 20평 완파 철거', ['demolition'], [500, 1200], {}],

  // ── B. 주거 철거·마감 철거 (10) ──────────────────────────────────
  ['24평 아파트 전체 철거 (입주 전)', ['demolition'], [280, 480], {}],
  ['32평 아파트 장판 벽지 모두 뜯기', ['demolition'], [90, 240], { demoOnly: true }], // 마감 철거는 평당 3~6만
  ['아파트 18평 샷시랑 문짝만 철거', ['demolition'], [40, 160], { demoOnly: true }], // 1짝+문 1개는 최소 출동 기준
  ['원룸 6평 장판 뜯고 벽지 뜯기', ['demolition'], [25, 110], { demoOnly: true }],
  ['아파트 34평 천장 텍스 전체 철거', ['demolition'], [180, 360], {}],
  ['24평 아파트 붙박이장 3개 철거', ['demolition'], [60, 160], {}],
  ['아파트 안방 화장실 1칸 철거', ['bathroom'], [80, 180], { demoOnly: true }],
  ['30평 아파트 바닥 데코타일 전체 철거', ['demolition'], [80, 250], {}], // 데코타일 철거 2.4~2.8만/㎡ 도급 기준
  ['오피스텔 12평 원상복구 해주세요', ['demolition'], [200, 400], {}],
  ['아파트 45평 전체 철거, 폐기물 포함', ['demolition'], [600, 1000], {}],

  // ── C. 욕실·주방 (10) ───────────────────────────────────────────
  ['욕실 1칸 올수리 600각 타일로', ['bathroom'], [420, 700], {}],
  ['화장실 2칸 전체 리모델링', ['bathroom'], [700, 1350], {}],
  ['욕실 하나 타일만 새로 (도기 그대로)', ['bathroom', 'tilewaterproof'], [200, 420], {}],
  ['주방 싱크대 3.5m 교체하고 상판도 교체', ['kitchen'], [330, 600], {}],
  ['주방 상판만 인조대리석으로 교체', ['kitchen'], [90, 230], {}],
  ['싱크대 철거만 하고 새로 안 함', ['kitchen', 'demolition'], [20, 80], { demoOnly: true }],
  ['노후 아파트 주방 전면 교체 2.7m', ['kitchen'], [330, 560], {}], // 싱크대 3m 300~560 기준을 2.7m로 환산
  ['화장실 변기랑 세면대만 교체', ['repair', 'plumbing', 'bathroom'], [40, 130], {}],
  ['욕실 1칸 철거만 (타일·도기 다 뜯기)', ['bathroom'], [70, 170], { demoOnly: true }],
  ['주방 타일 벽 12㎡ 새로 시공', ['tilewaterproof'], [90, 250], {}],

  // ── D. 도배·바닥 (10) ───────────────────────────────────────────
  ['24평 아파트 실크벽지 도배', ['wallpaper'], [200, 400], {}],
  ['15평 원룸 도배만', ['wallpaper'], [140, 300], {}],
  ['30평 아파트 장판 1.8T 시공', ['wallpaper'], [180, 330], {}],
  ['아파트 32평 강마루 시공', ['wallpaper'], [400, 700], {}],
  ['상가 20평 데코타일 시공', ['wallpaper'], [180, 350], {}],
  ['장판만 갈고 싶어요 18평', ['wallpaper'], [110, 250], {}],
  ['아파트 24평 도배·장판 한번에', ['wallpaper'], [280, 480], {}],
  ['원룸 8평 벽지랑 장판 새로', ['wallpaper'], [90, 220], {}],
  ['34평 아파트 4.5T 장판 시공', ['wallpaper'], [240, 430], {}],
  ['아파트 24평 기존 장판 철거 후 새 장판', ['wallpaper'], [180, 340], {}],

  // ── E. 타일·방수·창호·필름·도장 (12) ────────────────────────────
  ['옥상 30평 우레탄 방수', ['tilewaterproof'], [280, 520], {}],
  ['베란다 방수 5㎡', ['tilewaterproof'], [60, 160], {}],
  ['외벽 20평 발수 코팅', ['repair', 'tilewaterproof'], [120, 300], {}],
  ['발코니 샷시 교체 6㎡', ['window'], [220, 420], {}],
  ['아파트 거실·안방 샷시 8㎡ 교체', ['window'], [280, 520], {}],
  ['방충망 5짝만 갈아주세요', ['repair'], [30, 110], {}],
  ['현관 중문 3연동 설치', ['repair', 'carpentry', 'window'], [55, 150], {}],
  ['아파트 24평 샷시 문짝 필름 리폼', ['film'], [150, 420], {}],
  ['상가 20평 벽 천장 수성페인트 도장', ['repair'], [70, 190], {}],
  ['아파트 베란다 탄성코트', ['repair'], [25, 90], {}],
  ['상가 유리면 10㎡ 필름 시공', ['film'], [50, 140], {}],
  ['욕실 벽 타일 15㎡ 교체', ['tilewaterproof', 'bathroom'], [120, 320], {}],

  // ── F. 전기·설비·목공·수선 (10) ─────────────────────────────────
  ['아파트 24평 LED 등기구 전체 교체', ['electric'], [70, 180], {}],
  ['콘센트 6개 추가 설치', ['electric'], [60, 150], {}],
  ['욕실 수전 교체 1개', ['plumbing', 'repair'], [20, 80], {}],
  ['아파트 노후 배관 3개소 교체', ['plumbing'], [60, 180], {}],
  ['거실 가벽 4m 세우고 룸 하나 만들기', ['carpentry'], [130, 400], {}],
  ['베란다 결로 이보드 시공 12m', ['carpentry', 'repair'], [70, 220], {}],
  ['문짝 2개 새로 교체', ['repair', 'carpentry'], [40, 140], {}],
  ['아파트 천장 누수로 일부 보수', ['repair'], [50, 160], {}],
  ['상가 셔터 도색', ['repair'], [30, 110], {}],
  ['신발장 제작 설치', ['carpentry', 'repair'], [60, 250], {}],

  // ── G. 인력·폐기물·장비 (8) ──────────────────────────────────────
  ['철거 인부 4명 2일', ['labor'], [170, 280], { people: 4 }],
  ['도배공 2명 이틀 지원', ['labor'], [110, 200], { people: 2 }],
  ['용접공 1명 하루', ['labor'], [30, 80], { people: 1 }],
  ['이사하고 남은 가구 폐기물 1톤', ['waste'], [30, 70], {}],
  ['상가 폐업 후 집기 2.5톤 수거', ['waste'], [70, 150], {}],
  ['마당 정지 미니포크레인 2일', ['groundwork'], [140, 320], { equip: true }],
  ['4층 간판 철거 사다리차 필요', ['demolition'], [80, 200], {}],
  ['11층 사무실 유리 철거 스카이차', ['demolition'], [250, 620], {}],

  // ── H. 복합 공사 (8) ────────────────────────────────────────────
  ['24평 아파트 철거 후 도배 장판', ['combined'], [450, 800], {}],
  ['상가 15평 철거하고 원상복구 도장 바닥', ['combined'], [350, 750], {}],
  ['원룸 10평 전체 인테리어 (도배 장판 욕실)', ['combined'], [1000, 2000], {}],
  ['32평 아파트 올수리 (확장 포함)', ['combined'], [3000, 5500], {}],
  ['사무실 20평 칸막이 철거 후 페인트·데코타일', ['combined'], [450, 850], {}],
  ['화장실 2칸 올수리하고 중문도 설치', ['combined', 'bathroom'], [800, 1500], {}],
  ['카페 15평 철거 후 도배 장판 조명', ['combined'], [450, 1000], {}],
  ['24평 아파트 도배 장판 조명 교체', ['combined', 'wallpaper'], [330, 750], {}],

  // ── I. 구어체·함정 문장 (6) ───────────────────────────────────────
  ['가게 접었는데 다 치워야 돼요 15평 정도', ['demolition'], [300, 620], {}],
  ['장판만 벗기고 새로 깔아주세요 20평', ['wallpaper'], [110, 300], {}], // 1.8T 20평 시공 110~180
  ['철거는 안 하고 도배만 24평', ['wallpaper'], [170, 340], { noDemo: true }],
  ['사람 두 명만 내일 보내주세요', ['labor'], [45, 110], { people: 2 }],
  ['욕실이 두 개인데 하나는 타일만, 하나는 전체', ['bathroom'], [700, 1300], {}],
  ['천장에서 물이 새서 방수 다시 해야 함 10㎡', ['tilewaterproof', 'repair'], [50, 200], {}],
];

// ── J. 관공서 공고 4건 ────────────────────────────────────────────
const BIDS = [
  { text: '안동시 풍산읍 노후 창고 해체 공사', budget: 1200, workTypes: ['demolition'] },
  { text: '안동시 청년문화센터 사무실 원상복구공사', budget: 3400, workTypes: ['demolition'] },
  { text: '예천군 농산물 직판장 철거 및 부지 정지 공사', budget: 5600, workTypes: ['all'] },
  { text: '안동시 보건소 화장실 4칸 리모델링 공사', budget: 2800, workTypes: ['all'] },
];

const rows = [];
const errors = [];

for (const [text, trades, range, cond] of CASES) {
  const r = classifyRequest(text);
  const trade = r.trade === 'unclassified' ? 'custom' : r.trade;
  const c = composeCase({ trade, patch: r.patch });
  const calc = computeEstimate(c);
  const price = Math.round(calc.clientPrice);
  const items = (calc.items || []).filter((i) => Number(i.amount) > 0 && !i.excluded);
  const mats = items.filter((i) => i.axis === 'material');

  rows.push({
    text,
    trade,
    size: `${c.sizeValue || ''}${c.sizeUnit || ''}`,
    price,
    cost: Math.round(calc.totalDirectCost),
    days: calc.workDays,
    summary: calc.targetSummary,
  });

  if (!trades.includes(trade)) errors.push(`${text} — 공종 ${trade} (기대 ${trades.join('/')})`);
  if (price < range[0] || price > range[1]) errors.push(`${text} — 견적 ${price}만 (기대 ${range[0]}~${range[1]}만)`);
  if (calc.totalDirectCost >= price) errors.push(`${text} — 원가 ${Math.round(calc.totalDirectCost)}만 ≥ 견적 ${price}만`);
  if (!(calc.workDays > 0) || calc.workDays > 40) errors.push(`${text} — 공사일수 ${calc.workDays}일이 현실 범위 밖`);
  if (cond.demoOnly && mats.length) errors.push(`${text} — 철거만인데 자재 ${mats.map((m) => m.name).join(', ')}`);
  if (cond.noDemo && /철거/.test(calc.targetSummary) && trade !== 'combined') errors.push(`${text} — 철거 안 한다는데 철거 요약`);
  if (cond.region && c.region !== cond.region) errors.push(`${text} — 지역 ${c.region || '없음'} (기대 ${cond.region})`);
  if (cond.people && Number(c.sizeValue) !== cond.people) errors.push(`${text} — 인원 ${c.sizeValue} (기대 ${cond.people}명)`);
  if (isDemoOnlyText(text) && trade === 'combined') errors.push(`${text} — 철거만인데 복합으로 분류`);
  // 4축 합계 = 줄 합계 (SSOT 불변식)
  const axisSum = ['material', 'labor', 'equip', 'waste'].reduce((s, a) => s + (calc.axisTotals?.[a] || 0), 0);
  if (Math.abs(axisSum - calc.totalDirectCost) > 1) errors.push(`${text} — 4축 합계 ${axisSum} ≠ 원가 ${Math.round(calc.totalDirectCost)}`);
}

// 관공서 공고 — 수주금액 고정 · 실행원가 80% 하한
for (const B of BIDS) {
  const r = classifyRequest(B.text);
  const trade = r.trade === 'unclassified' ? 'custom' : r.trade;
  const c = composeCase({ trade, patch: r.patch });
  c.bidBudget = B.budget;
  c.bid = { title: B.text, workTypes: B.workTypes, bidPrice: B.budget * 10000 };
  const calc = computeEstimate(c);
  rows.push({ text: B.text, trade, size: '공고', price: Math.round(calc.clientPrice), cost: Math.round(calc.totalDirectCost), days: calc.workDays, summary: calc.targetSummary });
  if (Math.round(calc.clientPrice) !== B.budget) errors.push(`${B.text} — 부를 금액 ${Math.round(calc.clientPrice)} ≠ 수주금액 ${B.budget}`);
  if (calc.bidCostFloor !== Math.round(B.budget * 0.8)) errors.push(`${B.text} — 실행원가 하한 ${calc.bidCostFloor} (기대 ${Math.round(B.budget * 0.8)})`);
  if (calc.totalDirectCost < calc.bidCostFloor) errors.push(`${B.text} — 원가 ${Math.round(calc.totalDirectCost)} < 하한 ${calc.bidCostFloor}`);
  if (!(calc.totalDirectCost < calc.clientPrice)) errors.push(`${B.text} — 원가가 수주금액 이상`);
}

fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: rows.length, errors, rows }, null, 2));

console.log('요청문'.padEnd(40), '공종'.padEnd(13), '규모'.padEnd(7), '견적', '원가');
console.log('-'.repeat(80));
for (const r of rows) {
  console.log(r.text.slice(0, 38).padEnd(40), String(r.trade).padEnd(13), String(r.size).padEnd(7), String(r.price + '만').padStart(6), String(r.cost + '만').padStart(6));
}
console.log('');
console.log(`홀드아웃 ${rows.length}건 중 오류 ${errors.length}건`);
errors.forEach((e) => console.log('  ✗ ' + e));
console.log(`저장: ${path.relative(path.resolve(__dirname, '..'), OUT)}`);
if (errors.length) process.exitCode = 1;
