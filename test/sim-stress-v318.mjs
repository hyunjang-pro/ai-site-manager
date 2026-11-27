// v3.18 대규모 시세·분류 검증 — 기존 141건(quote-sim 30 · quote-sim-v313 59 · audit-v314 30 · sim-extra-v317 22)과
// 겹치지 않는 실전 현장 63건 + 관공서 공고 3건.
// 실행: node test/sim-stress-v318.mjs   (결과: screenshots/sim-stress-v318.json)
//
// 시세 근거 (work/interior-quote-db-2026.json · real-interior-quotes-2026.md · docs/rates-2026.md)
//  · 상가 원상복구: 안동 18~28만/평(중간 23) / 청년철거 32평 810만(25만/평) / 20평 160~336만
//  · 욕실: 덧방 300~380만, 올철거+방수 300각 280~420, 600각 420~556, 2칸(올+덧) 880만 (BTH-PKG)
//    타일 자재+시공 2.7만/㎡(300×600), 타일공 35만/일, 욕실 타일만 교체 시세 250~400만
//  · 도배: 24평 합지 88만 공급가 · 실크 163만 / 장판 2.2T 2.1만/㎡ 도급 · 강마루 15만/평 + 철거 2.8만/평
//    데코타일 도급 2.4~2.8만/㎡ · 4.5T 장판 2.6만/㎡
//  · 폐기물 1톤 40~45 · 2.5톤 70~80 · 톤당 32만(상차·운반·처리 포함)
//  · 인력: 1명 1일 청구 26만(기능공 32만) / 타일공 35 · 목수 30~32 · 미장 27 · 용접 35~40
//  · 사다리차 2~5층 12~35만 · 10층+ 25~65만 / 굴삭기(미니) 25~40만/일
//  · 중문 3연동 45~60만 · 방충망 3.5~8.3만/짝 · 상판(인조대리석) 16~40만/m
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyRequest } from '../src/lib/classify.js';
import { composeCase } from '../src/lib/storage.js';
import { computeEstimate } from '../src/lib/pricing.js';
import { isDemoOnlyText } from '../src/lib/scope.js';
import { buildQuote, quoteText, clientQuoteMessage, estimateSms, constructionNoticeText } from '../src/lib/docs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'screenshots', 'sim-stress-v318.json');

