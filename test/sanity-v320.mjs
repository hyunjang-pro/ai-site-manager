// v3.20 시세 상식 검증 — 폐기물 단독 마진·단가 현실화 + 전 공종 시세 검증 레이어.
// 실행: node test/sanity-v320.mjs   (결과: screenshots/sanity-v320.json)
//
//  ① 폐기물 단독: 차량 실비(반차 26 · 1톤 42.5 · 2.5톤 75만) + 올바로 3만 + 운용 마진 13%
//     → 반차 30~35 · 1톤 45~55 · 2.5톤 85~95만 (현실 시세)
//  ② 전 공종(철거·상가 원상복구·폐기물·인력·욕실·주방·타일·도배·바닥·필름·도장·전기·방수·창호·목공·복합)에
//     [min, low, high, max] 시세 범위가 있고 순서가 맞는가
//  ③ 계산 결과가 상한·하한을 벗어나면 마진을 자동 조정하고 adjusted 를 남기는가
//  ④ 정상 견적은 건드리지 않는가 / 내가 부른 금액·관공서 공고는 사장님 값이라 안 바꾸는가
//  ⑤ 화면 문장이 어머님이 읽는 쉬운 말인가 (전문용어·영문 없음)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyRequest } from '../src/lib/classify.js';
import { composeCase } from '../src/lib/storage.js';
import { computeEstimate } from '../src/lib/pricing.js';
import { TRADES } from '../src/lib/constants.js';
import { MARKET_BANDS, marketBand, marketHeadline, marketSanity, bandScale } from '../src/lib/engine/sanity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'screenshots', 'sanity-v320.json');

const errors = [];
const rows = [];
const ok = (name, cond, detail = '') => {
  if (!cond) errors.push(`${name}${detail ? ` — ${detail}` : ''}`);
};
const priceOf = (text, mutate) => {
  const r = classifyRequest(text);
  const c = composeCase({ trade: r.trade === 'unclassified' ? 'custom' : r.trade, patch: r.patch });
  if (mutate) mutate(c);
  const calc = computeEstimate(c);
  return { text, trade: calc.trade, size: `${c.sizeValue || ''}${c.sizeUnit || ''}`, price: Math.round(calc.clientPrice), cost: Math.round(calc.totalDirectCost), calc, sanity: calc.sanity };
};

// ── ① 폐기물 단독 ────────────────────────────────────────────────────
const WASTE = [
  ['원룸 생활폐기물 반차', 'half', 0.5, 30, 35, 26],
  ['폐기물 1톤 트럭 한차', 'ton1', 1, 45, 55, 42.5],
  ['2.5톤 폐기물 처리', 'ton25', 2.5, 85, 95, 75],
  ['상가 폐업 집기 정리', 'ton25', 2.5, 85, 95, 75],
  ['이사 후 남은 가구 수거 2톤', 'ton25', 2.5, 80, 100, 75],
];
for (const [text, vehicle, tons, lo, hi, vehicleCost] of WASTE) {
  const row = priceOf(text);
  rows.push({ group: 'waste', ...row, sanity: undefined, calc: undefined });
  ok(`폐기물 시세 ${text}`, row.price >= lo && row.price <= hi, `${row.price}만 (기대 ${lo}~${hi}만)`);
  ok(`폐기물 차량 실비 ${text}`, Math.round(row.cost) === Math.round(vehicleCost + 3), `원가 ${Math.round(row.cost)}만 (차량 ${vehicleCost} + 올바로 3)`);
  ok(`폐기물 운용 마진 ${text}`, row.calc.marginTarget >= 10 && row.calc.marginTarget <= 15, `${row.calc.marginTarget}%`);
  ok(`폐기물 예비비 없음 ${text}`, row.calc.bufferRate === 0, `${row.calc.bufferRate}%`);
  ok(`폐기물 톤수 ${text}`, Math.abs((row.sanity?.band?.n || 0) - tons) < 0.01, `${row.sanity?.band?.n}톤`);
}
// 차량 탭과 다른 톤수를 직접 적으면 그 톤수(톤당 32만)로 계산한다
const five = priceOf('5톤 폐기물 차량 한대');
ok('폐기물 5톤은 톤당 단가(160만 원가)', Math.round(five.cost) === 163, `원가 ${Math.round(five.cost)}만`);
ok('폐기물 5톤 시세 170~240만', five.price >= 170 && five.price <= 240, `${five.price}만`);

