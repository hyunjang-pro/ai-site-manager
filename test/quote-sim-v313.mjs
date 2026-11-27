// v3.13 정밀 시뮬레이션 — 실제 숨고·카톡 요청문 50건을 코드에 그대로 돌린다.
// 실행: node test/quote-sim-v313.mjs   (결과: 콘솔 표 + screenshots/quote-sim-v313.json)
//
// 검사 항목
//  ① 공종 분류 (욕실 철거를 올수리로 계산하지 않는가)
//  ② 고객가가 2026 시장 범위 안인가 — 범위는 아래 출처의 공개 실견적·실무 단가 기준
//     · 청년철거 경북 상가: 전체 철거 평당 10.9만 · 원상복구 13.4만 (시공사례 292건)
//     · 똑딱 점포철거 기준가: 마감 전체 평당 8만~ / 설비 포함 15만~ (2026.9)
//     · 무촌철거 상주·칠곡: 상가 원상복구 평당 18~28만
//     · 욕실: 철거만 60~120만 / 올철거 기본 350~500만 (2026.11 공개 견적)
//     · 폐기물 차량 실비 1톤 40~45만 · 2.5톤 70~80만 (2026 처리업체 단가표)
//       → 손님에게 부르는 값은 실비 + 진행비 10~15% (반차 30~35 · 1톤 45~55 · 2.5톤 85~95)
//  ③ 폐기물차 비용과 인건비가 두 번 들어가지 않는가
//     (폐기물 단독 현장: 차량 단가에 상차·운반 포함 → 양중비·식비 별도 없음)
//  ④ 신축 현장(생성 직후)과 저장 후 재계산 금액이 같은가
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyRequest } from '../src/lib/classify.js';
import { composeCase } from '../src/lib/storage.js';
import { computeEstimate } from '../src/lib/pricing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'screenshots', 'quote-sim-v313.json');

