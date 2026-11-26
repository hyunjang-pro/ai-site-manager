// 소형·부분 철거 (개수·품목 단위) — "간판 2개 철거", "싱크대 철거"처럼
// 평수 전체 철거가 아닌 현장. 평수 기본값(15평)을 적용하면 400~500만원이 나와
// 실제 숨고 시세(35~150만원)와 크게 어긋나므로, 품목·수량 기준으로 따로 계산한다.
//
// 2026-11 현장 사례: "장판 제거 / 화장실 2개 / 베란다 샷시 / 부엌 선반·싱크대 철거"를
// 실제로는 90만원에 진행했다. 예전 코드는 '장판'(도배)·'화장실'(욕실)·'싱크대'(주방)를
// 각각 시공 공종으로 읽어 복합 인테리어로 계산, 1,000만원이 넘었다.
// 뜯는 말(철거·제거·반출)만 있으면 품목별 해체로 계산한다.
import { getRate } from './rates.js';
import { isDemoOnlyText } from './scope.js';

// 품목별 2026 실무 기준 (원가, 만원). 노무는 '품목 1단위당 사람·일'로 계산한다.
export const PARTIAL_ITEMS = {
  sign: { label: '간판', unit: '개', skilled: 1, helper: 1, daysPer: 0.3, minDays: 0.5, wastePer: 4, tonsPer: 0.05, consum: 2, exterior: true, defaultQty: 1, hint: '철재·아크릴 해체 후 반출' },
  sink: { label: '싱크대', unit: '개', skilled: 1, helper: 0, daysPer: 0.2, minDays: 0.3, wastePer: 10, tonsPer: 0.15, consum: 1, defaultQty: 1, hint: '상·하부장 분해 후 수거' },
  builtin: { label: '붙박이장', unit: '개', skilled: 1, helper: 1, daysPer: 0.5, minDays: 0.5, wastePer: 10, tonsPer: 0.2, consum: 3, defaultQty: 1, hint: '분해 후 목재 폐기물 반출' },
  aircon: { label: '에어컨(벽걸이)', unit: '대', skilled: 1, helper: 0, daysPer: 0.25, minDays: 0.25, wastePer: 2, tonsPer: 0.02, consum: 2, defaultQty: 1, hint: '냉매 회수 후 실내기 분리' },
  airconOutdoor: { label: '에어컨 실외기', unit: '대', skilled: 1, helper: 0, daysPer: 0.25, minDays: 0.25, wastePer: 4, tonsPer: 0.04, consum: 2, exterior: true, defaultQty: 1, hint: '냉매 회수·배관 분리 후 반출' },
  partition: { label: '가벽·칸막이', unit: 'm', skilled: 1, helper: 1, daysPer: 0.15, minDays: 0.5, wastePer: 3, tonsPer: 0.05, consum: 2, defaultQty: 3, hint: '경량벽체·석고 해체' },
  window: { label: '샷시·창호', unit: '짝', skilled: 1, helper: 0, daysPer: 0.15, minDays: 0.3, wastePer: 4, tonsPer: 0.08, consum: 1, defaultQty: 1, hint: '창틀 해체·유리 반출' },
  ceiling: { label: '천장 텍스', unit: '평', skilled: 1, helper: 1, daysPer: 0.08, minDays: 0.5, wastePer: 2, tonsPer: 0.02, consum: 2, defaultQty: 5, hint: '석면 사전 확인 후 해체' },
  deck: { label: '데크·창고', unit: '식', skilled: 1, helper: 1, daysPer: 1, minDays: 1, wastePer: 25, tonsPer: 0.5, consum: 4, exterior: true, defaultQty: 1, hint: '외부 구조물 해체·반출' },
  furniture: { label: '가구', unit: '개', skilled: 0, helper: 1, daysPer: 0.3, minDays: 0.5, wastePer: 8, tonsPer: 0.1, consum: 2, defaultQty: 1, hint: '분해 후 수거' },
  // v3.13 — 실제 현장 빈출 품목. '장판 제거'를 도배 시공으로 읽지 않는다.
  floor: { label: '장판·마루', unit: '평', skilled: 1, helper: 0, daysPer: 0.03, minDays: 0.5, wastePer: 0.3, tonsPer: 0.01, consum: 1, defaultQty: 10, hint: '장판·마루 뜯어 마대' },
  decoTile: { label: '데코타일', unit: '평', skilled: 1, helper: 0, daysPer: 0.05, minDays: 0.5, wastePer: 1.2, tonsPer: 0.03, consum: 1, defaultQty: 10, hint: '데코타일·카펫 뜯어 마대 (장판보다 무겁다)' },
  woodFloor: { label: '마루', unit: '평', skilled: 1, helper: 0, daysPer: 0.05, minDays: 0.5, wastePer: 0.9, tonsPer: 0.02, consum: 1, defaultQty: 10, hint: '마루·합판 뜯어 마대 (못·본드 제거)' },
  wallpaper: { label: '벽지·도배지', unit: '평', skilled: 1, helper: 0, daysPer: 0.05, minDays: 0.5, wastePer: 1.2, tonsPer: 0.02, consum: 1, defaultQty: 15, hint: '벽지·초배지 긁어내기' },
  bathroom: { label: '욕실·화장실', unit: '칸', skilled: 2, helper: 1, daysPer: 0.35, minDays: 0.5, wastePer: 20, tonsPer: 0.4, consum: 2, defaultQty: 1, hint: '타일·도기·천장 해체' },
  shelf: { label: '선반·수납', unit: '개', skilled: 0, helper: 1, daysPer: 0.1, minDays: 0.25, wastePer: 3, tonsPer: 0.05, consum: 1, defaultQty: 1, hint: '벽 선반·수납장 분해' },
  door: { label: '문짝·문틀', unit: '개', skilled: 1, helper: 0, daysPer: 0.15, minDays: 0.25, wastePer: 3, tonsPer: 0.04, consum: 1, defaultQty: 1, hint: '경첩·문틀 분해 후 반출' },
};

