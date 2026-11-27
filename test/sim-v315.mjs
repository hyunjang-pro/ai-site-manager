// v3.15 실전 시나리오 40+ — 실제 현장에서 들어올 법한 자연어를 그대로 돌려 분류·가견적·원가·인원을 검토한다.
// 실행: node test/sim-v315.mjs
import { classifyRequest } from '../src/lib/classify.js';
import { composeCase } from '../src/lib/storage.js';
import { computeEstimate } from '../src/lib/pricing.js';

// [문장, 허용 공종, 견적 범위(만원), 조건]
const CASES = [
  // ── 주거 철거 ──
  ['원룸 6평 올철거', ['demolition'], [60, 160]],
  ['빌라 12평 전체 철거', ['demolition'], [180, 380]],
  ['18평 아파트 철거', ['demolition'], [230, 400]],
  ['24평 아파트 철거', ['demolition'], [280, 480]],
  ['32평 아파트 철거', ['demolition'], [380, 640]],
  ['40평 아파트 올철거', ['demolition'], [480, 900]],
  ['24평 아파트 장판 마루만 제거', ['demolition'], [40, 120]],
  ['34평 아파트 장판만 제거, 화장실 2개 철거 및 안방과 거실 샷시 제거, 부엌 씽크대와 선반 철거', ['demolition'], [90, 130]],
  ['10평 오피스텔 욕실 1칸 철거, 주방 철거', ['demolition', 'bathroom', 'kitchen'], [60, 180]],
  ['아파트 24평 거실·안방 샷시만 철거', ['demolition'], [30, 120]],
  // ── 상가·점포 ──
  ['상가 15평 원상복구', ['demolition'], [220, 420]],
  ['카페 20평 원상복구 집기 포함', ['demolition', 'waste'], [250, 560]],
  ['사무실 10평 칸막이·텍스천장 철거', ['demolition'], [100, 320]],
  ['미용실 12평 원상복구', ['demolition'], [180, 420]],
  ['편의점 20평 원상복구 간판 포함', ['demolition'], [250, 540]],
  ['식당 25평 원상복구 덕트 철거', ['demolition'], [280, 700]],
  ['상가 1층 간판 2개 철거 스카이차 필요', ['demolition'], [70, 170]],
  ['천장 텍스 20평 철거', ['demolition'], [60, 180]],
  // ── 인테리어 ──
  ['15평 원룸 도배 장판', ['wallpaper'], [150, 320]],
  ['24평 아파트 도배 장판', ['wallpaper'], [220, 380]],
  ['아파트 30평 도배만', ['wallpaper'], [250, 480]],
  ['욕실 1칸 올수리', ['bathroom'], [380, 720]],
  ['욕실 2칸 올수리', ['bathroom'], [700, 1350]],
  // 욕실 1칸 타일만 교체는 시세 250~400만 (도기·수전 유지, 예전 450~680 기대값은 과대 계산 고정)
  ['욕실 1칸 타일만 교체', ['bathroom', 'tilewaterproof'], [250, 400]],
  ['주방 싱크대 3m 교체', ['kitchen'], [300, 580]],
  ['아파트 샷시 4짝 교체', ['window'], [150, 480]],
  ['발코니 확장 창호 8㎡', ['window'], [250, 480]],
  ['거실 필름 시공 15㎡', ['film'], [60, 160]],
  ['콘센트 10개 증설', ['electric'], [80, 220]],
  ['수전 2개 교체', ['plumbing'], [50, 150]],
  ['24평 아파트 전체 인테리어', ['combined'], [2000, 3600]],
  ['32평 아파트 올수리 확장 포함', ['combined'], [3000, 5000]],
  // ── 혼합(철거+시공) ──
  ['24평 아파트 철거 후 도배 장판', ['wallpaper', 'combined'], [300, 850]],
  ['15평 상가 철거하고 욕실 1칸 올수리까지', ['combined', 'bathroom'], [500, 1200]],
  ['상가 15평 철거 후 바닥 데코타일 시공', ['combined', 'demolition'], [300, 800]],
  // ── 폐기물 ──
  ['원룸 생활폐기물 반차', ['waste'], [20, 50]],
  ['폐기물 1톤 트럭 한차', ['waste'], [30, 75]],
  ['2.5톤 폐기물 처리', ['waste'], [70, 140]],
  ['5톤 폐기물 차량 한대', ['waste'], [130, 270]],
  ['상가 폐업 집기·비품 정리 2톤', ['waste'], [60, 180]],
  // ── 인력·수선 ──
  ['인부 3명 2일', ['labor'], [150, 300]],
  ['학교 화장실 변기 1개 교체 수선', ['repair', 'plumbing', 'bathroom'], [40, 160]],
  ['아파트 현관 중문 교체', ['repair', 'carpentry', 'window'], [60, 250]],
];