// [요청문, 기대 공종, 고객가 범위(만원), 필수 조건]
const CASES = [
  // ── 2026-11-26 실제 현장 (90만원에 진행) — 가장 먼저 검사하는 케이스 ──
  ['장판 제거 화장실 2개 베란다 샷시 및 부엌 선반과 씽크대 철거', ['demolition'], [80, 120], { demoOnly: true }],
  ['장판 제거 화장실 두개 베란다 샷시 부엌 선반 씽크대 철거', ['demolition'], [80, 120], { demoOnly: true }],

  // ── 부분 철거 (품목·개수 단위) ──
  ['간판 1개 철거', ['demolition'], [25, 60], {}],
  ['간판 두개 철거', ['demolition'], [30, 75], {}],
  ['상가 1층 간판 2개 철거 스카이차 필요', ['demolition'], [70, 160], {}],
  ['싱크대 철거 및 수거', ['demolition'], [15, 45], {}],
  ['붙박이장 1개 철거', ['demolition'], [20, 55], {}],
  ['가벽 3m 철거', ['demolition'], [25, 60], {}],
  ['샷시 2짝 철거', ['demolition'], [20, 55], {}],
  ['천장 텍스 일부 철거', ['demolition'], [25, 70], {}],
  ['데코타일 철거', ['demolition'], [30, 100], { noSize: true }],
  ['에어컨 벽걸이 철거', ['demolition'], [10, 30], {}],
  ['에어컨 실외기 철거', ['demolition'], [10, 35], {}],
  ['문짝 2개 철거', ['demolition', 'repair'], [20, 60], {}],

  // ── 욕실 ──
  ['화장실 하나 철거', ['bathroom'], [60, 160], { demoOnly: true }],
  ['화장실 하나 부수는데', ['bathroom'], [60, 160], { demoOnly: true }],
  ['욕실 1칸 철거', ['bathroom'], [60, 160], { demoOnly: true }],
  ['욕실 두칸 철거', ['bathroom'], [120, 300], { demoOnly: true }],
  ['화장실 2개 철거', ['bathroom'], [120, 300], { demoOnly: true }],
  ['안방 욕실 1칸 올수리', ['bathroom'], [380, 700], {}],
  ['욕실 2개 올수리', ['bathroom'], [700, 1350], {}],
  ['욕실 1칸 타일만 교체 (덧방)', ['bathroom'], [200, 460], {}],

  // ── 주방 ──
  ['주방 철거', ['kitchen'], [30, 110], { demoOnly: true }],
  ['주방 싱크대 교체 3m', ['kitchen'], [300, 560], {}],
  ['부엌 싱크대 2.5m 상판까지 교체', ['kitchen'], [250, 500], {}],

  // ── 주거 철거 ──
  ['18평 아파트 철거', ['demolition'], [230, 400], {}],
  ['24평 아파트 철거', ['demolition'], [280, 480], {}],
  ['32평 아파트 철거', ['demolition'], [380, 640], {}],
  ['45평 아파트 철거', ['demolition'], [500, 900], {}],
  ['32평 아파트 올철거', ['demolition'], [380, 640], {}],

  // ── 상가·원상복구 ──
  ['카페 15평 원상복구', ['demolition'], [220, 420], {}],
  ['식당 30평 원상복구', ['demolition'], [400, 750], {}],
  ['사무실 15평 원상복구', ['demolition'], [200, 400], {}],
  ['미용실 12평 철거', ['demolition'], [180, 360], {}],
  ['편의점 20평 원상복구', ['demolition'], [250, 500], {}],
  ['학원 25평 칸막이 철거', ['demolition'], [250, 550], {}],
  ['상가 15평 원상복구', ['demolition'], [220, 420], {}],

  // ── 폐기물 (v3.20: 차량 실비 + 올바로 3만 + 운용 마진 13% → 반차 30~35 · 1톤 45~55 · 2.5톤 85~95)
  ['원룸 생활폐기물 반차', ['waste'], [30, 38], { wasteNoLabor: true }],
  ['폐기물 1톤 트럭 한차', ['waste'], [45, 60], { wasteNoLabor: true }],
  ['2.5톤 폐기물 처리', ['waste'], [85, 100], { wasteNoLabor: true }],
  ['이사 후 남은 가구 수거 2톤', ['waste'], [80, 103], { wasteNoLabor: true }],
  ['상가 폐업 집기 정리', ['waste'], [85, 100], { wasteNoLabor: true }],
  ['3층 사무실 폐기물 2톤 엘베 없음', ['waste'], [80, 103], { wasteNoLabor: true }],

  // ── 인력 지원 ──
  ['인부 2명 3일', ['labor'], [120, 200], {}],
  ['일용 인력 3명 5일', ['labor'], [300, 450], {}],

  // ── 인테리어·마감 ──
  ['아파트 24평 도배 장판', ['wallpaper'], [220, 380], {}],
  ['거실 장판 철거하고 새 장판 깔아주세요', ['wallpaper'], [120, 300], {}], // 장판만 — 벽지 값이 붙으면 안 된다
  ['베란다 샷시 철거 후 새 샷시 설치', ['window', 'combined'], [150, 450], {}],
  ['도배+장판 20평', ['wallpaper'], [190, 340], {}],
  ['15평 아파트 전체 인테리어', ['combined'], [1300, 2200], {}],
  ['24평 아파트 인테리어', ['combined'], [2200, 3600], {}],
  ['32평 아파트 올수리(확장 포함)', ['combined'], [3000, 5000], {}],
  ['욕실 타일 20㎡', ['tilewaterproof'], [200, 360], {}],
  ['옥상 우레탄 방수 20평', ['tilewaterproof'], [250, 450], {}],

  // ── 기타 공종 ──
  ['발코니 확장 창호 8㎡', ['window'], [250, 450], {}],
  ['바닥 미장 10평', ['plaster'], [90, 200], {}],
  ['인테리어 필름 15㎡', ['film'], [60, 150], {}],
  ['콘센트 10개 증설', ['electric'], [80, 180], {}],
  ['수전 2개 교체', ['plumbing'], [50, 130], {}],
];

