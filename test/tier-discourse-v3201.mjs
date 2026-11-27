// v3.20.1 Holdout — 요청서 층(Tier 1 라벨 / Tier 2 자유 서술) 과 절의 담화 역할(요청 vs 배경) 검증.
// 실행: node test/tier-discourse-v3201.mjs   (결과: screenshots/tier-discourse-v3201.json)
//
// 제보(2026-11-28): 숨고 폐기물 요청서에 '폐기물 처리'·'폐기물 양 1톤~2.5톤차'라고 적혀 있는데
//   자유 서술의 "베이커리 철거 전"이라는 배경 설명 하나가 주공종을 '철거'로 덮어써
//   '안동 15평 철거 371만'이 나갔다.
//
// 이 파일은 그 사고가 **어떤 형태로 다시 와도** 같은 결론(폐기물·2.5톤·90만)이 나오는지 본다.
//   A. 숨고 요청서 실제 형태 12종 (라벨 우선)
//   B. 배경·시점·제외·대체 표현 26종 (절의 담화 역할)
// 판정: 공종 · 고객가 범위 · 폐기물 차량 · 안내 문구 · 정리본 재분류 일치
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyRequest, summarizeRequest } from '../src/lib/classify.js';
import { composeCase } from '../src/lib/storage.js';
import { computeEstimate } from '../src/lib/pricing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'screenshots', 'tier-discourse-v3201.json');

const sheet = (lines) => lines.join('\n');

// ── A. 숨고 요청서 실제 형태 12종 — [이름, 원문, 조건] ──────────────
const SHEETS = [
  {
    name: 'A1 제보 원문 — 폐기물 처리 · 베이커리 철거 전',
    text: sheet([
      '폐기물 처리',
      '협의 가능해요',
      '경북 안동시 옥동',
      '폐기물 타입 기타',
      '희망 서비스 폐기물 배출 + 수거',
      '재활용 가능 여부 네.',
      '폐기물 양 1톤~2.5톤차',
      '서비스 범위 1층/외부에서 바로 수거 가능',
      '문의/희망사항 지금 작성할게요: 베이커리 철거 전 중고 판매 처리 불가능한 물품과 포장재, 식자재, 음식물 등등 폐기물처리하려고 합니다.',
    ]),
    trade: ['waste'],
    price: [80, 100],
    ton: 2.5,
    vehicle: 'ton25',
    hints: [/음식물·액체류/, /1톤~2\.5톤/],
    noDemo: true,
  },
  {
    name: 'A2 폐기물 처리 · 이사 후 생활폐기물 한차',
    text: sheet([
      '폐기물 처리',
      '협의 가능해요',
      '경북 안동시 풍산읍',
      '폐기물 타입 생활폐기물',
      '희망 서비스 폐기물 배출 + 수거',
      '재활용 가능 여부 아니요.',
      '폐기물 양 1톤차',
      '서비스 범위 3층/엘리베이터 있음',
      '문의/희망사항 이사 후 남은 가구와 가전 정리하려고 합니다.',
    ]),
    trade: ['waste'],
    price: [45, 62],
    ton: 1,
    vehicle: 'ton1',
    noDemo: true,
  },
  {
    name: 'A3 폐기물 처리 · 카페 폐업 식자재·음식물',
    text: sheet([
      '폐기물 처리',
      '경북 안동시',
      '폐기물 타입 기타',
      '희망 서비스 폐기물 배출 + 수거',
      '폐기물 양 2.5톤차',
      '문의/희망사항 카페 폐업 전 식자재랑 음식물, 포장재 처리하려고 합니다.',
    ]),
    trade: ['waste'],
    price: [80, 100],
    ton: 2.5,
    vehicle: 'ton25',
    hints: [/음식물·액체류/],
    noDemo: true,
  },
  {
    name: 'A4 철거 · 음식점 15평 원상복구 (폐기물 포함)',
    text: sheet([
      '철거',
      '협의 가능해요',
      '경북 안동시 옥동',
      '서비스 분야 철거',
      '공간 유형 식당',
      '공급면적 15평',
      '철거 범위 전체 철거(원상복구)',
      '문의/희망사항 폐기물 포함해서 견적 주세요.',
    ]),
    trade: ['demolition'],
    price: [280, 470],
  },
  {
    name: 'A5 철거 · 상가 20평 (리모델링 전)',
    text: sheet([
      '철거',
      '경북 안동시',
      '서비스 분야 철거',
      '공급면적 상가 20평',
      '문의/희망사항 리모델링 전에 철거하고 폐기물까지 반출 원합니다.',
    ]),
    trade: ['demolition'],
    price: [380, 620],
  },
  {
    name: 'A6 주거 인테리어 · 24평 도배·장판 (입주 전)',
    text: sheet([
      '주거 인테리어',
      '경북 안동시',
      '서비스 분야 부분 인테리어',
      '공급면적 24평 도배·장판',
      '계약 상태 현재 입주 중',
      '문의/희망사항 입주 전에 도배 장판 하려고 합니다.',
    ]),
    trade: ['wallpaper'],
    price: [250, 420],
    noDemo: true,
  },
  {
    name: 'A7 주거 인테리어 · 욕실 1칸 올수리 (철거 전 사전 답사)',
    text: sheet([
      '주거 인테리어',
      '서비스 분야 부분 인테리어',
      '공급면적 욕실 1칸 올수리',
      '문의/희망사항 철거 전에 도기랑 타일 먼저 보고 싶어요.',
    ]),
    trade: ['bathroom'],
    price: [330, 720],
  },
  {
    name: 'A8 주거 인테리어 · 주방 싱크대 3m 교체 (인테리어 전)',
    text: sheet([
      '주거 인테리어',
      '서비스 분야 부분 인테리어',
      '공급면적 주방 싱크대 3m 교체',
      '문의/희망사항 인테리어 전에 싱크대부터 교체하려고 합니다.',
    ]),
    trade: ['kitchen'],
    price: [300, 620],
  },
  {
    name: 'A9 폐기물 처리 · 사무실 이전 집기 정리',
    text: sheet([
      '폐기물 처리',
      '서비스 분야 폐기물 수거',
      '폐기물 타입 사무용품',
      '폐기물 양 2.5톤차',
      '경북 안동시',
      '문의/희망사항 사무실 이전 전에 책상·의자·파티션 폐기물 처리하려고 합니다.',
    ]),
    trade: ['waste'],
    price: [80, 100],
    ton: 2.5,
    vehicle: 'ton25',
    noDemo: true,
  },
  {
    name: 'A10 인력 지원 · 철거 인부 3명 2일',
    text: sheet([
      '인력 지원',
      '서비스 분야 인력',
      '공급면적 철거 인부 3명 2일',
      '문의/희망사항 철거 예정인데 인부만 보내주세요.',
    ]),
    trade: ['labor'],
    price: [130, 260],
  },
  {
    name: 'A11 주거 인테리어 · 욕실 벽 타일 15㎡ (리모델링 전)',
    text: sheet([
      '주거 인테리어',
      '서비스 분야 부분 인테리어',
      '공급면적 욕실 벽 타일 15㎡',
      '문의/희망사항 리모델링 전에 타일만 먼저 보고 싶어요.',
    ]),
    trade: ['tilewaterproof', 'bathroom'],
    price: [110, 330],
  },
  {
    name: 'A12 상업공간 철거 · 가벽 6m (오픈 전)',
    text: sheet([
      '상업공간 철거',
      '서비스 분야 철거',
      '공급면적 가벽 6m 철거',
      '문의/희망사항 오픈 전에 가벽 철거하고 폐기물 반출까지 부탁드립니다.',
    ]),
    trade: ['demolition'],
    price: [40, 180],
  },
];