// ── ② 전 공종 시세 범위 ──────────────────────────────────────────────
const ALL = Object.keys(MARKET_BANDS);
for (const trade of ALL) {
  const c = composeCase({ trade, patch: { sizeValue: '', sizeUnit: TRADES[trade]?.defaultUnit || '평' } });
  const calc = computeEstimate(c);
  const b = calc.marketBand;
  ok(`범위 존재 ${trade}`, !!b && b.high > 0, JSON.stringify(b));
  if (!b) continue;
  ok(`범위 순서 ${trade}`, b.min <= b.low && b.low <= b.high && b.high <= b.max, `${b.min}/${b.low}/${b.high}/${b.max}`);
  ok(`범위 단위 ${trade}`, !!b.unit && b.low > 0, `${b.low}~${b.high}${b.unit}`);
  ok(`검증 실행 ${trade}`, calc.sanity && calc.sanity.checked === true, JSON.stringify(calc.sanity?.checked));
  rows.push({ group: 'band', trade, band: b, price: Math.round(calc.clientPrice), position: calc.sanity?.position });
}
for (const t of ['demolition', 'wallpaper', 'bathroom', 'kitchen', 'waste', 'labor', 'tilewaterproof', 'plaster', 'window', 'repair', 'carpentry', 'electric', 'plumbing', 'film', 'groundwork', 'combined']) {
  ok(`공종 누락 없음 ${t}`, ALL.includes(t));
}

// 규모가 커지면 보통 시세도 올라간다 (면적·평수 비례)
for (const [trade, unit, small, big] of [
  ['demolition', '평', 8, 30],
  ['wallpaper', '평', 8, 32],
  ['tilewaterproof', '㎡', 4, 20],
  ['combined', '평', 12, 32],
  ['waste', '톤', 1, 5],
]) {
  const a = marketBand({ trade, sizeValue: small, sizeUnit: unit });
  const b = marketBand({ trade, sizeValue: big, sizeUnit: unit });
  ok(`규모 비례 ${trade}`, b.high > a.high && b.max > a.max, `${a.high} → ${b.high}`);
}