const ITEM_MATCHERS = [
  ['airconOutdoor', /실외기|실외\s*기|옥외기/],
  ['aircon', /에어컨|에어콘|냉난방기|벽걸이/],
  ['sign', /간판|돌출간판|채널간판|사인물|사이니지|현판|입간판/],
  ['builtin', /붙박이장|붙박이\s*장|드레스룸|장롱|수납장/],
  ['shelf', /선반|진열대|진열장|액자장|코너장/],
  ['door', /문짝|문틀|방화문|도어/],
  ['sink', /싱크대|씽크대|개수대|조리대/],
  ['bathroom', /욕실|화장실|욕조|샤워부스/],
  ['decoTile', /데코타일|카펫/],
  ['woodFloor', /마루/],
  ['floor', /장판|바닥재/],
  ['wallpaper', /벽지|도배지|합지|실크/],
  ['window', /샷시|샤시|창호|창틀|유리창|미서기|붙박이창/],
  ['ceiling', /텍스|천장\s*재|천장\s*철거|천장\s*일부/],
  ['deck', /데크|창고|가건물|비닐하우스|조립식\s*창고/],
  ['partition', /가벽|경량벽체|칸막이|파티션|판넬\s*벽/],
  ['furniture', /침대|소파|장롱|책상|식탁|가구|냉장고|세탁기/],
];

const REMOVAL = /철거|해체|제거|반출|수거|버려|버리|치우|치워|없애|빼\s*주|뜯|분해|부수|부숴/;
// '수거만' 하는 요청(이사 폐기물·집기 정리)은 부분 철거가 아니라 폐기물 현장이다.
const COLLECT_ONLY = /폐기물|쓰레기|수거|반출|집기|비품|버려|버리|치우|치워/;
// 현장 전체를 뜯는 일은 부분 철거가 아니다
// '올철거·원상복구'는 평수가 몇이든 건물을 통째로 뜯는 말이라 품목 계산으로 내리지 않는다.
const STRONG_WHOLE = /원상복구|전체\s*철거|전부\s*철거|올\s*철거|전체\s*해체|집\s*전체|올수리|올\s*수리|인테리어|리모델링/;
const WHOLE_JOB = /철거\s*현장|전체\s*공사/;
const BIG_PLACE = /카페|음식점|식당|매장|사무실|공장|학교|관공서|병원|약국|학원|상가|빌딩|창고/;
// 공간 이름이 하나하나 나온 요청('안방·거실 샷시', '부엌 씽크대')은 고른 곳만 뜯는 현장이다.
// 이게 없고 '25평 학원 칸막이 철거'처럼 장소+평수만 있으면 건물 전체 일이 맞다.
const ROOM_WORDS = /안방|거실|방\s*\d|방\s*하나|화장실|욕실|부엌|주방|베란다|발코니|현관|샷시|창호|싱크대|씽크대|선반|붙박이|문짝/;