// ── B. 배경·시점·제외·대체 표현 26종 ────────────────────────────────
const SENTENCES = [
  // 시점(~전·앞두고)
  ['인테리어 전에 폐기물만 먼저 치워주세요', ['waste'], [45, 62]],
  ['리모델링 앞두고 2.5톤 반출', ['waste'], [80, 100]],
  ['철거 전 폐기물 3톤 반출', ['waste'], [95, 130]],
  ['이사 전에 살림 정리 1톤', ['waste'], [45, 62]],
  ['입주 앞두고 도배만 20평', ['wallpaper'], [110, 210]],
  ['신축 입주 전 샷시 4짝 교체', ['window', 'repair'], [200, 400]],
  ['오픈 전 집기 정리 2톤', ['waste'], [80, 100]],
  ['욕실 공사 전에 폐기물 2톤', ['waste'], [80, 100]],
  ['화장실 철거 전에 폐기물 1톤', ['waste'], [45, 62]],
  ['베이커리 철거 전 포장재랑 식자재 폐기물 처리', ['waste'], [45, 62]],
  ['폐기물 처리 전에 철거부터 15평', ['demolition'], [280, 470]],
  ['공사 중 나온 폐기물 1톤', ['waste'], [45, 62]],
  // 제외·대체
  ['기존 인테리어 뜯지 않고 필름만 새로', ['film'], [50, 160]],
  ['철거 말고 폐기물만 1톤', ['waste'], [45, 62]],
  ['인테리어 빼고 도배만 24평', ['wallpaper'], [140, 280]],
  ['철거는 안 하고 도배만 24평', ['wallpaper'], [140, 280]],
  ['리모델링 하려다 도배만 하려고요 24평', ['wallpaper'], [140, 280]],
  ['인테리어 하려고 했는데 예산 때문에 도배만 20평', ['wallpaper'], [110, 210]],
  ['리모델링 하려다가 예산 때문에 폐기물만 2톤', ['waste'], [80, 100]],
  // 원인·사정
  ['카페 폐업해서 집기 치워요', ['waste'], [60, 100]],
  ['가게 접어서 집기 2.5톤 처리', ['waste'], [80, 100]],
  ['예전에 쓰던 집기 폐기물 1톤', ['waste'], [45, 62]],
  ['카페 폐업 정리 3톤', ['waste'], [95, 130]],
  // 순서(~후) — 이건 배경이 아니라 우리가 하는 일이다
  ['철거 후 도배 장판 24평', ['combined'], [450, 800]],
  ['철거하고 도배 장판 24평', ['combined'], [450, 800]],
  ['기존 마루 철거 후 강마루 시공 24평', ['wallpaper'], [350, 700]],
  // 한마디로 '다음 달·오늘·먼저'가 쉬인 실전 문장
  ['철거 전에 폐기물 처리 2톤 견적 부탁드려요', ['waste'], [80, 100]],
  ['폐기물만 처리하고 철거는 다음에 1톤', ['waste'], [45, 62]],
  ['인테리어 예정이라 짐 먼저 빼야 해요 2톤', ['waste'], [80, 100]],
  ['철거는 다음 달이라 폐기물만 오늘 2톤', ['waste'], [80, 100]],
  ['이사 예정이라 살림 정리 1톤', ['waste'], [45, 62]],
  ['오픈 전이라 집기 2톤 처리', ['waste'], [80, 100]],
  ['폐기물 처리 전 견적 먼저 주세요 1톤', ['waste'], [45, 62]],
  ['도배 전에 기존 벽지 뜯어내야 하나요 24평', ['demolition'], [50, 120]],
  ['샷시 교체 전에 기존 샷시 철거 4짝', ['demolition'], [30, 90]],
];