const rows = [];
const errors = [];

for (const [text, trades, range, cond] of CASES) {
  const r = classifyRequest(text);
  const trade = r.trade === 'unclassified' ? 'custom' : r.trade;
  const c = composeCase({ trade, patch: r.patch });
  const calc = computeEstimate(c);
  // 저장했다가 다시 읽어도 금액이 같은가
  const calc2 = computeEstimate(JSON.parse(JSON.stringify(c)));
  const price = Math.round(calc.clientPrice);
  const items = calc.items || [];
  const wasteItem = items.find((i) => i.category === '폐기물' && !i.excluded);
  const laborItem = items.find((i) => i.category === '노무' && !i.excluded);
  const hasMaterial = items.some((i) => i.category === '자재' && Number(i.amount) > 0);

  rows.push({
    text,
    trade,
    size: `${c.sizeValue || ''}${c.sizeUnit || ''}`,
    price,
    cost: Math.round(calc.totalDirectCost),
    days: calc.workDays || null,
    lifting: Math.round(calc.lifting?.cost || 0),
    waste: wasteItem ? Math.round(wasteItem.amount) : 0,
    labor: laborItem ? Math.round(laborItem.amount) : 0,
    summary: calc.targetSummary,
  });

  if (!trades.includes(trade)) errors.push(`${text} — 공종 ${trade} (기대 ${trades.join('/')})`);
  if (price < range[0] || price > range[1]) errors.push(`${text} — 견적 ${price}만 (기대 ${range[0]}~${range[1]}만)`);
  if (calc.clientPrice !== calc2.clientPrice) errors.push(`${text} — 생성 직후 ${calc.clientPrice} vs 저장 후 ${calc2.clientPrice}`);

  // ① 철거만 요청에 자재(타일·도기·싱크대) 값이 붙으면 안 된다
  if (cond.demoOnly && hasMaterial) {
    errors.push(`${text} — 철거만인데 자재 항목이 붙음 (${items.filter((i) => i.category === '자재').map((i) => i.name).join(', ')})`);
  }
  // ② 규모를 안 적은 요청이 15평으로 튀지 않는가
  if (cond.noSize && Number(c.sizeValue || 0) >= 12) errors.push(`${text} — 규모 미입력인데 ${c.sizeValue}${c.sizeUnit}로 잡힘`);
  // ③ 폐기물 단독 현장은 폐기물차 인건비를 따로 더하지 않는다
  if (cond.wasteNoLabor) {
    if (Number(calc.lifting?.cost) > 0) errors.push(`${text} — 폐기물차 인건비 포함인데 양중비 ${calc.lifting.cost}만이 또 붙음`);
    const loading = items.find((i) => /상차|인부/.test(i.name || '') && i.category === '노무');
    if (loading) errors.push(`${text} — 상차 인부를 노무로 또 청구 (${loading.name})`);
  }
  // ④ 어떤 현장이든 폐기물차와 양중차를 같은 값으로 두 번 청구하지 않는다
  if (calc.lifting?.cost > 0 && calc.lifting?.truckCount > 0) errors.push(`${text} — 양중비에 차량 대수가 또 들어감`);
}

fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: rows.length, errors, rows }, null, 2));

console.log('요청문'.padEnd(30), '공종'.padEnd(14), '규모'.padEnd(8), '견적', '원가', '일', '폐기물');
console.log('-'.repeat(92));
for (const r of rows) {
  console.log(
    r.text.padEnd(30),
    String(r.trade).padEnd(14),
    String(r.size).padEnd(8),
    String(r.price + '만').padStart(6),
    String(r.cost + '만').padStart(5),
    String(r.days ?? '-').padStart(3),
    String(r.waste + '만').padStart(6)
  );
}
console.log('');
console.log(`결과: ${rows.length}건 중 오류 ${errors.length}건`);
errors.forEach((e) => console.log('  ✗ ' + e));
console.log(`저장: ${path.relative(path.resolve(__dirname, '..'), OUT)}`);
if (errors.length) process.exitCode = 1;
