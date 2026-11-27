// 전 카테고리 전수 감사 (2026-11-26) — 실제 현장 문장으로 분류·금액·일수·자재 누수를 한 번에 본다.
// 실행: node test/audit-v314.mjs
import { classifyRequest } from '../src/lib/classify.js';
import { composeCase } from '../src/lib/storage.js';
import { computeEstimate } from '../src/lib/pricing.js';
import { isDemoOnlyText } from '../src/lib/scope.js';

const errors = [];

// [문장, 허용 공종, 견적 범위(만원) 또는 null, 조건]
const CASES = [
  // ── 이번 제보 (2026-11-26 실제 90만원 현장) ──
  {
    text: '34평 아파트 장판만 제거, 화장실 2개 철거 및 안방과 거실 샷시 제거, 부엌 씽크대와 선반 철거',
    trades: ['demolition'],
    price: [90, 130],
    demo: true,
    days: [0.5, 1.5],
    crew: 2,
  },
  { text: '34평 아파트 장판만 제거', trades: ['demolition'], price: [30, 90], demo: true },
  { text: '32평 아파트 장판 마루 씽크대 화장실2 샷시 철거', trades: ['demolition'], price: [80, 200], demo: true },
  { text: '32평 올철거 장판 마루 씽크대 화장실2 샷시', trades: ['demolition'], price: [380, 700] },
  { text: '상가 원상복구 칸막이 천장 바닥 철거', trades: ['demolition'], price: [200, 600] },
  { text: '거실 아트월이랑 붙박이장만 뜯어냄', trades: ['demolition'], price: [30, 120], demo: true },
  { text: '24평 아파트 거실·안방 샷시만 철거', trades: ['demolition'], price: [30, 120], demo: true },
  { text: '화장실 2개 철거', trades: ['bathroom'], price: [150, 320], demo: true },
  { text: '부엌 싱크대만 철거', trades: ['kitchen', 'demolition'], price: [20, 80], demo: true },
  { text: '아파트 18평 장판 다 뜯고 새로 깔아주세요', trades: ['wallpaper'], price: [100, 240] },
  { text: '24평 아파트 도배 장판만', trades: ['wallpaper'], price: [220, 380] },
  // 2026 시세: 욕실 1칸 타일만 교체(도기·수전 유지) 250~400만 — 예전 450~650 기대값은 앱의 과대 계산을 그대로 고정한 것이었다
  { text: '욕실 1칸 타일만 교체', trades: ['bathroom', 'tilewaterproof'], price: [250, 400] },
  { text: '24평 아파트 인테리어', trades: ['combined'], price: [2000, 3600] },
  { text: '철거하고 도배 장판까지 24평', trades: ['combined', 'wallpaper'], price: [300, 800] },
  // ── 폐기물 용량별 (v3.20: 차량 실비 반차 26 · 1톤 42.5 · 2.5톤 75만 + 올바로 3만 + 운용 마진 13%)
  { text: '원룸 생활폐기물 반차', trades: ['waste'], price: [30, 38], wasteTons: 0.5 },
  { text: '폐기물 1톤 트럭 한차', trades: ['waste'], price: [45, 60], wasteTons: 1 },
  { text: '2.5톤 폐기물 처리', trades: ['waste'], price: [85, 100], wasteTons: 2.5 },
  { text: '5톤 폐기물 차량 한대', trades: ['waste'], price: [170, 240], wasteTons: 5 },
  { text: '가게 폐업 집기 정리', trades: ['waste'], price: [80, 105] },
  // ── 일반 상가·사무실 철거 ──
  { text: '사무실 12평 원상복구', trades: ['demolition'], price: [180, 420] },
  { text: '카페 20평 철거', trades: ['demolition'], price: [230, 520] },
  { text: '마트 30평 원상복구 천장까지', trades: ['demolition'], price: [350, 750] },
  // ── 인테리어 세부 ──
  { text: '아파트 15평 도배만', trades: ['wallpaper'], price: [160, 320] },
  { text: '주방 싱크대 3m 교체', trades: ['kitchen'], price: [300, 560] },
  { text: '발코니 샷시 교체 4짝', trades: ['window'], price: [150, 450] },
  { text: '욕실 2칸 올수리', trades: ['bathroom'], price: [700, 1350] },
  { text: '콘센트 10개 추가 설치', trades: ['electric'], price: [80, 200] },
  // ── 철거 뒤 '새로 시공'이 붙은 경우는 철거가 아니라 시공 현장이다 ──
  { text: '아파트 24평 장판 철거 후 새 장판', trades: ['wallpaper'], price: [150, 320] },
  { text: '거실 샷시 철거하고 새 샷시 설치', trades: ['window', 'combined'], price: [150, 500] },
  { text: '욕실 타일 철거하고 새 타일 시공', trades: ['bathroom', 'tilewaterproof'], price: [300, 700] },
];

const rows = [];
for (const t of CASES) {
  const r = classifyRequest(t.text);
  const trade = r.trade === 'unclassified' ? 'custom' : r.trade;
  const c = composeCase({ trade, patch: r.patch });
  const calc = computeEstimate(c);
  const price = Math.round(calc.clientPrice);
  const mats = (calc.items || []).filter((i) => i.category === '자재' && Number(i.amount) > 0);
  const demoOnly = isDemoOnlyText(t.text);
  rows.push({ text: t.text, trade, size: `${c.sizeValue || ''}${c.sizeUnit || ''}`, price, days: calc.workDays, crew: calc.crewPlan?.crew, mats: mats.length, demoOnly });

  if (!t.trades.includes(trade)) errors.push(`[${t.text}] 공종 ${trade} (기대 ${t.trades.join('/')})`);
  if (t.price && (price < t.price[0] || price > t.price[1])) errors.push(`[${t.text}] 견적 ${price}만 (기대 ${t.price[0]}~${t.price[1]}만)`);
  if (t.demo && mats.length) errors.push(`[${t.text}] 철거만인데 자재비 ${mats.map((m) => m.name).join(', ')}`);
  if (t.days && (calc.workDays < t.days[0] || calc.workDays > t.days[1])) errors.push(`[${t.text}] 공사일수 ${calc.workDays}일 (기대 ${t.days[0]}~${t.days[1]})`);
  if (t.crew && calc.crewPlan?.crew !== t.crew) errors.push(`[${t.text}] 추천 인원 ${calc.crewPlan?.crew}명 (기대 ${t.crew}명)`);
  if (demoOnly && trade === 'combined') errors.push(`[${t.text}] 철거만인데 복합 인테리어로 분류`);
  if (t.wasteTons && Number(c.sizeValue) !== t.wasteTons) errors.push(`[${t.text}] 폐기물 ${c.sizeValue}톤 (기대 ${t.wasteTons}톤)`);
}

console.log('문장'.padEnd(42), '공종'.padEnd(12), '규모'.padEnd(7), '견적', '일', '인원');
console.log('-'.repeat(88));
for (const r of rows) {
  console.log(r.text.slice(0, 40).padEnd(42), String(r.trade).padEnd(12), String(r.size).padEnd(7), String(r.price + '만').padStart(6), String(r.days).padStart(4), String(r.crew || '-').padStart(3));
}
console.log(`\n결과: ${rows.length}건 중 오류 ${errors.length}건`);
errors.forEach((e) => console.log('  ✗ ' + e));
if (errors.length) process.exitCode = 1;
