// 소형·부분 철거 (개수·품목 단위) — "간판 2개 철거", "싱크대 철거"처럼
// 평수 전체 철거가 아닌 현장. 평수 기본값(15평)을 적용하면 400~500만원이 나와
// 실제 숨고 시세(35~150만원)와 크게 어긋나므로, 품목·수량 기준으로 따로 계산한다.
import { getRate } from './rates.js';

// 품목별 2026 실무 기준 (원가, 만원). 노무는 '철거 기공 + 잡부' 일당의 일수 비율로 계산한다.
// daysPer = 수량 1단위당 작업일수, minDays = 품목당 최소 작업일수
export const PARTIAL_ITEMS = {
  sign: { label: '간판', unit: '개', skilled: 1, helper: 1, daysPer: 0.3, minDays: 0.5, wastePer: 4, consum: 2, exterior: true, defaultQty: 1, hint: '철재·아크릴 해체 후 반출' },
  sink: { label: '싱크대', unit: '개', skilled: 1, helper: 0, daysPer: 0.5, minDays: 0.5, wastePer: 10, consum: 2, defaultQty: 1, hint: '상·하부장 분해 후 수거' },
  builtin: { label: '붙박이장', unit: '개', skilled: 1, helper: 1, daysPer: 0.5, minDays: 0.5, wastePer: 10, consum: 3, defaultQty: 1, hint: '분해 후 목재 폐기물 반출' },
  aircon: { label: '에어컨(벽걸이)', unit: '대', skilled: 1, helper: 0, daysPer: 0.25, minDays: 0.25, wastePer: 2, consum: 2, defaultQty: 1, hint: '냉매 회수 후 실내기 분리' },
  airconOutdoor: { label: '에어컨 실외기', unit: '대', skilled: 1, helper: 1, daysPer: 0.3, minDays: 0.3, wastePer: 4, consum: 2, exterior: true, defaultQty: 1, hint: '냉매 회수·배관 분리 후 반출' },
  partition: { label: '가벽·칸막이', unit: 'm', skilled: 1, helper: 1, daysPer: 0.15, minDays: 0.5, wastePer: 3, consum: 2, defaultQty: 3, hint: '경량벽체·석고 해체' },
  window: { label: '샷시·창호', unit: '짝', skilled: 1, helper: 0, daysPer: 0.35, minDays: 0.5, wastePer: 4, consum: 2, defaultQty: 1, hint: '창틀 해체·유리 반출' },
  ceiling: { label: '천장 텍스', unit: '평', skilled: 1, helper: 1, daysPer: 0.08, minDays: 0.5, wastePer: 2, consum: 2, defaultQty: 5, hint: '석면 사전 확인 후 해체' },
  deck: { label: '데크·창고', unit: '식', skilled: 1, helper: 1, daysPer: 1, minDays: 1, wastePer: 25, consum: 4, exterior: true, defaultQty: 1, hint: '외부 구조물 해체·반출' },
  furniture: { label: '가구', unit: '개', skilled: 0, helper: 1, daysPer: 0.3, minDays: 0.5, wastePer: 8, consum: 2, defaultQty: 1, hint: '분해 후 수거' },
};

const ITEM_MATCHERS = [
  ['airconOutdoor', /실외기|실외\s*기|옥외기/],
  ['aircon', /에어컨|에어콘|냉난방기|벽걸이/],
  ['sign', /간판|돌출간판|채널간판|사인물|사이니지|현판|입간판/],
  ['builtin', /붙박이장|붙박이\s*장|드레스룸|장롱|수납장/],
  ['sink', /싱크대|씽크대|개수대|조리대/],
  ['window', /샷시|샤시|창호|창틀|유리창|미서기|붙박이창/],
  ['ceiling', /텍스|천장\s*재|천장\s*철거|천장\s*일부/],
  ['deck', /데크|창고|가건물|비닐하우스|조립식\s*창고/],
  ['partition', /가벽|경량벽체|칸막이|파티션|판넬\s*벽/],
  ['furniture', /침대|소파|장롱|책상|식탁|가구|냉장고|세탁기/],
];

const REMOVAL = /철거|해체|반출|수거|버려|버리|치우|치워|없애|빼\s*주|뜯|분해/;
// '수거만' 하는 요청(이사 폐기물·집기 정리)은 부분 철거가 아니라 폐기물 현장이다.
const COLLECT_ONLY = /폐기물|쓰레기|수거|반출|집기|비품|버려|버리|치우|치워/;
// 현장 전체를 뜯는 일은 부분 철거가 아니다
const WHOLE_JOB = /원상복구|전체\s*철거|전부\s*철거|올수리|올\s*수리|인테리어|리모델링|집\s*전체|철거\s*현장/;
const BIG_PLACE = /카페|음식점|식당|매장|사무실|공장|학교|관공서|병원|약국|학원|상가\s*\d|빌딩/;

const KOR_QTY = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };

