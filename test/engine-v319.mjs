// v3.19 엔진 구조 검증 — 분류(구조화 파서)와 적산(4축 장부)의 불변식을 직접 확인한다.
// 실행: node test/engine-v319.mjs
//
//  ① 의도 모드 4가지가 문장만 보고 갈리는가
//  ② 품목 사전(authority·단위·표면 공사)이 공종을 하나만 고르는가
//  ③ 4축(자재·인건비·장비·폐기물) 합계 = 원가 (같은 돈을 두 축에 세지 않는다)
//  ④ 단가표(SSOT)의 축 합 = 뭉친 단가 (표를 쪼개도 금액이 바뀌지 않는다)
//  ⑤ 부분 철거·폐기물·인력이 평수 전체 단가로 튀지 않는가
import { classifyRequest } from '../src/lib/classify.js';
import { composeCase } from '../src/lib/storage.js';
import { computeEstimate } from '../src/lib/pricing.js';
import { parseText } from '../src/lib/engine/parse.js';
import { buildJobSpec } from '../src/lib/engine/jobspec.js';
import { RATE_BOOK, MATERIAL_RATES } from '../src/lib/engine/rate-book.js';
import { AXES, axisOf } from '../src/lib/engine/ledger.js';

const errors = [];
const ok = (name, cond, detail = '') => {
  if (!cond) errors.push(`${name}${detail ? ` — ${detail}` : ''}`);
};

// ① 의도 모드
const modes = [
  ['철거 인력 3명 2일', 'labor'],
  ['사람 두 명만 내일 보내주세요', 'labor'],
  ['주방 상판만 교체', 'part'],
  ['가스레인지 상판만 갈아주세요', 'part'],
  ['24평 아파트 도배 장판', 'general'],
  ['안동시 ○○동 창고 철거공사 (예정가 8,000,000원)', 'bid'],
];
for (const [text, mode] of modes) {
  const spec = buildJobSpec(text);
  ok(`모드 ${text}`, spec.mode === mode, `${spec.mode} ≠ ${mode}`);
}

// ② 공종 결정 — 한 낱말이 독식하지 않는다
const trades = [
  ['주방 벽 타일 15㎡', 'tilewaterproof'],
  ['주방 상판만 교체', 'kitchen'],
  ['욕실 1칸 타일만 교체', 'bathroom'],
  ['욕실 타일 20㎡', 'tilewaterproof'],
  ['문짝 도장', 'repair'],
  ['아파트 34평 샷시 문짝 싱크대 필름 리폼', 'film'],
  ['싱크대 수전 배관 교체', 'plumbing'],
  ['공실 사무실 15평 원상복구', 'demolition'],
  ['철거는 안 하고 도배 장판만 24평', 'wallpaper'],
  ['화장실이 두갠데 하나는 타일만 갈고 하나는 올수리', 'bathroom'],
];
for (const [text, trade] of trades) {
  const r = classifyRequest(text);
  ok(`공종 ${text}`, r.trade === trade, `${r.trade} ≠ ${trade}`);
}

// ③ 4축 합계 불변식
const invariants = [
  '상가 15평 원상복구',
  '24평 아파트 도배 장판',
  '욕실 2칸 올수리',
  '주방 싱크대 3m 교체',
  '철거하고 도배 장판까지 24평',
  '원룸 생활폐기물 반차',
  '인부 3명 2일',
  '안동 20평 상가 철거랑 부지 정지 작업 같이 해야 함',
];
for (const text of invariants) {
  const r = classifyRequest(text);
  const c = composeCase({ trade: r.trade === 'unclassified' ? 'custom' : r.trade, patch: r.patch });
  const calc = computeEstimate(c);
  const sum = AXES.reduce((s, a) => s + (calc.axisTotals?.[a] || 0), 0);
  ok(`4축 합계 ${text}`, Math.abs(sum - Math.round(calc.totalDirectCost)) <= 1, `${sum} ≠ ${Math.round(calc.totalDirectCost)}`);
  // 항목 줄도 각자 축을 갖는다 (축 없는 줄 = 어디에도 안 세어지는 돈)
  const noAxis = (calc.items || []).filter((i) => Number(i.amount) !== 0 && !AXES.includes(axisOf(i)));
  ok(`축 없는 줄 ${text}`, noAxis.length === 0, noAxis.map((i) => i.name).join(', '));
}

// ④ 단가표 축 합 = 뭉친 단가
const bookChecks = [
  ['욕실 타일', RATE_BOOK.bathroom.tile, MATERIAL_RATES.bathroom.tilePer],
  ['욕실 철거', RATE_BOOK.bathroom.demolition, MATERIAL_RATES.bathroom.demolition],
  ['욕실 방수', RATE_BOOK.bathroom.waterproof, MATERIAL_RATES.bathroom.waterproofPer],
  ['싱크대', RATE_BOOK.kitchen.sinkPerM, MATERIAL_RATES.kitchen.sinkPerM],
  ['타일 시공', RATE_BOOK.tile.installPer, MATERIAL_RATES.tile.installPer],
  ['창호 자재', RATE_BOOK.window.matPerSqm, MATERIAL_RATES.window.matPerSqm],
  ['장판 1.8T', RATE_BOOK.wallpaper.floor.t18, MATERIAL_RATES.wallpaper.floor18],
  ['가벽 자재', RATE_BOOK.partition.wallPerM, MATERIAL_RATES.partition.wallPerM],
];
for (const [name, entry, expected] of bookChecks) {
  const sum = (entry.m || 0) + (entry.l || 0) + (entry.e || 0) + (entry.w || 0);
  ok(`단가표 ${name}`, Math.abs(sum - expected) < 0.001, `${sum} ≠ ${expected}`);
}

// ⑤ 소형·부분이 평수 전체 단가로 튀지 않는다
const small = [
  ['간판 1개 철거', 20, 70],
  ['싱크대 철거 및 수거', 15, 60],
  ['에어컨 벽걸이 철거', 10, 40],
];
for (const [text, low, high] of small) {
  const r = classifyRequest(text);
  const c = composeCase({ trade: r.trade, patch: r.patch });
  const calc = computeEstimate(c);
  const price = Math.round(calc.clientPrice);
  ok(`소형 ${text}`, price >= low && price <= high, `${price}만 (${low}~${high})`);
}

// ⑥ 파서가 문장을 절·품목·동작으로 나눈다 (설명 가능성)
const parsed = parseText('34평 아파트 장판만 제거, 화장실 2개 철거 및 부엌 싱크대 철거');
ok('파서: 절 분리', parsed.clauses.length >= 3, JSON.stringify(parsed.clauses.map((c) => c.text)));
ok('파서: 품목 추출', ['floor', 'bathroom', 'sink'].every((id) => parsed.mentions.some((m) => m.item.id === id)), parsed.mentions.map((m) => m.item.id).join(','));
ok('파서: 동작 짝짓기', parsed.ops.every((o) => o.action === 'remove'), parsed.ops.map((o) => `${o.itemId}:${o.action}`).join(','));

console.log(`엔진 불변식 ${modes.length + trades.length + invariants.length * 2 + bookChecks.length + small.length + 3}건 중 문제 ${errors.length}건`);
errors.forEach((e) => console.log('  ✗ ' + e));
if (errors.length) process.exitCode = 1;