// [요청문, 허용 공종, 고객가 범위(만원), 조건]
const CASES = [
  // ── A. 상가·특수 원상복구 ─────────────────────────────────────────
  ['카페 18평 원상복구 천장 텍스까지', ['demolition'], [280, 520], {}],
  ['미용실 20평 원상복구 바닥 데코타일 철거 포함', ['demolition'], [280, 520], {}],
  ['학원 30평 원상복구 칸막이 벽 철거', ['demolition'], [400, 750], {}],
  ['사무실 18평 원상복구 천장 석고 철거', ['demolition'], [280, 520], {}],
  ['식당 25평 원상복구 후드 덕트 철거', ['demolition'], [400, 800], {}],
  ['카페 12평 바닥 에폭시 제거', ['demolition'], [80, 180], { finishOnly: '에폭시' }],
  ['상가 20평 천장 텍스 철거만', ['demolition'], [100, 220], { finishOnly: '텍스' }],
  ['사무실 15평 데코타일 제거 후 새 데코타일 시공', ['wallpaper', 'combined'], [180, 320], { noWall: true, floorName: '데코타일' }],
  ['식당 외부 어닝 간판 철거', ['demolition'], [30, 120], { small: true }],
  ['매장 10평 원상복구 가벽 3개 철거', ['demolition', 'combined'], [220, 450], {}],

  // ── B. 바닥·벽지 세부 ────────────────────────────────────────────
  ['24평 아파트 합지 도배', ['wallpaper'], [150, 300], { noFloor: true }],
  ['32평 아파트 실크 도배', ['wallpaper'], [200, 400], { noFloor: true }],
  ['32평 아파트 장판 2.2T', ['wallpaper'], [180, 330], { noWall: true, floorName: '2.2T' }],
  ['24평 아파트 장판 4.5T', ['wallpaper'], [200, 360], { noWall: true, floorName: '4.5T' }],
  ['24평 아파트 강마루 시공', ['wallpaper'], [330, 560], { noWall: true, floorName: '강마루' }],
  ['기존 마루 철거 후 강마루 30평', ['wallpaper'], [420, 700], { noWall: true, floorName: '강마루' }],
  ['상가 20평 데코타일 시공', ['wallpaper'], [180, 340], { noWall: true, floorName: '데코타일' }],
  ['원룸 6평 장판 2.2T', ['wallpaper'], [50, 110], { noWall: true }],

  // ── C. 욕실·타일 정밀화 ──────────────────────────────────────────
  ['욕실 1칸 타일만 교체', ['bathroom'], [250, 400], { noFixture: true }],
  ['욕실 1칸 덧방 타일', ['bathroom'], [250, 420], { noFixture: true }],
  ['욕실 1칸 전체 철거 방수 타일 도기 올수리', ['bathroom'], [420, 620], { hasFixture: true }],
  ['욕실 2칸 올수리', ['bathroom'], [750, 1150], { kans: 2 }],
  ['주방 벽 타일 15㎡', ['tilewaterproof'], [100, 280], { noSink: true }],
  ['현관 타일 6㎡', ['tilewaterproof'], [80, 220], {}],
  ['욕실 1칸 타일 도기 교체', ['bathroom'], [400, 650], { hasFixture: true }],
  ['화장실 1칸 바닥 타일만 교체', ['bathroom'], [200, 380], { noFixture: true }],

  // ── D. 복합 공사 (2~4개 공종) ────────────────────────────────────
  ['30평 아파트 철거하고 도배 장판 조명까지', ['combined'], [750, 1200], { scopes: ['demolition', 'electric'], hasItem: '전기|등기구|조명' }],
  ['상가 20평 칸막이 철거 후 페인트 바닥 데코타일', ['combined'], [400, 750], { scopes: ['demolition', 'paint', 'floor'] }],
  ['화장실 2칸 올수리 중문 필름', ['combined'], [950, 1500], { scopes: ['bathroom', 'film'] }],
  ['24평 아파트 도배 장판 욕실1칸', ['combined'], [620, 950], { scopes: ['wallpaper', 'floor', 'bathroom'], noDouble: true }],
  ['32평 아파트 철거 도배 장판', ['combined'], [700, 1100], { scopes: ['demolition', 'wallpaper', 'floor'] }],
  ['사무실 15평 철거 후 도장 데코타일 조명', ['combined'], [380, 700], { scopes: ['demolition', 'paint', 'floor', 'electric'] }],
  ['원룸 8평 전체 인테리어 도배 장판 욕실', ['combined'], [850, 1600], {}],
  ['15평 상가 철거 후 원상복구 도장 바닥', ['combined'], [350, 650], { scopes: ['demolition', 'paint', 'floor'] }],

  // ── E. 인력·장비·특수 조건 ───────────────────────────────────────
  ['철거 인력 3명 2일', ['labor'], [130, 210], { people: 3, laborDays: 2 }],
  ['타일공 2명 3일 지원', ['labor'], [150, 240], { people: 2, laborDays: 3 }],
  ['목수 1명 2일', ['labor'], [50, 100], { people: 1, laborDays: 2 }],
  ['용접공 2명 1일', ['labor'], [50, 110], { people: 2, laborDays: 1 }],
  ['미장공 3명 2일', ['labor'], [150, 240], { people: 3, laborDays: 2 }],
  ['4층 상가 간판 철거 사다리차 필요', ['demolition'], [60, 180], { lift: true }],
  ['11층 사무실 철거 스카이차', ['demolition'], [300, 650], { lift: true, sizeUnknown: true }],
  ['마당 정지 미니 포크레인 1일', ['groundwork'], [80, 200], { equip: true }],
  ['5층 엘리베이터 없는 아파트 24평 철거', ['demolition'], [450, 750], { lift: true }],
  ['지하 1층 식당 20평 철거', ['demolition'], [330, 620], { lift: true }],
  ['주말 작업 20평 사무실 철거', ['demolition'], [300, 550], {}],
  ['예천 15평 상가 철거 출장', ['demolition'], [280, 550], { region: '예천' }],
  ['야간 작업 15평 사무실 철거', ['demolition'], [320, 620], {}],

  // ── F. 생활 수선·설비 ───────────────────────────────────────────
  ['중문 3연동 설치', ['repair'], [60, 140], {}],
  ['붙박이장 2개 철거', ['demolition'], [60, 130], { small: true }],
  ['싱크대 상판 인조대리석 교체 3m', ['kitchen'], [100, 220], { noSink: true }],
  ['샷시 실리콘 코킹', ['repair'], [30, 90], {}],
  ['방충망 8짝 교체', ['repair'], [40, 140], { spots: 8 }],
  ['누전 차단기 교체', ['electric'], [25, 80], {}],
  ['콘센트 5개 증설', ['electric'], [50, 130], {}],
  ['세면대 수전 교체', ['plumbing'], [25, 80], {}],

  // ── G. 구어체·함정 문장 ─────────────────────────────────────────
  ['내일 사람 3명만 보내줘 철거', ['labor'], [60, 120], { people: 3 }],
  ['물 새서 천장 뜯어야 될듯', ['repair'], [60, 180], {}],
  ['식당 주방 후드랑 타일 다 갈아야 함', ['tilewaterproof'], [150, 350], { hasItem: '후드', sizeUnknown: true }],
  ['창고 판넬 뜯고 고철 치우기', ['demolition'], [70, 250], {}],
  ['화장실이 두갠데 하나는 타일만 갈고 하나는 올수리', ['bathroom'], [700, 1100], { kans: 2 }],
  ['30평인데 벽지랑 장판만 새로', ['wallpaper'], [280, 480], {}],
  ['가게 접어서 다 뜯어내야 됨', ['demolition'], [250, 550], { sizeUnknown: true }],
  ['가게 15평인데 철거는 안 하고 도배 장판만', ['wallpaper'], [180, 320], { noDemo: true }],
];