function parseQty(text, unit) {
  // "2개", "두 개", "3짝", "2대", "3m"
  const kor = text.match(new RegExp(`(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\\s*(${unit})`));
  if (kor) return KOR_QTY[kor[1]] || 1;
  const num = text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${unit})`));
  if (num) return Math.max(0.5, parseFloat(num[1]));
  if (unit === 'm') {
    const m = text.match(/(\d+(?:\.\d+)?)\s*(?:m|미터)(?!\s*2)/);
    if (m) return Math.max(0.5, parseFloat(m[1]));
  }
  return 0;
}

// 글에서 '품목 + 수량 + 작업 난이도(스카이차/사다리)'를 읽는다.
export function detectPartial(rawText = '') {
  const text = String(rawText || '');
  const t = text.toLowerCase().replace(/\s+/g, ' ');
  if (!t || !REMOVAL.test(t)) return { on: false };
  if (COLLECT_ONLY.test(t) && !/철거|해체|분해|뜯/.test(t)) return { on: false };

  const pyung = t.match(/(\d+(?:\.\d+)?)\s*평/);
  const pyungVal = pyung ? parseFloat(pyung[1]) : 0;

  const hits = ITEM_MATCHERS.filter(([, re]) => re.test(t)).map(([id]) => id);
  if (!hits.length) return { on: false };

  // 6평 이상 + 매장·사무실 같은 큰 현장을 통째로 뜯는 요청은 전체 철거로 계산한다.
  if (WHOLE_JOB.test(t) && (pyungVal >= 6 || BIG_PLACE.test(t))) return { on: false };
  if (pyungVal >= 6) return { on: false };
  // "주방 전체 교체", "싱크대 교체"처럼 새로 설치하는 일은 부분 철거가 아니다.
  if (/교체|설치|새로|신규|시공/.test(t) && !/철거|해체|반출|수거/.test(t.replace(/교체|설치|시공/g, ''))) return { on: false };

  const access = /스카이|고소작업|크레인|붐\s*리프트|리프트차/.test(t) ? 'sky' : /사다리/.test(t) ? 'ladder' : /1\s*층|일층|지상/.test(t) ? 'ground' : '';

  const items = hits.map((id) => {
    const def = PARTIAL_ITEMS[id];
    const qty = parseQty(t, def.unit) || def.defaultQty || 1;
    return { id, qty, unit: def.unit };
  });
  // 실외기가 있으면 벽걸이는 따로 세지 않는다(같은 작업 1건)
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
  if (c?.trade !== 'demolition') return { on: false };
  return detectPartial(`${c?.rawInput || ''} ${c?.notes || ''} ${c?.title || ''}`);
}

// 부분 철거 원가 계산 — 노무·폐기물·소모품·장비(스카이차/사다리차)
export function partialPlan(c, rates) {
  const info = partialOf(c);
  if (!info.on) return null;
  const skilledRate = getRate(rates, ['labor', 'demolition'], 27);
  const helperRate = getRate(rates, ['labor', 'helper'], 19);
  let labor = 0;
  let waste = 0;
  let consum = 0;
  let crewDays = 0;
  const items = [];

  info.items.forEach((it) => {
    const def = PARTIAL_ITEMS[it.id];
    if (!def) return;
    const qty = Math.max(0.5, Number(it.qty) || def.defaultQty || 1);
    const days = Math.max(def.minDays, Math.round(qty * def.daysPer * 10) / 10);
    const dayCost = def.skilled * skilledRate + def.helper * helperRate;
    const cost = Math.round(days * dayCost);
    const wasteCost = Math.round(qty * def.wastePer);
    labor += cost;
    waste += wasteCost;
    consum += def.consum || 0;
    crewDays += days * (def.skilled + def.helper);
    items.push({
      id: `partial_${it.id}`,
      category: '노무',
      name: `${def.label} ${qty}${def.unit} 철거`,
      detail: `${days}일 × (${def.skilled ? `기공 ${skilledRate}만` : ''}${def.skilled && def.helper ? ' + ' : ''}${def.helper ? `잡부 ${helperRate}만` : ''}) · ${def.hint}`,
      amount: cost,
    });
    if (wasteCost > 0) {
      items.push({ id: `partial_waste_${it.id}`, category: '폐기물', name: `${def.label} 폐기물 반출`, detail: `${qty}${def.unit}분 수거·처리`, amount: wasteCost });
    }
  });

  let equip = 0;
  if (info.access === 'sky') {
    equip += getRate(rates, ['ladder', 'skyHalf'], 45);
    items.push({ id: 'partial_sky', category: '장비', name: '고소작업차(스카이) 반나절', detail: '외부·높은 곳 작업', amount: getRate(rates, ['ladder', 'skyHalf'], 45) });
  } else if (info.access === 'ladder') {
    equip += getRate(rates, ['ladder', 'small'], 12);
    items.push({ id: 'partial_ladder', category: '장비', name: '사다리차 소형 1회', detail: '2~4층 반출', amount: getRate(rates, ['ladder', 'small'], 12) });
  }
  if (consum > 0) {
    labor += consum;
    items.push({ id: 'partial_consum', category: '장비', name: '철거 소모품', detail: '마대·커터날·보호구', amount: consum });
  }

  return {
    info,
    items,
    labor,
    waste,
    equip,
    crewDays: Math.max(0.5, Math.round(crewDays * 10) / 10),
    summary: `${info.items.map((it) => `${PARTIAL_ITEMS[it.id].label} ${it.qty}${PARTIAL_ITEMS[it.id].unit}`).join(' + ')} 철거${info.access === 'sky' ? ' · 고소작업차' : info.access === 'ladder' ? ' · 사다리차' : ''}`,
  };
}
