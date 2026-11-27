// v3.17 추가 공종 검증 — 그동안 전용 케이스가 없던 도장·필름·방수·전기·설비·단열·관공서 공고.
// 실행: node test/sim-extra-v317.mjs   (결과: screenshots/sim-extra-v317.json)
//
// 시세 기준 (2026 공개 실견적·단가 자료)
//  · 도장: 집지니 실견적 8건 건당 96만(38~173), 평당 평균 3만 · 홈체크 25평 수성 73~110만 ·
//          다드픽스 실내 벽면 페인트 평 3.5~6만 · 얼마드나 베란다 탄성코트 1개소 20~50만
//  · 필름: 얼마드나 34평 방문6+문틀 90~150만 / 표준 리폼(현관·싱크대 포함) 200~400만,
//          샷시 포함 270~370만 · 반셀끝 30평대 75~248만 · 집지니 필름공 일당 30만·㎡당 1.8만
//  · 방수: GG그린방수 옥상 20평 우레탄 본공사 190~220만 / 면갈이 포함 279~341만 ·
//          집꾸 20평 우레탄 200~320만 · 욕실 방수(철거 포함) 20~35만 + 부대
//  · 전기: LED 등기구 교체(거실+방3+주방 6~9개) 80~150만 · 레일조명 15개 자재+시공 90~160만
//  · 설비: 변기 교체 18~25만, 세면대 25~50만(얼마드나·집수리공) · 분전함 교체 30~90만
//  · 단열: 이보드 덧붙임 ㎡당 3.5~6.5만 / 1칸 60~150만 (생활요청·유리지갑)
//  · 폐기물: 상가 폐업 집기 2.5톤 1대 70~150만
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyRequest } from '../src/lib/classify.js';
import { composeCase } from '../src/lib/storage.js';
import { computeEstimate } from '../src/lib/pricing.js';
import { buildQuote, quoteText, clientQuoteMessage, estimateSms, constructionNoticeText } from '../src/lib/docs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'screenshots', 'sim-extra-v317.json');

// [요청문, 기대 공종, 고객가 범위(만원), 조건]
const CASES = [
  // ── 1. 도장(페인트) ──
  ['아파트 베란다 탄성코트', ['repair'], [25, 85], {}],
  ['베란다 탄성코트 도장', ['repair'], [25, 70], {}],
  ['상가 20평 수성 페인트 벽 천장 도장', ['repair'], [70, 180], { paintArea: true }],
  ['상가 20평 수성 페인트 벽만 도장', ['repair'], [50, 150], { paintArea: true }],
  ['외부 간판 도장', ['repair'], [25, 70], {}],
  ['철문 도장', ['repair'], [25, 70], {}],

  // ── 2. 인테리어 필름(시트지) ──
  ['아파트 34평 샷시 문짝 싱크대 필름 리폼', ['film'], [200, 450], {}],
  ['문 5짝 필름 시공', ['film'], [80, 160], {}],
  ['인테리어 필름 15㎡', ['film'], [55, 140], {}],

  // ── 3. 방수·누수 ──
  ['옥상 우레탄 방수 20평', ['tilewaterproof'], [190, 370], { noTileMaterial: true }],
  ['화장실 누수 방수 공사', ['tilewaterproof'], [50, 150], { noTileMaterial: true }],
  ['베란다 누수 방수', ['tilewaterproof'], [50, 150], { noTileMaterial: true }],
  ['외벽 발수 코팅', ['repair', 'tilewaterproof'], [30, 110], {}],
  ['외벽 실리콘 코킹', ['repair'], [15, 80], {}],

  // ── 4. 조명·전기 ──
  ['34평 아파트 LED 등기구 전체 교체 방3 거실 주방', ['electric'], [70, 160], { pointsMax: 9 }],
  ['상가 레일조명 15개 설치', ['electric'], [90, 180], {}],
  ['분전함 교체', ['electric', 'repair'], [30, 95], {}],

  // ── 5. 설비·단열 ──
  ['변기 세면대 교체', ['repair', 'plumbing'], [40, 110], {}],
  ['싱크대 수전 배관 교체', ['plumbing'], [25, 80], {}],
  ['결로 단열 이보드 시공', ['carpentry', 'plaster', 'repair'], [55, 165], {}],
  ['상가 폐업 집기 정리', ['waste'], [60, 180], { wasteTons: 2.5 }],
];

const rows = [];
const errors = [];