const KOR_QTY = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };

// 품목 이름 바로 뒤에 붙은 수량만 읽는다 ("화장실 2개 ... 싱크대 철거"에서
// 2개를 싱크대로 잘못 붙이던 문제).
function qtyNear(text, matchEnd, unit, keywordLen = 0) {
  const tail = text.slice(matchEnd, matchEnd + 12);
  const kor = tail.match(new RegExp(`^[^0-9]{0,4}(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\\s*(${unit})?`));
  if (kor) return KOR_QTY[kor[1]] || 0;
  const num = tail.match(new RegExp(`^[^0-9]{0,4}(\\d+(?:\\.\\d+)?)\\s*(${unit})?`));
  if (num) return Math.max(0.5, parseFloat(num[1]));
  if (unit === 'm') {
    const m = text.slice(Math.max(0, matchEnd - keywordLen), matchEnd + 8).match(/(\d+(?:\.\d+)?)\s*(?:m|미터)(?!\s*2)/);
    if (m) return Math.max(0.5, parseFloat(m[1]));
  }
  return 0;
}

// 글에서 '품목 + 수량 + 작업 난이도(스카이차/사다리)'를 읽는다.
export function detectPartial(rawText = '') {
  const text = String(rawText || '');
  const t = text.toLowerCase().replace(/\s+/g, ' ');
  if (!t || !REMOVAL.test(t)) return { on: false };
  if (COLLECT_ONLY.test(t) && !/철거|해체|분해|뜯|제거/.test(t)) return { on: false };

  const pyung = t.match(/(\d+(?:\.\d+)?)\s*평/);
  const pyungVal = pyung ? parseFloat(pyung[1]) : 0;

  const hits = [];
  for (const [id, re] of ITEM_MATCHERS) {
    const m = t.match(re);
    if (m) hits.push({ id, end: (m.index || 0) + m[0].length, len: m[0].length, at: m.index || 0 });
  }
  // 글에 나온 순서대로 보여 준다 (장판 → 화장실 → 샷시 → 선반 → 싱크대)
  hits.sort((a, b) => a.at - b.at);
  const ids = hits.map((h) => h.id);
  if (!ids.length) return { on: false };

  // 뜯는 말만 있고 새로 시공하겠다는 말이 없을 때만 '부분 철거'다.
  // "장판 철거하고 새 장판 깔기"는 철거가 아니라 도배·장판 시공 현장이다.
  if (!isDemoOnlyText(t)) return { on: false };
  // '원상복구·올철거·인테리어'가 적혀 있으면 평수와 상관없이 전체 철거·시공 현장이다.
  if (STRONG_WHOLE.test(t)) return { on: false };
  if (WHOLE_JOB.test(t) && (pyungVal >= 6 || BIG_PLACE.test(t))) return { on: false };
  // 평수가 함께 적혀 있어도 품목이 하나하나 나열돼 있으면('34평 아파트 장판만 제거, 화장실 2개 철거 …')
  // 그 평수는 '현장 넓이'일 뿐 전체 철거 요청이 아니다. 예전에는 6평 이상이면 무조건 전체 철거로
  // 넘겨서 이런 현장이 '34평 전체 인테리어'·34평 철거 600만~1,000만원으로 계산됐다.
  // 다만 '25평 학원 칸막이 철거'처럼 장소+평수만 있고 공간 이름이 없으면 건물 전체 일이다.
  if (pyungVal >= 6 && !ROOM_WORDS.test(t)) {
    const areaOnly = ids.every((id) => ['floor', 'wallpaper', 'woodFloor', 'decoTile'].includes(id));
    if (!areaOnly) return { on: false };
  }

  const access = /스카이|고소작업|크레인|붐\s*리프트|리프트차/.test(t) ? 'sky' : /사다리/.test(t) ? 'ladder' : /1\s*층|일층|지상/.test(t) ? 'ground' : '';

  const items = hits.map((h) => {
    const def = PARTIAL_ITEMS[h.id];
    const near = qtyNear(t, h.end, def.unit, h.len);
    // "34평 아파트 장판만 제거" — 장판·마루는 현장 평수를 그대로 쓴다(품목에 숫자가 없을 때만)
    let qty = near || (['floor', 'woodFloor', 'decoTile'].includes(h.id) && pyungVal > 0 ? pyungVal : 0) || def.defaultQty || 1;
    // "거실·안방 샷시", "베란다 창호" — 창은 방·베란다마다 하나씩이므로 그 이름 수만큼 잡는다
    if (h.id === 'window' && near === 0) {
      const rooms = (t.match(/거실|안방|작은방|큰방|방\s*\d|베란다|발코니/g) || []).length;
      if (rooms > 1) qty = Math.min(6, rooms);
    }
    return { id: h.id, qty: Math.round(qty * 10) / 10, unit: def.unit };
  });
  // 같은 품목이 두 번 잡히지 않게, 실외기가 있으면 벽걸이는 따로 세지 않는다
  let dedup = items.filter((it, i) => !(it.id === 'aircon' && items.some((o, j) => o.id === 'airconOutdoor' && j !== i)));
  // "장판 마루"·"장판 데코타일"은 바닥 하나를 두 이름으로 적은 것 — 두 배로 세지 않는다
  const floorIds = ['floor', 'woodFloor', 'decoTile'];
  const floorHits = dedup.filter((it) => floorIds.includes(it.id));
  if (floorHits.length > 1) {
    const keep = ['woodFloor', 'decoTile'].map((id) => floorHits.find((it) => it.id === id)).find(Boolean) || floorHits[0];
    const qty = Math.max(...floorHits.map((it) => Number(it.qty) || 0));
    dedup = dedup.filter((it) => !floorIds.includes(it.id));
    dedup.push({ ...keep, qty: Math.round(qty * 10) / 10 });
    dedup.sort((a, b) => floorIds.includes(a.id) ? 1 : -1);
  }
  const exterior = dedup.some((it) => PARTIAL_ITEMS[it.id]?.exterior);
  return { on: true, items: dedup, access, exterior };
}