// ── ③ 자동 보정 ──────────────────────────────────────────────────────
// ③-1 비정상 상한: 시세 범위를 넘는 금액은 상한으로 되돌린다 (엔진 단위 직접 시험)
const overCtx = { trade: 'waste', sizeValue: '2.5', sizeUnit: '톤', tons: 2.5, baseCost: 78, cost: 78, bufferRate: 0, margin: 40, price: 130 };
const over = marketSanity(overCtx);
ok('자동 보정(상한) 판정', over.position === 'over' && over.adjusted === true, JSON.stringify(over.reason));
ok('자동 보정(상한) 방향', over.direction === 'down');
ok('자동 보정(상한) 마진', over.margin < 40 && over.margin >= 3, `${over.margin}%`);
ok('자동 보정(상한) 이유 문장', /시세 상한/.test(over.reason || ''), over.reason);
// 같은 상황을 실제 현장으로 — 마진을 크게 잡아도 자동 계산가가 시세 상한을 넘지 않는다
const HOT_TEXTS = ['욕실 수전 교체 1개', '24평 아파트 도배 장판', '욕실 1칸 올수리', '2.5톤 폐기물 처리', '주방 싼크대 3m 교체', '안동 상가 15평 원상복구', '인부 3명 2일'];
const hotRows = HOT_TEXTS.map((t) => priceOf(t, (c) => { c.marginRate = 60; }));
const leaking = hotRows.filter((r) => !(r.price <= r.sanity.band.max + 1 || r.sanity.cannotFix === 'costAboveMax'));
ok('현장 계산도 시세 상한을 넘지 않음 (마진 60%)', leaking.length === 0, leaking.map((r) => `${r.text} ${r.price}>${r.sanity.band.max}`).join(', '));
const fixed = hotRows.filter((r) => r.price > r.sanity.band.high && r.sanity.adjusted);
ok('상한으로 깎을 때는 adjusted를 남김', fixed.length > 0 ? fixed.every((r) => r.sanity.direction === 'down' && r.sanity.reason) : true, fixed.map((r) => `${r.text} ${r.sanity.reason}`).join(' | '));// 폐기물은 마진 상한(15%)을 먼저 막아 두어 시세를 넘을 수 없다
const wasteHot = priceOf('2.5톤 폐기물 처리', (c) => {
  c.marginRate = 55;
});
ok('폐기물 마진 55%도 15%까지만', wasteHot.calc.marginTarget === 15 && wasteHot.price >= 85 && wasteHot.price <= 95, `${wasteHot.calc.marginTarget}% · ${wasteHot.price}만`);

// ③-2 과도하게 낮음: 단가표가 0으로 깨진 현장 → 하한 쪽으로 올린다
const low = priceOf('2.5톤 폐기물 처리', (c) => {
  c.unitPriceSnapshot.waste = { ...c.unitPriceSnapshot.waste, truck25: 0, truck1: 0, truckHalf: 0, perTon: 0 };
});
ok('자동 보정(하한) adjusted', low.sanity.adjusted === true, JSON.stringify(low.sanity.reason));
ok('자동 보정(하한) 방향', low.sanity.direction === 'up');
ok('자동 보정(하한) 금액 상승', low.price > Math.round(12 / (1 - 0.13)), `${low.price}만`);

// ③-3 상한을 넘는 원가는 억지로 깎지 않는다 (적자 판매 금지)
const hugeCost = priceOf('2.5톤 폐기물 처리', (c) => {
  c.waste = { ...(c.waste || {}), applyActual: true, actualCost: 400 };
});
ok('원가가 상한을 넘으면 가격을 깎지 않음', hugeCost.price >= Math.round(hugeCost.cost), `${hugeCost.price}만 / 원가 ${Math.round(hugeCost.cost)}만`);

// ── ④ 정상 견적·사장님 값은 건드리지 않는다 ────────────────────────────
const NORMAL = [
  ['안동 상가 15평 원상복구', 220, 420],
  ['24평 아파트 도배 장판', 200, 400],
  ['욕실 1칸 올수리', 400, 700],
  ['주방 싱크대 3m 교체', 300, 600],
  ['옥상 우레탄 방수 20평', 250, 450],
  ['아파트 24평 LED 등기구 전체 교체', 70, 180],
  ['인부 3명 2일', 130, 220],
  ['상가 20평 벽 천장 수성페인트 도장', 90, 200],
  ['24평 아파트 전체 철거', 280, 600],
];
for (const [text, lo, hi] of NORMAL) {
  const row = priceOf(text);
  rows.push({ group: 'normal', ...row, calc: undefined, sanity: undefined });
  ok(`정상 견적 유지 ${text}`, row.sanity.adjusted === false && row.price >= lo && row.price <= hi, `${row.price}만 · adjusted=${row.sanity.adjusted}`);
}

const called = priceOf('2.5톤 폐기물 처리', (c) => {
  c.calledPrice = 200;
});
ok('내가 부른 금액은 그대로', called.price === 200 && called.sanity.adjusted === false && called.sanity.locked === true, `${called.price}만`);

