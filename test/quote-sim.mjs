// 숨고 실제 빈출 요청문 전수 시뮬레이션 — 가격 범위·공종 분류·부대비용을 한 번에 검사한다.
// 실행: node test/quote-sim.mjs   (결과: 콘솔 표 + screenshots/quote-sim.json)
//
// 검사 항목
//  ① 공종 분류가 맞는가
//  ② 현장에 필요 없는 부대비용(보양·관리소·양중·준공청소)이 붙지 않았는가 / 필요한 비용이 들어갔는가
//  ③ 고객 견적가가 2026 숨고·현장 시세 범위 안에 있는가
//  ④ 새 현장 만들 때 금액(1단계)과 만든 뒤 가견적(2단계) 금액이 같은가
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyRequest } from '../src/lib/classify.js';
import { composeCase } from '../src/lib/storage.js';
import { computeEstimate } from '../src/lib/pricing.js';
import { siteCostRows } from '../src/lib/site.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'screenshots', 'quote-sim.json');
const ALL_SITE = ['protectLevel', 'adminDeposit', 'materialLift', 'afterCare'];

// [요청문, 기대 공종, 고객가 범위(만원), 필수 포함, 절대 붙으면 안 되는 부대비용]
const CASES = [
  ['숨고 간판 두개 철거', ['demolition'], [35, 70], [], ALL_SITE],
  ['상가 1층 간판 2개 철거 스카이차 필요', ['demolition'], [80, 160], [], ALL_SITE],
  ['싱크대 철거 및 수거', ['demolition'], [15, 40], [], ALL_SITE],
  ['붙박이장 1개 철거', ['demolition'], [20, 55], [], ALL_SITE],
  ['가벽 3m 철거', ['demolition'], [25, 60], [], ALL_SITE],
  ['샷시 2짝 철거', ['demolition'], [20, 50], [], ALL_SITE],
  ['천장 텍스 일부 철거', ['demolition'], [30, 70], [], ALL_SITE],
  ['에어컨 벽걸이 철거', ['demolition'], [10, 25], [], ALL_SITE],
  ['에어컨 실외기 철거', ['demolition'], [10, 35], [], ALL_SITE],
  ['원룸 생활폐기물 반차', ['waste'], [15, 30], [], ALL_SITE],
  ['폐기물 1톤 트럭 한차', ['waste'], [30, 60], [], ALL_SITE],
  ['2.5톤 폐기물 처리', ['waste'], [60, 120], [], ALL_SITE],
  ['이사 후 남은 가구(침대·소파·장롱) 수거', ['waste'], [25, 60], [], ALL_SITE],
  ['상가 폐업 집기 정리', ['waste'], [40, 150], [], ALL_SITE],
  ['카페 15평 원상복구 철거', ['demolition'], [350, 650], ['protectLevel', 'adminDeposit'], ['afterCare']],
  ['음식점 25평 철거 주방 후드 덕트 포함', ['demolition', 'combined'], [550, 1100], [], ['afterCare']],
  // 관리사무소 신고·보양이 원가에 실제로 반영되면서 상단이 800→830으로 올라갔다 (예전엔 화면에만 '포함')
  ['사무실 30평 칸막이 철거', ['demolition'], [350, 830], [], ['afterCare']],
  ['주택 구옥 20평 전체 철거', ['demolition'], [400, 900], [], ['adminDeposit']],
  ['외부 데크·창고 철거', ['demolition'], [80, 250], [], ['protectLevel', 'adminDeposit', 'afterCare']],
  ['안방 화장실 1칸 올수리', ['bathroom'], [400, 750], ['afterCare'], []],
  ['주방 싱크대+타일 교체', ['kitchen', 'combined'], [350, 600], ['afterCare'], []],
  ['도배+장판 20평', ['wallpaper'], [230, 400], ['afterCare'], []],
  ['바닥 미장 10평', ['plaster'], [90, 180], ['afterCare'], []],
  ['옥상 우레탄 방수 20평', ['tilewaterproof'], [250, 450], [], []],
  ['현관 중문·필름 시공', ['film', 'window', 'combined'], [60, 150], ['afterCare'], []],
  ['15평 아파트 전체 인테리어', ['combined'], [1300, 3000], ['protectLevel', 'adminDeposit', 'afterCare'], []],
  ['32평 아파트 올수리(확장 포함)', ['combined'], [3000, 8000], ['protectLevel', 'adminDeposit', 'afterCare'], []],
  ['철거+부지 정지 공사', ['combined', 'demolition'], [400, 1500], [], ['afterCare']],
  ['학교 칸막이 보수', ['repair', 'carpentry'], [20, 100], [], []],
  ['관공서 사무실 칸막이 보수', ['repair', 'carpentry'], [20, 120], [], []],
];

const rows = [];
const errors = [];

for (const [text, trades, range, needOn, forbidOn] of CASES) {
  const r = classifyRequest(text);
  const trade = r.trade === 'unclassified' ? 'custom' : r.trade;
  const c = composeCase({ trade, patch: r.patch });
  const calc = computeEstimate(c);
  // 새 현장 모달 → 저장 → 다시 읽기(2단계)까지 같은 금액인지
  const saved = JSON.parse(JSON.stringify(c));
  const calc2 = computeEstimate(saved);
  const price = Math.round(calc.clientPrice);
  const site = siteCostRows(c);
  const on = site.filter((s) => s.on).map((s) => s.id);
  const row = { text, trade, size: `${c.sizeValue || ''}${c.sizeUnit || ''}`, price, cost: Math.round(calc.costWithBuffer), site: on, summary: calc.targetSummary };
  rows.push(row);

  if (!trades.includes(trade)) errors.push(`${text} — 공종 ${trade} (기대 ${trades.join('/')})`);
  if (price < range[0] || price > range[1]) errors.push(`${text} — 견적 ${price}만 (기대 ${range[0]}~${range[1]}만)`);
  needOn.forEach((id) => {
    if (!on.includes(id)) errors.push(`${text} — ${id} 자동 포함 누락`);
  });
  forbidOn.forEach((id) => {
    if (on.includes(id)) errors.push(`${text} — ${id}가 붙으면 안 됨`);
  });
  if (!(calc.totalDirectCost > 0) || Number.isNaN(calc.clientPrice)) errors.push(`${text} — 금액 계산 오류(NaN/0)`);
  if (Math.round(calc2.clientPrice) !== price) errors.push(`${text} — 1단계 ${price} ≠ 2단계 ${Math.round(calc2.clientPrice)}`);
  if (/undefined|NaN/.test(calc.targetSummary) || /undefined|NaN/.test(JSON.stringify(calc.items))) errors.push(`${text} — 문구/항목에 undefined·NaN`);
}

const pad = (v, w) => String(v).padEnd(w);
console.log(pad('요청문', 34) + pad('공종', 12) + pad('규모', 8) + pad('견적', 8) + pad('원가', 8) + '부대비용');
console.log('-'.repeat(100));
rows.forEach((r) => {
  console.log(pad(r.text.slice(0, 32), 34) + pad(r.trade, 12) + pad(r.size, 8) + pad(`${r.price}만`, 8) + pad(`${r.cost}만`, 8) + (r.site.join(',') || '-'));
});
console.log(`\n결과: ${CASES.length}건 중 오류 ${errors.length}건`);
errors.forEach((e) => console.log(`  ✗ ${e}`));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ cases: rows, errors }, null, 2));
process.exit(errors.length ? 1 : 0);