const errors = [];
const rows = [];
const jsonRows = [];

const check = (name, cond, detail) => {
  if (!cond) errors.push(`${name} — ${detail}`);
};

function evaluate(tc, kind) {
  const res = classifyRequest(tc.text);
  const summary = summarizeRequest(tc.text, res);
  const term = tc.term || tc;
  const c = composeCase({ trade: res.trade, patch: { ...res.patch, rawInput: summary } });
  const calc = computeEstimate(c);
  const price = Math.round(Number(calc.finalPrice) || 0);
  const hints = res.patch.parseHints || [];
  const row = {
    kind,
    name: term.name || tc.text,
    trade: res.trade,
    declared: res.spec?.declared || null,
    narrative: res.spec?.narrativeTrade || null,
    background: res.spec?.parsed?.background?.words || [],
    size: `${res.patch.sizeValue}${res.patch.sizeUnit}`,
    vehicle: res.patch.wasteVehicle || '',
    price,
    cost: Math.round(calc.totalDirectCost),
    summary: calc.targetSummary,
    hints,
  };
  rows.push(row);
  jsonRows.push({ ...row, text: tc.text });

  const label = row.name.slice(0, 44);
  check(label, tc.trade.includes(res.trade), `공종 ${res.trade} (기대 ${tc.trade.join('/')})`);
  check(label, price >= tc.price[0] && price <= tc.price[1], `견적 ${price}만 (기대 ${tc.price[0]}~${tc.price[1]})`);
  check(label, calc.totalDirectCost < price, `원가 ${Math.round(calc.totalDirectCost)}만 ≥ 견적 ${price}만`);
  check(label, calc.workDays > 0 && calc.workDays <= 40, `공사일수 ${calc.workDays}일`);
  if (tc.ton) check(label, Number(res.patch.sizeValue) === tc.ton, `톤수 ${res.patch.sizeValue} (기대 ${tc.ton})`);
  if (tc.vehicle) check(label, res.patch.wasteVehicle === tc.vehicle, `차량 ${res.patch.wasteVehicle} (기대 ${tc.vehicle})`);
  (tc.hints || []).forEach((re) => check(label, hints.some((h) => re.test(h)), `안내 '${re}' 없음`));
  if (tc.noDemo) check(label, res.trade !== 'demolition' && !/철거/.test(calc.targetSummary), `철거로 잡힘: ${calc.targetSummary}`);
  // 정리본을 다시 분류해도 같은 공종 (앱이 정리본으로 재계산하는 경로)
  const again = classifyRequest(summary);
  check(`${label} (재분류)`, again.trade === res.trade, `${again.trade} ≠ ${res.trade}`);
  // 4축 합계 = 원가
  const axisSum = ['material', 'labor', 'equip', 'waste'].reduce((s, a) => s + (calc.axisTotals?.[a] || 0), 0);
  check(label, Math.abs(axisSum - calc.totalDirectCost) <= 1, `4축 합 ${axisSum} ≠ 원가 ${Math.round(calc.totalDirectCost)}`);
}

SHEETS.forEach((s) => evaluate({ ...s, term: { name: s.name } }, 'sheet'));
SENTENCES.forEach(([text, trade, price]) => evaluate({ text, trade, price, name: text }, 'sentence'));

fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: rows.length, errors, rows: jsonRows }, null, 2));

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('요청', 46), pad('공종', 13), pad('규모', 8), pad('차량', 7), '견적');
console.log('-'.repeat(86));
rows.forEach((r) => console.log(pad(r.name.slice(0, 44), 46), pad(r.trade, 13), pad(r.size, 8), pad(r.vehicle || '-', 7), `${r.price}만`));
console.log(`\n검사 ${rows.length}건 · 오류 ${errors.length}건`);
errors.forEach((e) => console.log(`  ✗ ${e}`));
process.exit(errors.length ? 1 : 0);