const rows = [];
const errors = [];

for (const [text, trades, range, cond] of CASES) {
  const r = classifyRequest(text);
  const trade = r.trade === 'unclassified' ? 'custom' : r.trade;
  const c = composeCase({ trade, patch: r.patch });
  const calc = computeEstimate(c);
  const price = Math.round(calc.clientPrice);
  const cost = Math.round(calc.totalDirectCost);
  const items = (calc.items || []).filter((i) => Number(i.amount) > 0 && !i.excluded);
  const names = items.map((i) => `${i.category}:${i.name}`).join(' · ');

  rows.push({
    text,
    trade,
    size: `${c.sizeValue || ''}${c.sizeUnit || ''}`,
    price,
    cost,
    days: calc.workDays,
    crew: calc.crewPlan?.crew ?? null,
    margin: calc.marginPercent,
    summary: calc.targetSummary,
  });

  // 공통 판정
  if (!trades.includes(trade)) errors.push(`${text} — 공종 ${trade} (기대 ${trades.join('/')})`);
  if (price < range[0] || price > range[1]) errors.push(`${text} — 견적 ${price}만 (기대 ${range[0]}~${range[1]}만)`);
  if (cost > price) errors.push(`${text} — 원가 ${cost}만 > 견적 ${price}만 (적자)`);
  if (!(calc.workDays >= 0.5) || calc.workDays > 20) errors.push(`${text} — 공사일수 ${calc.workDays}일이 현실 범위 밖`);
  if (!(calc.crewPlan?.crew >= 1)) errors.push(`${text} — 추천 인원이 비어 있음`);
  if (!cond.sizeUnknown && !String(c.sizeValue || '').trim()) errors.push(`${text} — 규모가 비어 있음`);
  if (!cond.sizeUnknown && price > 0 && cost / price < 0.35) errors.push(`${text} — 원가율 ${Math.round((cost / price) * 100)}% (재료·인력이 35% 미만, 금액 근거 없음)`);

  // 조건별 판정
  if (cond.finishOnly) {
    // 마감재 한 가지만 뜯는 현장은 건물 전체 철거(벽체·전기·설비)가 아니라 마감 철거다
    const d = Number(c.sizeValue) || 0;
    const perPyung = d > 0 ? price / d : 99;
    if (perPyung > 12) errors.push(`${text} — 평당 ${perPyung.toFixed(1)}만 (마감 철거 평당 5~8만 수준 초과)`);
  }
  if (cond.noWall && items.some((i) => i.category === '자재' && /벽지/.test(i.name))) {
    errors.push(`${text} — 바닥 공사인데 벽지 자재가 붙음`);
  }
  if (cond.noFloor && items.some((i) => i.category === '자재' && /(?:장판|마루|데코타일|강마루)\s*\(/.test(i.name) && !/부자재/.test(i.name))) {
    errors.push(`${text} — 도배만인데 바닥 자재가 붙음`);
  }
  if (cond.floorName && !items.some((i) => /장판|마루|데코타일/.test(i.name) && i.name.includes(cond.floorName))) {
    errors.push(`${text} — 바닥 마감이 ${cond.floorName}로 계산되지 않음 (${names})`);
  }
  if (cond.noFixture && items.some((i) => /도기|수전/.test(i.name) && Number(i.amount) > 0)) {
    errors.push(`${text} — 타일만인데 도기·수전 교체가 붙음`);
  }
  if (cond.hasFixture && !items.some((i) => /도기/.test(i.name) && Number(i.amount) > 0)) {
    errors.push(`${text} — 도기·수전 교체를 말했는데 자재가 없음`);
  }
  if (cond.noSink && items.some((i) => /싱크대/.test(i.name) && Number(i.amount) > 0)) {
    errors.push(`${text} — 싱크대 교체가 아닌데 싱크대 자재가 붙음`);
  }
  if (cond.kans && Number(c.sizeValue) !== cond.kans) errors.push(`${text} — ${c.sizeValue}${c.sizeUnit} (기대 ${cond.kans}칸)`);
  if (cond.scopes) {
    const scopes = Array.isArray(c.subScopes) ? c.subScopes : [];
    cond.scopes.forEach((s) => {
      if (!scopes.includes(s)) errors.push(`${text} — 복합 범위에 ${s}가 빠졌습니다 (${scopes.join(',') || '없음'})`);
    });
  }
  if (cond.hasItem && !items.some((i) => new RegExp(cond.hasItem).test(i.name))) {
    errors.push(`${text} — ${cond.hasItem} 항목이 없음`);
  }
  if (cond.lift && !(calc.lifting?.cost > 0)) errors.push(`${text} — 층수·지하·장비 조건인데 양중비가 0`);
  if (cond.equip && !(calc.equipTotal > 0)) errors.push(`${text} — 장비(굴삭기) 비용이 없음`);
  if (cond.people && Number(c.sizeValue) !== cond.people) errors.push(`${text} — 인원 ${c.sizeValue}명 (기대 ${cond.people}명)`);
  if (cond.spots && Number(c.sizeValue) !== cond.spots) errors.push(`${text} — ${c.sizeValue}${c.sizeUnit} (기대 ${cond.spots}짝)`);
  if (cond.laborDays && Number(c.laborDays) !== cond.laborDays) errors.push(`${text} — ${c.laborDays}일 (기대 ${cond.laborDays}일)`);
  if (cond.region && c.region !== cond.region) errors.push(`${text} — 지역 ${c.region || '없음'} (기대 ${cond.region})`);
  if (cond.small && !isDemoOnlyText(text) && trade === 'demolition') {
    const pyung = Number(c.sizeValue) || 0;
    if (pyung >= 6 && c.sizeUnit === '평') errors.push(`${text} — 소형 철거인데 ${pyung}평 전체 철거로 잡힘`);
  }
  if (cond.noDemo && /철거/.test(calc.targetSummary || '') && calc.items?.some((i) => /철거 노무/.test(i.name || ''))) {
    errors.push(`${text} — 철거 제외라고 했는데 철거 노무가 들어감`);
  }
  if (cond.noDouble) {
    // 복합에서 같은 바닥재를 두 번(도배 칸 + 바닥 칸) 세지 않는다
    const floorItems = items.filter((i) => i.category === '자재' && /(?:장판|마루|데코타일|강마루)\s*\(/.test(i.name) && !/부자재/.test(i.name));
    if (floorItems.length > 1) errors.push(`${text} — 바닥 자재가 ${floorItems.length}줄로 중복 (${floorItems.map((i) => i.name).join(', ')})`);
  }
}

// ── H. 관공서 공고 — 예정가 800 / 2,200 / 4,500만: 80% 실행원가 하한 + 수주금액 고정 + 손님 문서 차단 ──
const BIDS = [
  { text: '안동시 동네 체육시설 창고 철거공사', budget: 800, trade: 'demolition', workTypes: ['demolition'] },
  { text: '안동시 청년센터 사무실 원상복구 공사', budget: 2200, trade: 'demolition', workTypes: ['demolition'] },
  { text: '안동시 농산물 저장창고 해체 및 정지 공사', budget: 4500, trade: 'demolition', workTypes: ['all'] },
];
for (const B of BIDS) {
  const r = classifyRequest(B.text);
  const trade = r.trade === 'unclassified' ? 'custom' : r.trade;
  const c = composeCase({ trade, patch: r.patch });
  c.bidBudget = B.budget;
  c.bid = { title: B.text, workTypes: B.workTypes, bidPrice: B.budget * 10000 };
  const calc = computeEstimate(c);
  const quote = buildQuote(c, calc, c.design, c.waste);
  const clientText = [quoteText(quote, calc), clientQuoteMessage(c, calc), estimateSms(c, calc, [], false), constructionNoticeText(c, calc)].join('\n');
  rows.push({
    text: B.text,
    trade: calc.trade,
    size: '공고',
    price: Math.round(calc.clientPrice),
    cost: Math.round(calc.totalDirectCost),
    days: calc.workDays,
    crew: calc.crewPlan?.crew ?? null,
    margin: calc.marginPercent,
    summary: `${calc.targetSummary} · 하한 ${calc.bidCostFloor}만`,
  });
  if (!calc.isBid) errors.push(`${B.text} — 공고로 인식되지 않음`);
  if (calc.bidCostFloor !== Math.round(B.budget * 0.8)) errors.push(`${B.text} — 실행원가 하한 ${calc.bidCostFloor}만 (기대 ${Math.round(B.budget * 0.8)}만)`);
  if (calc.totalDirectCost < calc.bidCostFloor) errors.push(`${B.text} — 원가 ${Math.round(calc.totalDirectCost)}만 < 하한 ${calc.bidCostFloor}만`);
  if (Math.round(calc.clientPrice) !== B.budget) errors.push(`${B.text} — 부를 금액 ${Math.round(calc.clientPrice)}만 ≠ 수주금액 ${B.budget}만`);
  if (quote.total !== B.budget) errors.push(`${B.text} — 견적서 합계 ${quote.total}만 ≠ 수주금액 ${B.budget}만`);
  ['원가', '마진', '실행원가', '80%', '알선', '일당'].forEach((word) => {
    if (clientText.includes(word)) errors.push(`${B.text} — 손님 문서·문자에 '${word}' 노출`);
  });
}

fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: rows.length, errors, rows }, null, 2));

console.log('요청문'.padEnd(44), '공종'.padEnd(14), '규모'.padEnd(7), '견적', '원가', '일', '인원', '마진');
console.log('-'.repeat(108));
for (const r of rows) {
  console.log(
    r.text.slice(0, 42).padEnd(44),
    String(r.trade).padEnd(14),
    String(r.size).padEnd(7),
    String(r.price + '만').padStart(6),
    String(r.cost + '만').padStart(5),
    String(r.days ?? '-').padStart(4),
    String(r.crew ?? '-').padStart(3),
    String((r.margin ?? 0) + '%').padStart(4)
  );
}
console.log('');
console.log(`결과: ${rows.length}건 중 오류 ${errors.length}건`);
errors.forEach((e) => console.log('  ✗ ' + e));
console.log(`저장: ${path.relative(path.resolve(__dirname, '..'), OUT)}`);
if (errors.length) process.exitCode = 1;