for (const [text, trades, range, cond] of CASES) {
  const r = classifyRequest(text);
  const trade = r.trade === 'unclassified' ? 'custom' : r.trade;
  const c = composeCase({ trade, patch: r.patch });
  const calc = computeEstimate(c);
  const price = Math.round(calc.clientPrice);
  const items = calc.items || [];

  rows.push({
    text,
    trade,
    size: `${c.sizeValue || ''}${c.sizeUnit || ''}`,
    price,
    cost: Math.round(calc.totalDirectCost),
    days: calc.workDays,
    crew: calc.crewPlan?.crew ?? null,
    summary: calc.targetSummary,
  });

  if (!trades.includes(trade)) errors.push(`${text} — 공종 ${trade} (기대 ${trades.join('/')})`);
  if (price < range[0] || price > range[1]) errors.push(`${text} — 견적 ${price}만 (기대 ${range[0]}~${range[1]}만)`);
  if (!(calc.workDays > 0) || calc.workDays > 12) errors.push(`${text} — 공사일수 ${calc.workDays}일이 현실 범위 밖`);
  if (!calc.crewPlan?.crew) errors.push(`${text} — 추천 인원이 비어 있음`);
  if (calc.netProfit < 0) errors.push(`${text} — 원가 ${calc.totalDirectCost}만 > 견적 ${price}만 (적자)`);
  // 도장은 개소 1곳이 아니라 면적으로 계산돼야 한다
  if (cond.paintArea) {
    const paintItem = items.find((i) => /도료|도장 인력/.test(i.name || ''));
    if (!paintItem || !/㎡/.test(paintItem.name || '')) errors.push(`${text} — 도장이 면적(㎡) 기준으로 계산되지 않음`);
  }
  // 방수만 하는 현장에 타일 자재·시공비가 붙으면 욕실 올수리로 계산된 것이다
  if (cond.noTileMaterial) {
    const tile = items.find((i) => /타일/.test(i.name || '') && Number(i.amount) > 0 && !/철거/.test(i.name || ''));
    if (tile) errors.push(`${text} — 방수만인데 타일 자재·시공 ${tile.amount}만이 붙음`);
  }
  // 평수를 개소 수로 읽지 않았는지 (34평 LED → 34개소)
  if (cond.pointsMax) {
    const m = String(calc.targetSummary).match(/(\d+)\s*개소/);
    if (m && Number(m[1]) > cond.pointsMax) errors.push(`${text} — ${m[1]}개소로 잡힘 (평수를 개소로 오인, 최대 ${cond.pointsMax})`);
  }
  if (cond.wasteTons && Number(c.sizeValue) !== cond.wasteTons) errors.push(`${text} — 폐기물 ${c.sizeValue}톤 (기대 ${cond.wasteTons}톤)`);
}

// ── 6. 관공서·나라장터 공고: 수주금액 80% 실행원가 하한 + 손님 문서 노출 차단 ──
const BID = { text: '안동시 소규모 사무실 철거 및 원상복구 공사', budget: 1500, trade: ['demolition'] };
{
  const r = classifyRequest(BID.text);
  const c = composeCase({ trade: r.trade === 'unclassified' ? 'custom' : r.trade, patch: r.patch });
  c.bidBudget = BID.budget;
  c.bid = { title: '안동시 소규모 사무실 철거공사', workTypes: ['demolition'], bidPrice: BID.budget * 10000 };
  const calc = computeEstimate(c);
  const quote = buildQuote(c, calc, c.design, c.waste);
  const clientText = [quoteText(quote, calc), clientQuoteMessage(c, calc), estimateSms(c, calc, [], false), constructionNoticeText(c, calc)].join('\n');
  rows.push({
    text: BID.text,
    trade: calc.trade,
    size: '공고',
    price: calc.clientPrice,
    cost: Math.round(calc.totalDirectCost),
    days: calc.workDays,
    crew: calc.crewPlan?.crew ?? null,
    summary: `${calc.targetSummary} · 하한 ${calc.bidCostFloor}만 · 마진 ${calc.marginPercent}%`,
  });
  if (!calc.isBid) errors.push(`${BID.text} — 공고로 인식되지 않음`);
  if (calc.bidCostFloor !== Math.round(BID.budget * 0.8)) errors.push(`${BID.text} — 실행원가 하한 ${calc.bidCostFloor}만 (기대 ${Math.round(BID.budget * 0.8)}만)`);
  if (calc.totalDirectCost < calc.bidCostFloor) errors.push(`${BID.text} — 원가 ${calc.totalDirectCost}만 < 하한 ${calc.bidCostFloor}만`);
  if (calc.clientPrice > BID.budget) errors.push(`${BID.text} — 견적 ${calc.clientPrice}만 > 수주금액 ${BID.budget}만`);
  if (calc.clientPrice !== BID.budget) errors.push(`${BID.text} — 부를 금액이 수주금액 ${BID.budget}만이 아님 (${calc.clientPrice}만)`);
  if (quote.total !== BID.budget) errors.push(`${BID.text} — 견적서 합계 ${quote.total}만 ≠ 수주금액 ${BID.budget}만`);
  ['원가', '마진', '실행원가', '80%', '알선'].forEach((word) => {
    if (clientText.includes(word)) errors.push(`${BID.text} — 손님 문서·문자에 '${word}' 노출`);
  });
}

fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: rows.length, errors, rows }, null, 2));

console.log('요청문'.padEnd(40), '공종'.padEnd(13), '규모'.padEnd(8), '견적', '원가', '일', '인원');
console.log('-'.repeat(104));
for (const r of rows) {
  console.log(
    r.text.padEnd(40),
    String(r.trade).padEnd(13),
    String(r.size).padEnd(8),
    String(r.price + '만').padStart(6),
    String(r.cost + '만').padStart(5),
    String(r.days ?? '-').padStart(3),
    String(r.crew ?? '-').padStart(3)
  );
}
console.log('');
console.log(`결과: ${rows.length}건 중 오류 ${errors.length}건`);
errors.forEach((e) => console.log('  ✗ ' + e));
console.log(`저장: ${path.relative(path.resolve(__dirname, '..'), OUT)}`);
if (errors.length) process.exitCode = 1;