// 저장된 현장에서 부분 철거 정보 읽기 (예전 현장은 글에서 한 번 더 읽는다)
export function partialOf(c) {
  const saved = c?.demolition;
  if (saved && saved.mode === 'partial' && Array.isArray(saved.items) && saved.items.length) {
    return {
      on: true,
      items: saved.items.filter((it) => PARTIAL_ITEMS[it.id]),
      access: saved.access || '',
      exterior: saved.exterior ?? saved.items.some((it) => PARTIAL_ITEMS[it.id]?.exterior),
    };
  }
  if (c?.trade !== 'demolition' && c?.trade !== 'combined' && c?.trade !== 'wallpaper') return { on: false };
  const own = String(c?.notes || '').trim() || String(c?.rawInput || '');
  return detectPartial(own);
}

// 부분 철거 원가 계산 — 노무·폐기물·소모품·장비(스카이차/사다리차)
export function partialPlan(c, rates) {
  const info = partialOf(c);
  if (!info.on) return null;
  const skilledRate = getRate(rates, ['labor', 'demolition'], 27);
  const helperRate = getRate(rates, ['labor', 'helper'], 19);
  let waste = 0;
  let consum = 0;
  const items = [];

  // 여러 품목을 하루에 같이 뜯는 현장은 '한 팀이 하루'로 계산한다.
  // 예전에는 품목마다 최소 반나절을 따로 잡아 5개 품목이 3일치 인건비가 됐다.
  const multi = info.items.length >= 2;
  const manDays = info.items.reduce((sum, it) => {
    const def = PARTIAL_ITEMS[it.id];
    if (!def) return sum;
    return sum + Math.max(0, Number(it.qty) || def.defaultQty || 1) * (def.daysPer || 0.3);
  }, 0);
  let tons = 0;
  info.items.forEach((it) => {
    const def = PARTIAL_ITEMS[it.id];
    if (!def) return;
    const qty = Math.max(0.5, Number(it.qty) || def.defaultQty || 1);
    waste += Math.round(qty * def.wastePer);
    tons += qty * (def.tonsPer || 0.05);
    consum += def.consum || 0;
  });

  let labor = 0;
  let days = 0;
  let crewSize = 1;
  let crewPlan = null;
  const mealPer = Math.max(0, getRate(rates, ['meal', 'perWorker'], 1));
  // 난이도 — 파쇄·반출이 많은 품목(욕실 타일·도기, 천장 텍스, 데크·창고)은 하루에 몰아넣으면
  // 인건비만 늘고 실제로 못 끝낸다. 어떤 사람 수 × 며칠 조합이 원가가 가장 적은지 직접 계산한다.
  const heavyItems = info.items.filter((it) => ['ceiling', 'deck', 'partition'].includes(it.id));
  const heavy = heavyItems.length > 0 || info.access === 'sky' || info.access === 'ladder';
  if (multi) {
    // 여러 품목은 한 팀이 나가 하루에 병행해서 뜯는다 (실제 90만원 사례: 34평 장판 + 욕실 2칸 +
    // 샷시 + 싱크대 + 선반을 이틀씩 나눠 하지 않고 두 사람이 하루에 끝냈다).
    // 사람 수(1~4명)와 일수 조합을 모두 넣어 보고 [인건비 + 식비·교통]이 가장 적은 조합을 고른다.
    let best = null;
    // 사람이 많다고 무조건 싼 건 아니다 — 양이 적은 현장에 4명을 부르면 하루 일당만 뜯긴다.
    const maxCrew = Math.max(2, Math.min(4, 2 + Math.floor(manDays / 4)));
    for (let crew = 1; crew <= maxCrew; crew += 1) {
      // 사람을 늘리면 현장에 머무는 날이 줄어든다 (반나절 단위, 최소 1일 — 방문은 하루다)
      const d = Math.max(1, Math.min(5, Math.round((manDays / crew) * 2) / 2));
      // 사람 수 × 일수가 작업량에 너무 모자라면 그 조합은 실제로 못 끝낸다
      if (d * crew < manDays * 0.85) continue;
      const laborCost = d * (skilledRate + helperRate * (crew - 1));
      const overhead = d * crew * mealPer;
      const total = laborCost + overhead;
      // 같은 원가면 사람이 적은 쪽(구하기 쉽고 관리가 편한 쪽)을 고른다
      if (!best || total < best.total - 0.01) best = { crew, days: d, labor: laborCost, total };
    }
    if (!best) best = { crew: 2, days: Math.max(1, Math.min(5, Math.ceil(manDays / 2))), labor: Math.max(1, Math.min(5, Math.ceil(manDays / 2))) * (skilledRate + helperRate) };
    crewSize = best.crew;
    days = best.days;
    labor = Math.round(best.labor);
    crewPlan = {
      crew: crewSize,
      days,
      manDays: Math.round(manDays * 10) / 10,
      why:
        crewSize === 1
          ? `양이 적어 1명이 ${days}일 처리하는 게 원가 최소`
          : heavy
          ? `파쇄·반출량이 커서 ${crewSize}명이 ${days}일 나가는 게 원가 최소`
          : `경량·부분 철거라 ${crewSize}명이 ${days}일에 끝내는 게 원가 최소`,
    };
    // 폐기물은 한 번에 실어 나간다 — 품목별 처리비를 다 더하지 않고 실제 차량 한 대 값으로 묶는다.
    const truckUnit = tons <= 0.8 ? getRate(rates, ['waste', 'truckHalf'], 26) : getRate(rates, ['waste', 'truckMixed'], 33);
    waste = Math.min(waste, truckUnit);
  } else {
    const it = info.items[0];
    const def = PARTIAL_ITEMS[it.id];
    if (def) {
      const qty = Math.max(0.5, Number(it.qty) || def.defaultQty || 1);
      days = Math.max(def.minDays, Math.round(qty * def.daysPer * 2) / 2);
      crewSize = Math.max(1, def.skilled + def.helper);
      // 한 사람이 하루를 넘기는 양이면 보조를 붙여 하루에 끝내는 쪽이 싼지 계산한다
      if (def.skilled === 1 && def.helper === 0 && days > 1) {
        const twoDay = 1 * (skilledRate + helperRate);
        const oneDay = 1 * skilledRate;
        const slower = days * oneDay;
        if (twoDay < slower) {
          days = 1;
          crewSize = 2;
        }
      }
      labor = Math.round(days * (def.skilled * skilledRate + def.helper * helperRate) + (days > 1 ? (crewSize - 1) * helperRate * 0 : 0));
      if (crewSize === 2 && def.helper === 0) labor = Math.round(days * (skilledRate + helperRate));
      crewPlan = {
        crew: crewSize,
        days,
        manDays: Math.round((Number(it.qty) || 1) * (def.daysPer || 0.3) * 10) / 10,
        why: crewSize > 1 ? `혼자 이틀 가는 것보다 ${crewSize}명이 하루에 끝내는 게 원가 최소` : `${def.label} ${it.qty}${def.unit} — 1명 ${days}일`,
      };
    }
  }

  // 품목별 줄은 화면에서 무엇을 뜯는지 보이게 남긴다 (금액은 팀·차량 기준으로 한 번만)
  info.items.forEach((it) => {
    const def = PARTIAL_ITEMS[it.id];
    if (!def) return;
    const qty = Math.max(0, Number(it.qty) || def.defaultQty || 1);
    items.push({
      id: `partial_${it.id}`,
      category: '노무',
      name: `${def.label} ${qty}${def.unit} 철거`,
      detail: `${def.hint}${multi ? ' · 같은 팀이 하루에 함께 처리' : ''}`,
      amount: 0,
    });
  });
  if (waste > 0) items.push({ id: 'partial_waste', category: '폐기물', name: `혼합 폐기물 반출 (${Math.max(1, Math.round(tons * 10) / 10)}톤)`, detail: '차량·상차·운반·처리 포함', amount: Math.round(waste) });
  if (labor > 0) items.unshift({ id: 'partial_labor', category: '노무', name: `${info.items.length}품목 철거 노무 (${days}일)`, detail: multi ? `기공+보조 ${days}일 · 한 번 방문에 처리` : `기공 ${days}일`, amount: Math.round(labor) });

  let equip = 0;
  if (info.access === 'sky') {
    equip += getRate(rates, ['ladder', 'skyHalf'], 45);
    items.push({ id: 'partial_sky', category: '장비', name: '고소작업차(스카이) 반나절', detail: '외부·높은 곳 작업', amount: getRate(rates, ['ladder', 'skyHalf'], 45) });
  } else if (info.access === 'ladder') {
    equip += getRate(rates, ['ladder', 'small'], 12);
    items.push({ id: 'partial_ladder', category: '장비', name: '사다리차 소형 1회', detail: '2~4층 반출', amount: getRate(rates, ['ladder', 'small'], 12) });
  }
  if (consum > 0) {
    equip += consum;
    items.push({ id: 'partial_consum', category: '장비', name: '철거 소모품', detail: '마대·커터날·보호구', amount: consum });
  }

  return {
    info,
    items,
    labor: Math.round(labor),
    waste: Math.round(waste),
    equip,
    days: days || 0.5,
    crewSize,
    crewPlan,
    crewDays: Math.max(0.5, Math.round((days || 0.5) * (multi ? crewSize : 1) * 10) / 10),
    summary: `${info.items.map((it) => `${PARTIAL_ITEMS[it.id].label} ${it.qty}${PARTIAL_ITEMS[it.id].unit}`).join(' + ')} 철거${info.access === 'sky' ? ' · 고소작업차' : info.access === 'ladder' ? ' · 사다리차' : ''}`,
  };
}
