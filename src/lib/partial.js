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
  floor: { label: '장판·마루', unit: '평', skilled: 1, helper: 0, daysPer: 0.04, minDays: 0.5, wastePer: 1.2, tonsPer: 0.03, consum: 1, defaultQty: 10, hint: '장판·마루 뜯어 마대' },
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
  ['floor', /장판|마루|데코타일|카펫|바닥재/],
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
const WHOLE_JOB = /원상복구|전체\s*철거|전부\s*철거|올수리|올\s*수리|인테리어|리모델링|집\s*전체|철거\s*현장/;
const BIG_PLACE = /카페|음식점|식당|매장|사무실|공장|학교|관공서|병원|약국|학원|상가\s*\d|빌딩/;

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
  // 6평 이상 + 매장·사무실 같은 큰 현장을 통째로 뜯는 요청은 전체 철거로 계산한다.
  if (WHOLE_JOB.test(t) && (pyungVal >= 6 || BIG_PLACE.test(t))) return { on: false };
  if (pyungVal >= 6) return { on: false };

  const access = /스카이|고소작업|크레인|붐\s*리프트|리프트차/.test(t) ? 'sky' : /사다리/.test(t) ? 'ladder' : /1\s*층|일층|지상/.test(t) ? 'ground' : '';

  const items = hits.map((h) => {
    const def = PARTIAL_ITEMS[h.id];
    const qty = qtyNear(t, h.end, def.unit, h.len) || def.defaultQty || 1;
    return { id: h.id, qty: Math.round(qty * 10) / 10, unit: def.unit };
  });
  // 같은 품목이 두 번 잡히지 않게, 실외기가 있으면 벽걸이는 따로 세지 않는다
  const dedup = items.filter((it, i) => !(it.id === 'aircon' && items.some((o, j) => o.id === 'airconOutdoor' && j !== i)));
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
  if (multi) {
    // 여러 품목이라도 한 사람이 반나절~하루면 끝나는 현장이 많다 (실제 90만원 사례).
    // 사람·일수를 반올림해 잡고, 2명은 '한 사람이 하루를 넘기는 양'일 때만 붙인다.
    const crew = manDays >= 2.2 ? 2 : 1;
    days = Math.max(0.5, Math.min(3, Math.round((manDays / crew) * 2) / 2));
    labor = Math.round(days * (skilledRate + helperRate * (crew - 1)));
    // 폐기물은 한 번에 실어 나간다 — 품목별 처리비를 다 더하지 않고 실제 차량 한 대 값으로 묶는다.
    const truckUnit = tons <= 0.8 ? getRate(rates, ['waste', 'truckHalf'], 26) : getRate(rates, ['waste', 'truckMixed'], 33);
    waste = Math.min(waste, truckUnit);
  } else {
    const it = info.items[0];
    const def = PARTIAL_ITEMS[it.id];
    if (def) {
      const qty = Math.max(0.5, Number(it.qty) || def.defaultQty || 1);
      days = Math.max(def.minDays, Math.round(qty * def.daysPer * 2) / 2);
      labor = Math.round(days * (def.skilled * skilledRate + def.helper * helperRate));
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
    crewDays: Math.max(0.5, Math.round((days || 0.5) * (multi && manDays >= 1.5 ? 2 : 1) * 10) / 10),
    summary: `${info.items.map((it) => `${PARTIAL_ITEMS[it.id].label} ${it.qty}${PARTIAL_ITEMS[it.id].unit}`).join(' + ')} 철거${info.access === 'sky' ? ' · 고소작업차' : info.access === 'ladder' ? ' · 사다리차' : ''}`,
  };
}