const bid = composeCase({ trade: 'demolition', patch: {} });
bid.bidBudget = 1500;
bid.bid = { title: '안동시 사무실 철거', workTypes: ['demolition'], bidPrice: 15000000 };
const bidCalc = computeEstimate(bid);
ok('관공서 공고는 시세 검증 제외', Math.round(bidCalc.clientPrice) === 1500 && bidCalc.sanity.disabled === 'bid' && bidCalc.sanity.checked === false, `${bidCalc.clientPrice}만`);

// ── ⑤ 화면 문장 ──────────────────────────────────────────────────────
const headline = marketHeadline(priceOf('2.5톤 폐기물 처리').sanity.band);
ok('안내 문장 형식', /보통 .+ 시세는 \d+~\d+만 원 선이에요\./.test(headline), headline);
const why = priceOf('2.5톤 폐기물 처리').sanity.why;
ok('이유 문장: 차량 실비', why.includes('차량 실비 75만') && why.includes('올바로') && why.includes('진행비'), why);
ok('이유 문장: 전문용어·영문 없음', !/[A-Za-z]|적산|마진율|부대비|시세\s*이탈/.test(why), why);
const demoWhy = priceOf('안동 상가 15평 원상복구').sanity.why;
ok('철거 이유 문장: 인부·폐기물', /인부 \d+명 × [\d.]+일/.test(demoWhy) && demoWhy.includes('폐기물'), demoWhy);
const laborWhy = priceOf('인부 3명 2일').sanity.why;
ok('인력 이유 문장: 명·일·하루 단가', /3명 × 2일 × 하루 \d+만/.test(laborWhy), laborWhy);
for (const w of [why, demoWhy, laborWhy]) ok('문장 길이(어머님 화면 3줄 이내)', w.length <= 140, `${w.length}자`);

// ── 규모 표기 ────────────────────────────────────────────────────────
ok('규모 표기: 톤', bandScale('waste', { sizeValue: '2.5', sizeUnit: '톤' }).label === '2.5톤', bandScale('waste', { sizeValue: '2.5', sizeUnit: '톤' }).label);
ok('규모 표기: 평 환산', bandScale('demolition', { sizeValue: '99', sizeUnit: '㎡' }).label === '30평', bandScale('demolition', { sizeValue: '99', sizeUnit: '㎡' }).label);
ok('규모 표기: 인력', bandScale('labor', { people: 3, days: 2 }).label === '3명 2일', bandScale('labor', { people: 3, days: 2 }).label);

// 품목 철거는 품목 수만큼 범위가 커진다 (3품목 374만은 '시세 상한'이 아니라 '조금 높음')
const multi = marketBand({ trade: 'demolition', kind: 'partial', sizeValue: '15', sizeUnit: '평', units: 3 });
const single = marketBand({ trade: 'demolition', kind: 'partial', sizeValue: '2', sizeUnit: '개', units: 1 });
ok('품목 철거: 개수만큼 범위가 커짐', multi.high > single.high && multi.max > single.max, `${single.high}/${single.max} → ${multi.high}/${multi.max}`);
ok('품목 철거: 1품목은 최소 15만부터', single.min <= 20 && single.max >= 200, `${single.min}~${single.max}`);
const multiCase = priceOf('천장 텍스 5평, 가벽 칠막이 3m, 데코타일 10평 철거', () => {});
ok('품목 철거: 다품목 견적은 범위 안', multiCase.sanity.adjusted === false && multiCase.price <= multiCase.sanity.band.max, `${multiCase.price}만 · ${multiCase.sanity.position}`);

fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: rows.length, errors, rows }, null, 2));
console.log('시세 검증', rows.length, '건 · 문제', errors.length, '건');
errors.forEach((e) => console.log('  ✗ ' + e));
console.log('저장:', path.relative(path.resolve(__dirname, '..'), OUT));
if (errors.length) process.exitCode = 1;