const rows = [];
const flags = [];
for (const [text, trades, range] of CASES) {
  const r = classifyRequest(text);
  const trade = r.trade === 'unclassified' ? 'custom' : r.trade;
  const c = composeCase({ trade, patch: r.patch });
  const calc = computeEstimate(c);
  const price = Math.round(calc.clientPrice);
  const cost = Math.round(calc.totalDirectCost);
  const base = Math.max(1, cost);
  const share = (v) => Math.round((Math.max(0, v) / base) * 100);
  const mats = (calc.items || []).filter((i) => i.category === '자재' && Number(i.amount) > 0).length;
  rows.push({
    text,
    trade,
    size: `${c.sizeValue || ''}${c.sizeUnit || ''}`,
    price,
    cost,
    margin: calc.marginBuffered,
    days: calc.workDays,
    crew: calc.crewPlan?.crew,
    labor: share(calc.laborTotal),
    waste: share(calc.wasteTotal + calc.equipTotal),
    material: share(calc.materialTotal),
    mats,
    summary: calc.targetSummary,
  });
  if (!trades.includes(trade)) flags.push(`[분류] ${text} → ${trade} (기대 ${trades.join('/')})`);
  if (price < range[0] || price > range[1]) flags.push(`[금액] ${text} → ${price}만 (기대 ${range[0]}~${range[1]})`);
  // 크리틱: 철거만인데 자재가 잡히면 안 된다
  if (trade === 'demolition' && mats) flags.push(`[자재] ${text} — 철거만인데 자재 ${mats}건`);
  // 크리틱: 어떤 현장이든 폐기물·장비가 원가의 70%를 넘으면 확인
  if (!['waste','labor'].includes(trade) && share(calc.wasteTotal + calc.equipTotal) > 70) flags.push(`[비율] ${text} — 폐기물·장비가 원가의 ${share(calc.wasteTotal + calc.equipTotal)}%`);
  // 크리틱: 일수가 10일을 넘거나 0.5일 미만 (전체 인테리어는 양생·발주 대기로 2~3주가 정상이라 25일까지 허용)
  const daysLimit = trade === 'combined' && c?.fullInterior ? 25 : 10;
  if (calc.workDays > daysLimit || calc.workDays < 0.5) flags.push(`[일수] ${text} — ${calc.workDays}일`);
  // 크리틱: 마진이 60%를 넘거나 적자
  if (calc.marginBuffered > 60 || calc.marginBuffered < 5) flags.push(`[마진] ${text} — ${calc.marginBuffered}% (견적 ${price} / 원가 ${cost})`);
}

console.log('요청문'.padEnd(40), '공종'.padEnd(12), '규모'.padEnd(6), '견적'.padStart(6), '원가'.padStart(5), '남%'.padStart(4), '일'.padStart(4), '인원'.padStart(3), ' 인건/폐기/자재%');
console.log('-'.repeat(110));
for (const r of rows) {
  console.log(
    r.text.slice(0, 38).padEnd(40),
    String(r.trade).padEnd(12),
    String(r.size).padEnd(6),
    String(r.price + '만').padStart(6),
    String(r.cost + '만').padStart(5),
    String(r.margin).padStart(4),
    String(r.days).padStart(4),
    String(r.crew ?? '-').padStart(3),
    ` ${r.labor}/${r.waste}/${r.material}`
  );
}
console.log(`\n시나리오 ${rows.length}건 · 확인 ${flags.length}건`);
flags.forEach((f) => console.log('  ! ' + f));
