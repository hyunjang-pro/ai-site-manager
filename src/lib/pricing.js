// 견적 엔진 — 경북 철거·인테리어 실무 단가 (단위: 만원)
// 검증된 4개 기준 견적(15평 철거 374 / 24평 도배·장판 324 / 욕실 1칸 454 / 주방 3.2m 325)의
// 원가 구조와 "고객가 = 원가 ÷ (1 − 마진율)" 공식을 그대로 모듈화했다.
import { TRADES, HARD_DETAILS, hasInteriorStyle, workTypeLabel } from './constants.js';
import { ratesOf, getRate } from './rates.js';
import { MATERIAL_RATES, RATE_BOOK, axisAmount } from './engine/rate-book.js';
import { createLedger, axisOf, AXES } from './engine/ledger.js';
import { siteSurchargeLines } from './engine/surcharge.js';
import { wasteVehicle, wasteQuoteMan, WASTE_QUOTE_MARGIN } from './waste.js';
import { partialPlan, partialOf } from './partial.js';
import { resolveSurvey } from './site.js';
import { materialSetFor } from './materials.js';
import { detailRowsFor, detailTotals } from './details.js';
import { bathroomDemoOnly, kitchenDemoOnly, isDemoOnlyText } from './scope.js';
import { estimateWorkDays } from './schedule.js';
import { marketSanity, marketPosition, marketWhy } from './engine/sanity.js';

export const MAN = 10000; // 원 → 만원
export { MATERIAL_RATES }; // 단가표는 engine/rate-book.js 한 곳에 있다

// 직종 일당 × 작업일수. '하루 처리량(perDay)'은 지금 단가 수준이 그대로 유지되게 잡은 값이다.
function crewLabor(rates, role, fallbackRate, quantity, perDay, minDays = 0.5) {
  const rate = getRate(rates, ['labor', role], fallbackRate);
  const days = Math.max(minDays, Math.min(30, Math.round((quantity / Math.max(0.1, perDay)) * 10) / 10));
  return { rate, days, cost: Math.round(days * rate) };
}

// 직종을 지목해 사람만 보내는 요청("타일공 2명 3일")은 기능공 청구가로 보낸다.
function laborChargeOf(rates, notes) {
  const skilled = /타일공|목수|미장공|용접공|설비공|전기공|도배공|기공|철거공/.test(notes || '');
  return getRate(rates, skilled ? ['laborSupply', 'chargeSkilled'] : ['laborSupply', 'charge'], skilled ? 32 : 26);
}

export function toNum(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

export function won(n) {
  // 만원 단위 숫자를 "1,234만원"으로
  if (!Number.isFinite(n)) return '0만원';
  return `${Math.round(n).toLocaleString('ko-KR')}만원`;
}

export function wonFull(manwon) {
  // 만원 → 원 단위 표기 (계약서·문자용)
  const wonValue = Math.round((Number(manwon) || 0) * MAN);
  return `${wonValue.toLocaleString('ko-KR')}원`;
}

// 평 환산 (평수 강제 입력 없이 자유 단위를 내부 계산용으로만 환산)
// 규모를 안 적은 현장의 기본값.
// 예전에는 무엇이든 15평으로 잡아서 "데코타일 철거"(원룸 한 방)가 461만원,
// "화장실 하나"가 641만원처럼 부풀었다. 방·욕실·주방 같은 '한 공간' 요청은 작게 잡고,
// 매장·사무실처럼 건물 단위로 말한 요청만 15평을 쓴다.
export const SMALL_SCOPE_PYUNG = 6;

function defaultPyungOf(c, fallback = 15) {
  if (c?.scaleHint === 'room') return SMALL_SCOPE_PYUNG;
  return fallback;
}

export function toPyung(sizeValue, sizeUnit, fallback = 15) {
  const v = toNum(sizeValue);
  if (!v || v <= 0) return fallback;
  switch (sizeUnit) {
    case '평':
      return v;
    case '㎡':
      return Math.max(1, +(v / 3.3).toFixed(1));
    case '칸':
      return +(v * 1.8).toFixed(1);
    case 'm':
      return +(v * 1.5).toFixed(1);
    case '개':
      return +(v * 1.2).toFixed(1);
    case '톤':
      return +(v * 4).toFixed(1);
    default:
      return fallback;
  }
}

// 손님 문서에 쓸 수 있게 내부 단가·원가·일당 표현을 걷어낸 문장.
// 예) "일용 인력 3명 × 2일 지원 (청구 26만/일 · 원가 19만/일 + 보험 2만)" → "일용 인력 3명 × 2일 지원"
export function clientSafeText(text) {
  let s = String(text || '');
  // 괄호 안에 금액·단가·원가가 들어간 부분은 통째로 제거
  s = s.replace(/\([^)]*(?:만|원가|청구|일당|단가|보험)[^)]*\)/g, ' ');
  // " · 타일 7.7만/㎡" 같은 단가 조각 제거
  s = s
    .split('·')
    .filter((part) => !/\d[\d.,]*\s*만\s*(\/|원|$)/.test(part.trim()))
    .join(' · ');
  return s
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*·\s*·\s*/g, ' · ')
    .replace(/^[\s·]+|[\s·]+$/g, '')
    .trim();
}

export function sizeText(c) {
  if (!c) return '규모 미정';
  if (c.sizeUnit === '모름' || !toNum(c.sizeValue)) return '규모 미정(실측 필요)';
  return `${toNum(c.sizeValue)}${c.sizeUnit}`;
}

function getTrade(c) {
  return TRADES[c?.trade] ? c.trade : 'unclassified';
}

// 현장 조건으로 자동 포함된 부대비용 + 사용자가 직접 켜고 끈 값 (site.js)
function surveyOn(c, id) {
  return !!resolveSurvey(c)[id];
}

// 체크한 항목의 금액을 현장에서 직접 고친 값(0원 허용)을 우선 쓴다.
function surveyAmount(c, id, fallback) {
  const raw = c?.surveyAmounts ? c.surveyAmounts[id] : undefined;
  if (raw === null || raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

// 디자인·자재 번역기에서 선택한 고난도 디테일의 할증률/공기
export function detailSurcharge(c) {
  // 체크한 마감 + 자유 입력(예: "아치 게이트, 라인조명") 모두 반영
  const rows = detailRowsFor(c?.design || {});
  const { rate, days } = detailTotals(rows);
  return { rows, rate, days };
}

// 사다리차가 실제로 필요한 현장인지 — 기본은 꺼짐(제안하지 않음).
// 엘리베이터가 있으면 필요 없고, 창호·철거처럼 부피 큰 자재·폐기물을 내릴 때(2층 이상)나
// 5층 이상 고층에서 자재를 올릴 때만 후보로 보여준다.
export function needsLadder(c) {
  const lift = c?.lifting || {};
  if (lift.ladderAllowed === 'no') return false;
  if (lift.elevator === 'yes') return false;
  const floor = Math.max(0, parseInt(lift.floor, 10) || 0);
  const trade = TRADES[c?.trade] ? c.trade : 'unclassified';
  const scopes = Array.isArray(c?.subScopes) ? c.subScopes : [];
  const bulky =
    trade === 'window' ||
    trade === 'demolition' ||
    trade === 'waste' ||
    scopes.includes('window') ||
    scopes.includes('demolition');
  if (bulky) return floor >= 2;
  return floor >= 5;
}

// 양중·반출 4문항 → 옵션별 실비 (만원)
export function computeLifting(c, ratesIn) {
  const rates = ratesIn || ratesOf(c);
  const lift = c?.lifting || {};
  const floor = Math.max(0, parseInt(lift.floor, 10) || 0);
  const elevator = lift.elevator === 'yes' ? 'yes' : lift.elevator === 'no' ? 'no' : 'unknown';
  const ladderAllowed = lift.ladderAllowed === 'yes' ? 'yes' : lift.ladderAllowed === 'no' ? 'no' : 'unknown';
  const carryM = Math.max(0, parseInt(lift.carryDistance, 10) || 0);
  // 지하·반지하는 엘베가 없으면 계단으로 내리고 올린다 (층수만 보면 1층으로 읽혀 양중이 빠진다)
  const basement = lift.basement === true;
  const pyung = toPyung(c?.sizeValue, c?.sizeUnit, 15);
  const tons = Math.max(0.5, +(pyung * 0.09).toFixed(1)); // 25평 ≈ 2.2톤

  const manual = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  // 폐기물 단독 현장은 차량 단가에 상차·운반 인부가 들어 있다 — 인력·차량을 또 붙이지 않는다.
  const wasteOnly = (TRADES[c?.trade] ? c.trade : 'unclassified') === 'waste';
  const carryPeople = wasteOnly ? 0 : Math.max(1, parseInt(lift.carryPeople, 10) || (basement ? 2 : Math.max(1, Math.ceil((floor || 2) / 2))));
  // 트럭은 철거재·폐기물이 실제로 나오는 현장만 — 도배·창호·필름은 사람이 들고 내린다
  const carryTrade = TRADES[c?.trade] ? c.trade : 'unclassified';
  const carryScopes = Array.isArray(c?.subScopes) ? c.subScopes : [];
  const needsTruck =
    ['demolition', 'waste', 'bathroom', 'tilewaterproof'].includes(carryTrade) ||
    carryScopes.includes('demolition') ||
    carryScopes.includes('bathroom');
  // 폐기물 차량비는 이미 견적의 '폐기물' 항목에 들어 있다. 여기서 차량을 또 세면
  // 같은 차를 두 번 청구하는 것이므로, 계단 반출에 드는 '사람'만 더한다.
  const truckCount = 0;
  const wage = getRate(rates, ['labor', 'helper'], 19);
  const carryComputed = Math.round(carryPeople * wage);
  const carryManual = manual(lift.carryAmount);
  const carryCost = carryManual !== null ? carryManual : carryComputed;

  // 사다리차는 층수·물량에 따라 달라진다 — 참고 범위를 보여주고 실제 부른 금액을 넣게 한다.
  // 419건 실견적 기준 — 사다리차는 층별로 다르다 (2~5층 12/35/55 · 10층 15/45/65 · 20층 25/55/80)
  const tier = floor >= 15 ? 'high' : floor >= 8 ? 'mid' : 'low';
  const ladderRanges = {
    high: { small: { min: 20, max: 30, def: 25 }, half: { min: 45, max: 65, def: 55 }, day: { min: 70, max: 90, def: 80 } },
    mid: { small: { min: 12, max: 20, def: 15 }, half: { min: 35, max: 55, def: 45 }, day: { min: 55, max: 70, def: 65 } },
    low: { small: { min: 10, max: 15, def: 12 }, half: { min: 25, max: 40, def: 35 }, day: { min: 45, max: 65, def: 55 } },
  }[tier];
  const ladderAmount = (key) => {
    const m = manual(lift[`ladder_${key}`]);
    return m !== null ? m : ladderRanges[key].def;
  };

  const options = [];
  if (elevator === 'yes') {
    options.push({
      id: 'elevator',
      label: '엘리베이터 사용',
      cost: getRate(rates, ['elevator'], 5.5),
      detail: '단지 규정 사용료(기본 5.5만, 고층 15~30만)',
    });
  }
  // 1층 단독 현장은 계단 양중이 없다 — 직접 하차가 기본이고, 필요하면 아래에서 고른다.
  // 폐기물 단독 현장도 상차 인부가 차량 단가에 들어 있어 양중비를 따로 잡지 않는다.
  if (elevator !== 'yes' && (floor <= 1 || wasteOnly) && !basement) {
    options.push({ id: 'none', label: '양중 없음 (차량에서 바로 상차)', cost: 0, detail: '폐기물차 상차·운반 인건비 포함' });
  }
  if (elevator !== 'yes' && (floor >= 2 || basement)) {
    options.push({
      id: 'carry',
      label: wasteOnly ? '인력 반출 없음 (폐기물차 상차 포함)' : `인력 반출 (인부 ${carryPeople}명)`,
      cost: carryCost,
      detail: wasteOnly
        ? '폐기물 차량 단가에 상차·운반 인건비가 포함되어 있습니다'
        : `인부 ${carryPeople}명 × ${wage}만 = ${carryCost}만 (폐기물 차량은 별도)`,
      editable: 'carry',
    });
    if (ladderAllowed !== 'no' && needsLadder(c)) {
      options.push({
        id: 'ladder_half',
        label: '사다리차 반나절',
        cost: ladderAmount('half'),
        detail: `보통 25~40만 (층수·물량에 따라) · 실제 부른 금액 ${ladderAmount('half')}만`,
        editable: 'ladder_half',
      });
      options.push({
        id: 'ladder_day',
        label: '사다리차 하루',
        cost: ladderAmount('day'),
        detail: `보통 45~65만 · 실제 부른 금액 ${ladderAmount('day')}만`,
        editable: 'ladder_day',
      });
      options.push({
        id: 'ladder_small',
        label: '사다리차 소형 1회(저층 단발)',
        cost: ladderAmount('small'),
        detail: `보통 15~25만 · 실제 부른 금액 ${ladderAmount('small')}만`,
        editable: 'ladder_small',
      });
    }
    if (ladderAllowed === 'no') {
      options.push({ id: 'special', label: '특수 양중(사다리차 불가)', cost: 28, detail: '주차·소방통로·전선 문제로 대체 장비' });
    }
  }
  if (carryM >= 30) {
    options.push({ id: 'longcarry', label: '장거리 운반(30m 이상) 추가', cost: 8, detail: '잡부 반일 추가' });
  }

  // 현장 조건에 맞는 기본값을 고른다 — 엘베 있으면 엘베, 1층이면 직접 하차,
  // 창호·철거처럼 부피 큰 반출이 고층이면 사다리차, 나머지는 인력 반출.
  const autoMode = (() => {
    if (elevator === 'yes') return 'elevator';
    if (wasteOnly) return 'none';
    if (basement) return 'carry';
    if (floor <= 1) return 'none';
    if (needsLadder(c)) return floor >= 8 ? 'ladder_day' : 'ladder_half';
    return 'carry';
  })();
  const hasMode = (id) => options.some((o) => o.id === id);
  const chosenId = lift.mode && (lift.mode === 'none' || hasMode(lift.mode)) ? lift.mode : hasMode(autoMode) ? autoMode : options[0] ? options[0].id : 'none';
  const noneOption = { id: 'none', label: '직접 하차(양중 없음)', cost: 0, detail: '고객이 1층에서 직접 내림' };
  const chosen = chosenId === 'none' ? noneOption : options.find((o) => o.id === chosenId) || options[0] || noneOption;
  const warnings = [];
  if (elevator === 'no' && floor >= 3) warnings.push(`엘베 없음 ${floor}층 — 양중비가 견적에서 가장 자주 빠지는 항목입니다.`);
  if (ladderAllowed === 'no') warnings.push('사다리차 설치 불가 — 특수 양중비를 반드시 견적에 넣으세요.');
  if (!floor) warnings.push('층수를 입력하면 양중비가 정확해집니다.');

  return {
    floor,
    elevator,
    ladderAllowed,
    carryM,
    pyung,
    tons,
    options,
    chosen,
    cost: chosen ? chosen.cost : 0,
    carryPeople,
    truckCount,
    ladderRanges,
    warnings,
  };
}

export function computeEstimate(c) {
  const rawTrade = getTrade(c);
  // 앱이 자동으로 붙인 제목('24평 도배·장판')은 손님이 쓴 글이 아니다 — 판단은 손님 글(notes·rawInput)로만 한다.
  // 제목을 섞으면 '장판만'이라도 제목의 '도배'가 벽지 값을 붙여 견적이 이유 없이 올라간다.
  const notes = `${c?.notes || ''} ${c?.rawInput || ''} ${c?.location || ''} ${c?.supplement || ''}`.toLowerCase();
  // 손님이 쓴 말 — 정리본(rawInput)에는 앱이 붙인 '공종: 욕실 리모델링' 같은 요약이 섞여 있다.
  // "타일만 교체" 같은 판단은 손님 글(notes)로만 해야 한다 (정리본의 '리모델링' 때문에 올수리로 돌아가던 것)
  const ownNotes = `${c?.notes || ''} ${c?.supplement || ''}`.toLowerCase().trim() || notes;
  // 마감재 종류(실크·장판 두께·강마루·데코타일)도 손님 글로만 정한다.
  // 정리본의 '공종: 도배·장판'을 읽으면 '마루 20평'이 1.8T 장판이 되고, '도배만'에 장판이 붙는다.
  const finishNotes = ownNotes;
  // AI·스샷으로 들어온 요청이 '철거·제거'만인데 복합 인테리어로 분류되면
  // 시공값(도배·타일·싱크대)이 붙어 1,000만원이 넘는다. 계산 단계에서 한 번 더 막는다.
  const removalOnly =
    !c?.fullInterior &&
    ['combined', 'wallpaper', 'window', 'tilewaterproof'].includes(rawTrade) &&
    isDemoOnlyText(String(c?.notes || '').trim() || notes) &&
    // '철거 + 부지 정지'처럼 다른 공종이 같이 있는 현장은 복합 그대로 계산한다
    !/(정지|터파기|토목|굴삭|기초\s*(공사|타설)|성토|절토)/.test(notes);
  const trade = removalOnly ? 'demolition' : rawTrade;
  const info = TRADES[trade];
  const sizeVal = toNum(c?.sizeValue);
  const sizeUnit = c?.sizeUnit || info.defaultUnit;
  const rates = ratesOf(c); // 이 현장을 만들 때의 단가표(스냅샷)
  // 스타일·자재(등급)를 고르는 인테리어·마감 현장인지 — 철거·폐기물·기초·인력은 아니다
  const interiorStyle = hasInteriorStyle(c) && !removalOnly;
  const bathDemo = bathroomDemoOnly(c);
  const kitchenDemo = kitchenDemoOnly(c);
  const tradeLabel = bathDemo ? '욕실 철거' : kitchenDemo ? '주방 철거' : info.short;
  const items = [];

  let laborTotal = 0;
  let materialTotal = 0;
  let wasteTotal = 0;
  let equipTotal = 0;
  let crewDays = 0; // 총 연인원(명·일) — 교통비·식비를 여기에 곱한다
  let targetSummary = '';
  let smallJob = false; // 개수·품목 단위 소형 현장 — 최소 공사비 하한을 낮게 본다
  // 시세 검증(engine/sanity.js)에 넘길 현장 사실 — 공종 안에서만 알 수 있는 값들
  let demolitionKind = ''; // partial · finish · structural · restore
  let demolitionUnits = 0; // 품목 철거일 때 품목 수 (시세 범위가 개수만큼 커진다)
  let wasteTons = 0;
  let wasteVehicleCost = 0;
  let wasteTicket = 0;
  let laborPeople = 0;
  let laborDaysN = 0;
  let laborCharge = 0;
  let workDays = 0; // 화면·문서가 같은 공사일수를 쓰게 한다
  let plannedCrew = null; // 추천 인원 × 일수 — '2명 1일'처럼 원가가 가장 적은 조합을 화면에 보여 준다

  if (trade === 'demolition') {
    const partial = partialPlan(c, rates);
    if (partial) {
      // "간판 2개 철거"처럼 개수·품목 단위 현장 — 평수 전체 철거 단가를 쓰지 않는다.
      smallJob = true;
      demolitionKind = 'partial';
      demolitionUnits = (partial.info?.items || []).length || 1;
      laborTotal += partial.labor;
      wasteTotal += partial.waste;
      equipTotal += partial.equip;
      crewDays += partial.crewDays;
      partial.items.forEach((it) => items.push(it));
      targetSummary = `${!sizeVal || sizeUnit === '모름' ? '규모 미입력 — 실측 필요 · ' : ''}${partial.summary}${partial.info.access === 'sky' ? ' (고소작업차 포함)' : ''}`;
      workDays = partial.days || 1;
      plannedCrew = partial.crewPlan || null;
    } else {
    const pyung = toPyung(sizeVal, sizeUnit, defaultPyungOf(c, 15));
    const scope = c?.demolition?.scope === 'partial' ? 'partial' : 'restore';    // '데코타일 철거'·'천장 텍스 철거'처럼 마감재 한 가지만 뜯는 현장은
    // 원상복구(천장·벽체·바닥 전부)와 인력·폐기물·장비가 다르다.
    const finishOnly =
      /데코타일|텍스|장판|마루|벽지|도배|에폭시|몰딩|걸레받이|칠판|거울/.test(ownNotes) &&
      !/조적|콘크리트|철골|벽체|가벽|전체|원상복구|전부|올\s*철거/.test(ownNotes);
    // '올철거·전체 철거'는 마감재만이 아니라 천장·벽체·바닥을 다 뜯는 원상복구 현장이다
    const wholeStrip = /올\s*철거|전체\s*철거|전부\s*철거|원상복구/.test(ownNotes);
    const skilled = getRate(rates, ['labor', 'demolition'], 25);
    const helper = getRate(rates, ['labor', 'helper'], 17);
    // 집·건물을 통째로 뜯는 현장(구옥·단독주택·창고 전체 철거)은 마감 철거와 인력·폐기물 양이 다르다.
    // 앱이 붙인 분류 이름('상가·주택 철거')을 손님 글처럼 읽으면 평범한 상가 원상복구가 '건물 전체 해체'가 된다
    const structural =
      /구옥|빈집|단독주택|건물\s*(철거|완파)|건물\s*전체|완파|지붕\s*철거/.test(ownNotes) ||
      (/(주택|단독|건물|창고|공장)/.test(ownNotes) && /전체\s*철거|전부\s*철거|철거\s*전체|해체/.test(ownNotes));
    const helperCount = finishOnly ? 0 : pyung >= 12 ? 2 : 1;
    const crewSize = 1 + helperCount;
    // 인력(명·일) 기준으로 일수를 잡는다 — 2026 현장 기준 원상복구는 1인 1일 3.5평,
    // 순수 철거(마감만)는 4.5평, 마감재 한 가지만 뜯는 일은 8평,
    // 건물 전체 해체는 잔재 처리·장비 대기가 붙어 1인 1일 1.5평.
    // 예전 '평 ÷ 6일'은 24평을 4일×3명(연인원 12)으로 잡아 실제 2~3일 현장보다 인건비가 30~40% 부풀었다.
    demolitionKind = structural ? 'structural' : finishOnly ? 'finish' : 'restore';
    const perManDay = structural ? 1.5 : finishOnly ? 8 : scope === 'restore' || wholeStrip ? 3.5 : 4.5;
    const manDays = pyung / perManDay;
    const rawDays = manDays / crewSize;
    const days = Math.max(finishOnly ? 0.5 : 1, Math.min(14, finishOnly ? Math.ceil(rawDays * 2) / 2 : Math.ceil(rawDays)));
    const perDay = skilled + helper * helperCount;
    let laborCost = Math.round(days * perDay);
    // 상가 원상복구는 평당 인건비 하한을 둔다 — 큰 평수에서 3명·3일로 끝내면
    // 지방 시세(평당 22~25만)보다 훨씬 싸게 나가 사장님이 손해를 본다.
    const commercialPlace = /상가|상점|매장|식당|음식점|카페|사무실|오피스|근린|상업|학원|병원|약국|공장|창고|숍|미용실|편의점|마트|베이커리|노래방|가게|점포|피시방|당구장/.test(`${ownNotes} ${c?.location || ''}`.toLowerCase());
    const restoreScope =
      RATE_BOOK.demolition.restoreScope.test(ownNotes) ||
      !/간판|싱크대|붙박이|샷시|문짝|선반|에어컨|칸막이|가벽|텍스|데코타일|에폭시|타일/.test(ownNotes);
    const commercialRestore = !finishOnly && !structural && commercialPlace && restoreScope;
    if (commercialRestore) {
      laborCost = Math.max(laborCost, Math.round(pyung * RATE_BOOK.demolition.restoreLaborPerPyung));
    }
    crewDays += days * crewSize;
    // 폐기물은 '톤'으로 잡고 차량을 고른다. 15평 철거에 3대(마대 30개 분량)를 무조건 넣던 것을 바로잡았다.
    const tons = +(pyung * (structural ? 0.8 : finishOnly ? 0.1 : scope === 'restore' ? 0.2 : 0.26)).toFixed(1);
    const autoTrucks = tons <= 0.8 ? 1 : Math.max(1, Math.ceil(tons / 2.5));
    const truckCount = Math.max(1, parseInt(c?.waste?.trucks, 10) || autoTrucks);
    const heavy = c?.waste?.heavy === true;
    // 0.8톤 이하는 반차, 그 위는 2.5톤 혼합. 차량 단가에는 상차·운반·처리 인건비가 포함이다.
    const smallLoad = !heavy && tons <= 0.8;
    const truckUnit = heavy ? getRate(rates, ['waste', 'truckHeavy'], 50) : smallLoad ? getRate(rates, ['waste', 'truckHalf'], 26) : getRate(rates, ['waste', 'truckMixed'], 33);
    const wasteCost = truckCount * truckUnit;
    // 집게차는 벽체·바닥을 깨는 철거에만 — 천장 텍스·데코타일에는 부르지 않는다.
    const grapple = !finishOnly && (/집게차/.test(notes) || pyung >= 10) ? getRate(rates, ['waste', 'grapple'], 30) : 0;
    const consumables = Math.min(10, Math.max(5, Math.round(pyung * 0.53)));
    laborTotal += laborCost;
    wasteTotal += wasteCost;
    equipTotal += grapple + consumables;

    const sizeNote = !sizeVal || sizeUnit === '모름' ? '규모 미입력 — 실측 필요 · ' : '';
    targetSummary =
      `${sizeNote}${pyung}평 ${structural ? '건물 전체 철거·해체' : finishOnly ? '마감재(천장·바닥) 철거' : scope === 'restore' ? '철거 + 원상복구(천장·벽체·바닥)' : '순수 철거(마감 제외)'} · 약 ${days}일 공정`;
    workDays = days;
    plannedCrew = {
      crew: crewSize,
      days,
      manDays: Math.round(manDays * 10) / 10,
      why: structural
        ? `콘크리트·벽체 파쇄와 반출량이 커서 ${crewSize}명이 ${days}일 나가는 게 원가 최소`
        : `${pyung}평 ${finishOnly ? '마감재 철거' : '철거'} — ${crewSize}명이 ${days}일 나가는 게 원가 최소`,
    };
    items.push(
      {
        id: 'labor',
        category: '노무',
        name: `철거 노무 (${days}일)`,
        detail: `${days}일 × (기공 ${skilled}만 + 잡부 ${helperCount}명 ${helper * helperCount}만)`,
        amount: laborCost,
      },
      {
        id: 'waste',
        category: '폐기물',
        name: `${heavy ? '중량' : smallLoad ? '반차(0.5톤)' : '혼합·목재'} 폐기물 (${truckCount}대 · 약 ${tons}톤)`,
        detail: `${truckCount}대 × ${truckUnit}만 (차량·상차·운반·처리 포함)`,
        amount: wasteCost,
      }
    );
    if (grapple > 0) items.push({ id: 'grapple', category: '장비', name: '집게차 상차·운반', detail: '1회 출동 기준', amount: grapple });
    items.push({ id: 'consumables', category: '장비', name: '철거 소모품', detail: '마대·보양·커터날 등', amount: consumables });
    }

  } else if (trade === 'wallpaper') {
    const pyung = toPyung(sizeVal, sizeUnit, 24);
    const silk = /실크/.test(finishNotes);
    const wallPyung = +(pyung * 2.3).toFixed(1);
    const rollUnit = silk ? MATERIAL_RATES.wallpaper.silkRoll : MATERIAL_RATES.wallpaper.paperRoll;
    const rolls = Math.ceil((wallPyung / 5) * 1.15); // 손실 15% 포함 (실견적 A)
    const wallCost = Math.round(rolls * rollUnit);
    const floorSqm = Math.round(pyung * 2.3);
    const is22 = /2\.2|2\.2t|2\.2mm/.test(finishNotes);
    const is45 = /4\.5|4\.5t|4\.5mm/.test(finishNotes);
    const isDeco = /데코타일/.test(finishNotes);
    const isHard = /강마루|원목마루/.test(finishNotes) || (/마루/.test(finishNotes) && !/장판/.test(finishNotes));
    const floorUnit = isDeco
      ? MATERIAL_RATES.wallpaper.decoTile
      : isHard
      ? MATERIAL_RATES.wallpaper.hardWood
      : is45
      ? MATERIAL_RATES.wallpaper.floor45
      : is22
      ? MATERIAL_RATES.wallpaper.floor22
      : MATERIAL_RATES.wallpaper.floor18;
    const floorCost = Math.round(floorSqm * floorUnit);
    const subMat = Math.min(14, Math.max(8, Math.round(pyung * 0.42)));
    // 도배공 하루 30평 안팎 · 장판공 반나절~하루 — 둘을 나눠 각 직종 일당으로 계산한다
    const wallDays = pyung >= 30 ? 2 : 1.5;
    // 강마루·데코타일은 장판보다 하루 처리량이 적다 (강마루 12평/일, 데코타일 20평/일)
    const floorDays = isHard ? Math.max(0.5, Math.round((pyung / 12) * 2) / 2) : isDeco ? (pyung >= 30 ? 1.5 : 1) : is45 ? (pyung >= 30 ? 1 : 0.5) : pyung >= 30 ? 1 : 0.5;
    const wallRate = getRate(rates, ['labor', 'wallpaper'], 30);
    const floorRate = getRate(rates, ['labor', 'floor'], 28);
    const laborDays = +(wallDays + floorDays).toFixed(1);
    // "장판만", "벽지(도배)만"처럼 한 가지만 말했으면 다른 자재·노무는 넣지 않는다
    // (벽지만 하겠다는 사람에게 24평 장판 61만원을 꺼워 넣으면 견적이 이유 없이 올라간다)
    const wantWall = /도배|벽지|합지|실크|초배/.test(ownNotes);
    const wantFloor = /장판|마루|바닥|카펫|데코타일|강마루/.test(ownNotes);
    const bothOrNone = !wantWall && !wantFloor;
    const useWall = bothOrNone || wantWall;
    const useFloor = bothOrNone || wantFloor;
    const wallCostUse = useWall ? wallCost : 0;
    const floorCostUse = useFloor ? floorCost : 0;
    const subMatUse = useWall && useFloor ? subMat : Math.round(subMat * 0.6);
    const wallDaysUse = useWall ? wallDays : 0;
    const floorDaysUse = useFloor ? floorDays : 0;
    const laborDaysUse = +(wallDaysUse + floorDaysUse).toFixed(1);
    const laborCost = Math.round(wallDaysUse * wallRate + floorDaysUse * floorRate);
    crewDays += laborDaysUse;

    materialTotal += wallCostUse + floorCostUse + subMatUse;
    laborTotal += laborCost;
    // "장판 철거 후 새 장판" — 기존 마감을 뜯는 몫이 빠지면 그 돈은 사장님이 떠안는다.
    if (/철거|제거|뜯|까\s*내|까내/.test(notes)) {
      const stripDays = Math.max(0.5, Math.round((pyung / 30) * 2) / 2);
      const stripCost = Math.round(stripDays * getRate(rates, ['labor', 'helper'], 19));
      if (stripCost > 0) {
        laborTotal += stripCost;
        crewDays += stripDays;
        items.push({ id: 'strip', category: '노무', name: `기존 마감 철거 (${stripDays}일)`, detail: '장판·벽지 뜯기 + 마대', amount: stripCost });
      }
    }

    const floorName = isDeco ? '데코타일' : isHard ? '강마루' : is45 ? '4.5T 장판' : is22 ? '2.2T 장판' : '1.8T 장판';
    targetSummary = [
      useWall ? `${pyung}평 ${silk ? '실크' : '합지'} 도배(벽 ${wallPyung}평/${rolls}롤)` : '',
      useFloor ? `${floorName}(${floorSqm}㎡)` : '',
    ]
      .filter(Boolean)
      .join(' + ');
    if (useWall) items.push({ id: 'wallpaper', category: '자재', name: `${silk ? '실크' : '합지'} 벽지 (${rolls}롤)`, detail: `벽 ${wallPyung}평 ÷ 5평/롤 × 1.15(손실) × ${rollUnit}만`, amount: wallCost });
    if (useFloor) items.push({ id: 'floor', category: '자재', name: `${floorName} (${floorSqm}㎡)`, detail: `${pyung}평 × 2.3 = ${floorSqm}㎡ × ${floorUnit}만`, amount: floorCost });
    items.push({ id: 'submat', category: '자재', name: '도배·장판 부자재', detail: '친환경 풀·초배지·장판본드·실리콘', amount: subMatUse });
    items.push({ id: 'labor', category: '노무', name: `도배·장판 노무 (${laborDaysUse}일)`, detail: `도배 ${wallDaysUse}일 × ${wallRate}만 + 장판·마루 ${floorDaysUse}일 × ${floorRate}만`, amount: laborCost });
  } else if (trade === 'bathroom') {
    const kans = sizeUnit === '칸' && sizeVal > 0 ? sizeVal : 1;
    const is600 = /600각|포세린/.test(notes);
    const american = /아메리칸/.test(notes);
    // "화장실 하나 철거"는 타일·도기 교체 현장이 아니다. 자재·시공 단어가 없으면
    // 철거(타일·도기·천장 해체) + 폐기물만 계산한다. (예전엔 무조건 올수리로 계산해서
    // 1칸 철거가 641만·2칸 철거가 1,254만원으로 나갔다)
    if (bathroomDemoOnly(c)) {
      smallJob = kans <= 1;
      const demoPer = MATERIAL_RATES.bathroom.demoOnlyPer; // 타일·도기·천장 해체 + 마대 (1칸 1일 2명)
      const demoWastePer = MATERIAL_RATES.bathroom.demoOnlyWaste;
      laborTotal += Math.round(demoPer * kans);
      wasteTotal += Math.round(demoWastePer * kans);
      crewDays += kans;
      workDays = Math.max(1, kans);
      targetSummary = `욕실 ${kans}칸 철거 — 타일·도기·천장 해체 후 폐기물 반출 (타일·도기 시공 없음)`;
      items.push(
        { id: 'demolition', category: '노무', name: `욕실 ${kans}칸 철거 (타일·도기·천장)`, detail: `${demoPer}만/칸 · 기공+보조 1일 기준`, amount: Math.round(demoPer * kans) },
        { id: 'waste', category: '폐기물', name: '욕실 폐기물 반출', detail: `${demoWastePer}만/칸 (차량·상차·운반·처리 포함)`, amount: Math.round(demoWastePer * kans) }
      );
    } else {
    const method = c?.tileRemain ? 'overlay' : ['full', 'overlay', 'ubr'].includes(c?.bathroom?.method) ? c.bathroom.method : 'full';
    const B = MATERIAL_RATES.bathroom;
    // "타일만 교체"는 욕실 올수리가 아니다 — 도기·수전은 그대로 두고 타일만 뜯어 새로 붙인다.
    // (예전엔 전체 철거+방수+도기까지 붙어 1칸 553만 — 시세 250~400)
    // '도기 그대로'·'기존 도기'는 도기를 새로 한다는 말이 아니다 — 뺀 문장으로 판단한다
    const keepPhrase = ownNotes.replace(/(?:도기|양변기|세면대|수전|욕조)\s*(?:는|를)?\s*(?:그대로|유지|안\s*건드|놔두|그냥)/g, ' ');
    const tileOnly =
      !c?.tileRemain &&
      !(/하나는[^.\n]{0,24}타일/.test(ownNotes) && /올수리|올\s*수리|전체/.test(ownNotes)) &&
      /타일\s*(?:만|만\s*교체|교체\s*만)|타일만/.test(keepPhrase) &&
      !/도기|양변기|세면대|수전|욕조|샤워|올수리|리모델링|전체\s*철거|전체\s*교체/.test(keepPhrase);
    // "하나는 타일만, 하나는 올수리" — 한 현장에서 두 가지를 같이 하는 경우
    const mixedBath = /하나는[^\n]{0,24}타일/.test(ownNotes) && /올수리|올\s*수리|전체/.test(ownNotes) && !tileOnly;
    // 도기·수전 교체는 손님이 그 말을 했을 때만 넣는다 — "타일 철거+방수"에
    // 도기·수전 50만원을 꺼워 넣으면 견적이 이유 없이 올라간다.
    const anyFinish = /타일|도기|양변기|세면대|수전|욕조|샤워|방수|덧방|포세린|600각|교체|시공|설치|올수리|리모델링|인테리어|전체/.test(notes);
    const wantFixture = !tileOnly && (!anyFinish || /도기|양변기|세면대|수전|욕조|샤워|올수리|리모델링|인테리어|전체\s*(교체|철거)/.test(ownNotes));
    const fixturePer = wantFixture ? B.fixturePer : 0;
    const fullKans = mixedBath ? 1 : tileOnly ? 0 : kans;
    const tileKans = mixedBath ? Math.max(0, kans - 1) : tileOnly ? kans : 0;
    const demolitionPer = method === 'full' ? B.demolition : method === 'ubr' ? B.demolition + B.ubrExtra : 0;
    const waterproofPer = method === 'overlay' ? 0 : B.waterproofPer;
    const wastePer = method === 'overlay' ? B.overlayWaste : tileOnly ? 12 : method === 'ubr' ? 25 : B.wastePer;
    const laborDays = B.laborDays;
    const tileLaborDays = tileOnly ? B.tileOnlyLaborDays : laborDays;
    const laborCost =
      Math.round(laborDays * getRate(rates, ['labor', 'bathroom'], 35) * fullKans) +
      Math.round(tileLaborDays * getRate(rates, ['labor', 'bathroom'], 35) * tileKans);
    crewDays += laborDays * fullKans + tileLaborDays * tileKans;

    materialTotal +=
      Math.round((B.tilePer + fixturePer + waterproofPer) * fullKans) + Math.round(B.tilePer * tileKans);
    laborTotal += laborCost + Math.round(demolitionPer * fullKans) + Math.round(B.tileStripPer * tileKans);
    wasteTotal += Math.round(wastePer * kans);
    // 실제 공정 일수 — 타일만 3일, 전체 철거·방수 5일(담수 양생 포함), 덧방 3일
    workDays = mixedBath ? 5 : tileOnly ? 3 : method === 'overlay' ? 3 : method === 'ubr' ? 4 : 5;

    const methodLabel = mixedBath
      ? `올수리 ${fullKans}칸 + 타일만 ${tileKans}칸`
      : tileOnly
      ? '타일만 교체'
      : method === 'overlay'
      ? '덧방'
      : method === 'ubr'
      ? 'UBR 조립식 철거'
      : '전체 철거';
    targetSummary = tileOnly
      ? `욕실 ${kans}칸(약 ${(kans * 1.8).toFixed(1)}평) 타일만 교체 — 기존 타일 해체 후 ${is600 ? '600각 포세린' : '300×600 국산타일'} (도기·수전은 기존 사용)`
      : `욕실 ${kans}칸(약 ${(kans * 1.8).toFixed(1)}평) ${methodLabel} 후 ${is600 ? '600각 포세린' : '300×600 국산타일'}${wantFixture ? ` + ${american ? '아메리칸스탠다드' : '국산'} 도기·수전 교체` : ' (도기·수전은 기존 사용)'}`;
    if (fullKans > 0) {
      items.push(
        { id: 'demolition', category: '노무', name: `${method === 'overlay' ? '덧방' : '철거'} 및 폐기`, detail: method === 'overlay' ? '덧방은 철거·방수 제외' : `${demolitionPer}만/칸`, amount: Math.round(demolitionPer * fullKans) },
        { id: 'waterproof', category: '자재', name: '방수(액체 2회 + 물 채움 테스트)', detail: waterproofPer ? `${waterproofPer}만/개소` : '덧방은 방수 생략', amount: Math.round(waterproofPer * fullKans) },
        { id: 'fixture', category: '자재', name: `${american ? '아메리칸스탠다드' : '국산'} 도기·수전`, detail: `양변기·세면대·수전·장 (${B.fixturePer}만/칸)`, amount: Math.round(fixturePer * fullKans) }
      );
    }
    if (tileKans > 0) {
      items.push({ id: 'tile_strip', category: '노무', name: `기존 타일 해체 (${tileKans}칸)`, detail: `${B.tileStripPer}만/칸 — 도기·수전은 그대로`, amount: Math.round(B.tileStripPer * tileKans) });
    }
    items.push(
      { id: 'tile', category: '자재', name: `${is600 ? '600각 포세린' : '300×600 국산'} 타일`, detail: `벽+바닥 × ${B.tilePer}만/칸 (타일·부자재·줄눈)`, amount: Math.round(B.tilePer * kans) },
      { id: 'labor', category: '노무', name: `타일공 ${+(laborDays * fullKans + tileLaborDays * tileKans).toFixed(1)}일`, detail: `타일공 2품 기준 (올수리 ${laborDays}일 · 타일만 ${B.tileOnlyLaborDays}일)`, amount: laborCost },
      { id: 'waste', category: '폐기물', name: '욕실 폐기물 반출', detail: `타일·도기 수거 (${wastePer}만/칸)`, amount: Math.round(wastePer * kans) }
    );
    }
  } else if (trade === 'kitchen') {
    // "주방 철거"는 싱크대 교체 현장이 아니다 — 3.2m 기본형 싱크대·상판 값(243만)이 붙으면
    // 철거만 원하는 손님께 575만원이 나간다. 뜯는 말만 있으면 해체·반출만 계산한다.
    if (kitchenDemoOnly(c)) {
      smallJob = true;
      const K = MATERIAL_RATES.kitchen;
      const laborCost = Math.round(getRate(rates, ['labor', 'kitchen'], 30) * 0.8);
      laborTotal += laborCost;
      wasteTotal += K.demoOnlyWaste;
      crewDays += 0.8;
      workDays = 1;
      targetSummary = '주방 싱크대·상판 철거 후 폐기물 반출 (새 싱크대·상판 시공 없음)';
      items.push(
        { id: 'demolition', category: '노무', name: '싱크대·상판 해체', detail: `기공 0.8일 × ${getRate(rates, ['labor', 'kitchen'], 30)}만`, amount: laborCost },
        { id: 'waste', category: '폐기물', name: '싱크대 폐기물 반출', detail: `해체·상차·운반·처리 포함`, amount: K.demoOnlyWaste }
      );
    } else {
    const meters = sizeUnit === 'm' && sizeVal > 0 ? sizeVal : 3.2;
    const K = MATERIAL_RATES.kitchen;
    // 상판만 교체 — 싱크대 상·하부장은 그대로 두고 상판값(60만/m)을 넣으면 541만이 나간다
    const counterOnly =
      /상판/.test(ownNotes) &&
      /교체|갈아|바꾸|새/.test(ownNotes) &&
      !/상판까지|상판도|상판\s*포함|상부장|하부장|싱크대\s*(전체|통째)|싱크대.{0,6}전부/.test(ownNotes);
    const sink = counterOnly ? 0 : Math.round(meters * K.sinkPerM);
    const top = Math.round(meters * K.topPerM);
    const laborDays = counterOnly ? 1 : K.laborDays;
    const laborCost = laborDays * getRate(rates, ['labor', 'kitchen'], 30);
    crewDays += laborDays;
    workDays = counterOnly ? 2 : 3;
    materialTotal += sink + top;
    wasteTotal += counterOnly ? 10 : K.waste;
    laborTotal += laborCost;

    targetSummary = counterOnly
      ? `주방 상판만 교체 ${meters}m (인조대리석 상판·제거·설치, 상·하부장 기존 사용)`
      : `주방 ${meters}m 기본형 싱크대(상·하부장) + 인조대리석 상판 교체 및 철거`;
    items.push(
      ...(counterOnly ? [] : [{ id: 'sink', category: '자재', name: `기본형 싱크대 (${meters}m)`, detail: `${meters}m × ${K.sinkPerM}만/m (상·하부장)`, amount: sink }]),
      { id: 'top', category: '자재', name: `인조대리석 상판 (${meters}m)`, detail: `${meters}m × ${K.topPerM}만/m`, amount: top },
      { id: 'waste', category: '폐기물', name: counterOnly ? '기존 상판·싱크볼 철거·반출' : '기존 싱크대 철거·반출', detail: counterOnly ? '상판 해체·반출' : '해체 및 폐기물 처리 (실견적 45만)', amount: counterOnly ? 10 : K.waste },
      { id: 'labor', category: '노무', name: `주방 노무 (${laborDays}일)`, detail: `철거·설비·설치 기공 ${laborDays}일 × ${getRate(rates, ['labor', 'kitchen'], 30)}만`, amount: laborCost }
    );
    }
  } else if (trade === 'waste') {
    // 차량 1탭 선택(반차·1톤 1차·2.5톤)이 톤수·차량비를 정한다. 생활폐기물 '한차'는 1톤 1차.
    const vehicle = wasteVehicle(c);
    // '5톤'처럼 탭(반차·1톤·2.5톤)보다 큰 톤수를 직접 적었으면 그 톤수로 계산한다.
    // 예전에는 모두 2.5톤으로 깎여서 5톤 폐기물이 2.5톤 금액(113만)으로 나갔다.
    const explicitTons = c?.sizeUnit === '톤' ? Math.max(0, parseFloat(c?.sizeValue) || 0) : 0;
    const tons = Math.max(vehicle.tons, explicitTons);
    const truckLabel = explicitTons > vehicle.tons + 0.01 ? `${explicitTons}톤 차량` : vehicle.label;
    const perTon = getRate(rates, ['waste', 'perTon'], 32);
    // 톤당 단가(32만)는 중간처리 + 수집운반 + 상차 인건비를 모두 포함한 통합 단가다.
    // 차량비·상차 인부를 따로 또 더하면 1톤 한차가 90만원대로 부풀려진다.
    // 식비·교통비도 상차 인부 몫까지 또 붙이지 않는다(차량 단가에 이미 포함).
    const ticket = getRate(rates, ['waste', 'ticket'], 3);
    // 원가는 '차량 실비'다 — 반차 26만 / 1톤 42.5만 / 2.5톤 75만(상차·운반·처리 포함).
    // 예전엔 톤당 32만을 곱해 2.5톤이 80만, 반차가 16만으로 나와 작은 차는 손해·큰 차는 과다였다.
    // 탭(반차·1톤·2.5톤)보다 큰 톤수를 직접 적었을 때만 톤당 통합단가를 쓴다.
    const overTab = explicitTons > vehicle.tons + 0.01;
    const vehicleCost = overTab
      ? Math.round(tons * perTon)
      : Math.round(getRate(rates, ['waste', vehicle.rateKey], vehicle.rate));
    const disposal = vehicleCost;
    smallJob = true;
    wasteTons = tons;
    wasteVehicleCost = vehicleCost;
    wasteTicket = Math.round(ticket);

    wasteTotal += disposal;
    equipTotal += ticket;
    targetSummary = `폐기물 약 ${tons}톤 수거·상차·운반·처리 (${truckLabel} · 차량 실비 ${vehicleCost}만)`;
    items.push(
      {
        id: 'waste_disposal',
        category: '폐기물',
        name: `${truckLabel} 폐기물 수거·처리 (${tons}톤)`,
        detail: overTab ? `${tons}톤 × ${perTon}만 (차량·상차·운반·처리 포함)` : `차량 실비 ${vehicleCost}만 (상차·운반·처리 포함)`,
        amount: disposal,
      },
      { id: 'ticket', category: '장비', name: '처리확인서·올바로 등록', detail: '행정 처리', amount: Math.round(ticket) }
    );
  } else if (trade === 'labor') {
    const people = sizeUnit === '명' && sizeVal > 0 ? sizeVal : Math.max(1, parseInt(sizeVal, 10) || 1);
    const days = Math.max(1, parseInt(c?.laborDays, 10) || 1);
    const charge = laborChargeOf(rates, notes);
    laborPeople = Math.round(people);
    laborDaysN = days;
    laborCharge = charge;
    const cost = getRate(rates, ['laborSupply', 'cost'], 19);
    const insurance = Math.round(getRate(rates, ['laborSupply', 'insurance'], 2) * people * days);
    const wageCost = Math.round(people * days * cost);
    crewDays += people * days;
    workDays = days;
    plannedCrew = { crew: Math.round(people), days, why: `${people}명 × ${days}일 지원 (청구 ${charge}만/일)` };

    laborTotal += wageCost + insurance;
    targetSummary = `일용 인력 ${people}명 × ${days}일 지원 (청구 ${charge}만/일 · 원가 ${cost}만/일 + 보험 ${insurance}만)`;
    items.push(
      { id: 'labor', category: '노무', name: `인력 ${people}명 × ${days}일`, detail: `${cost}만/일 기준 (일당·식대)`, amount: wageCost },
      { id: 'insurance', category: '추가(규제)', name: '4대보험·안전관리', detail: `${people}명 × ${days}일`, amount: insurance }
    );
  } else if (trade === 'tilewaterproof') {
    const T = MATERIAL_RATES.tile;
    let area = sizeVal > 0 && sizeUnit === '㎡' ? Math.max(1, sizeVal) : Math.max(1, +(toPyung(sizeVal, sizeUnit, 4) * 3.3).toFixed(1));
    // "주방 벽타일"을 면적 없이 적으면 주방 벽 1면(약 12㎡)으로 본다 (4㎡ 욕실 기본값을 쓰지 않는다)
    if (!(sizeVal > 0) && /주방|부엌/.test(notes)) area = 12;
    const mode = ['waterproof', 'tile', 'both'].includes(c?.tileWork?.mode) ? c.tileWork.mode : 'both';
    const tileArea = mode === 'waterproof' ? 0 : area;
    const wpArea = mode === 'waterproof' || mode === 'both' ? area : 0;
    const remainTile = !!c?.tileRemain;
    const demo = mode === 'both' && !remainTile ? Math.round(area * T.demolitionPer) : 0;
    const tileMaterial = Math.round(tileArea * T.materialPer);
    const tileLabor = Math.round(tileArea * T.installPer);
    const waterproof = Math.round(wpArea * T.waterproofPer);
    // 방수만 하는 현장은 철거재가 없다 — 폐기물을 붙이지 않는다
    const wasteCost = remainTile ? 8 : mode === 'waterproof' ? 8 : Math.max(15, Math.round(area * 1.2));
    let crewDaysLocal = 0;
    crewDaysLocal +=
      (tileArea ? Math.max(0.5, Math.round((tileArea / 7) * 10) / 10) : 0) +
      (wpArea ? Math.max(0.2, Math.round((wpArea / 35) * 10) / 10) : 0);
    crewDays += crewDaysLocal;
    workDays = Math.max(1, Math.ceil(crewDaysLocal));

    materialTotal += tileMaterial + waterproof;
    laborTotal += tileLabor + demo;
    wasteTotal += wasteCost;
    targetSummary = `${area}㎡ ${mode === 'waterproof' ? '방수(2회+담수시험)' : mode === 'tile' ? '타일' : '철거+방수+타일'} · 타일 ${T.materialPer + T.installPer}만/㎡ · 방수 ${T.waterproofPer}만/㎡`;
    items.push(
      { id: 'tile', category: '자재', name: `타일 자재 (${tileArea}㎡)`, detail: `${tileArea}㎡ × ${T.materialPer}만`, amount: tileMaterial },
      { id: 'tile_labor', category: '노무', name: `타일 시공 (${tileArea}㎡)`, detail: `타일공 ${T.installPer}만/㎡ (자재 별도)`, amount: tileLabor },
      { id: 'waterproof', category: '자재', name: `방수 2회 + 담수 (${wpArea}㎡)`, detail: `${wpArea}㎡ × ${T.waterproofPer}만`, amount: waterproof },
      { id: 'demolition', category: '노무', name: remainTile ? '기존 타일 유지(철거 없음)' : '기존 마감 철거', detail: remainTile ? '덧방 기준 — 철거·폐기물 절감' : `${area}㎡ × ${T.demolitionPer}만`, amount: demo },
      { id: 'waste', category: '폐기물', name: '폐기물 반출', detail: '타일·철거재 수거', amount: wasteCost }
    );
    if (laborTotal + materialTotal + wasteTotal < T.minimum) {
      const gap = Math.round(T.minimum - (laborTotal + materialTotal + wasteTotal));
      items.push({ id: 'min_floor', category: '추가(현장)', name: '소규모 현장 최소 반영', detail: '출동·자재 하차·마감 최소선', amount: gap });
      laborTotal += gap;
    }
    // "후드랑 타일 다 갈아야" — 후드·덕트 교체는 타일 시공과 별도 자재·장비다
    if (/후드/.test(notes)) {
      materialTotal += 15;
      laborTotal += 8;
      items.push(
        { id: 'hood', category: '자재', name: '후드·덕트 (교체)', detail: '후드·덕트·마감', amount: 15 },
        { id: 'hood_labor', category: '노무', name: '후드 설치·배기 연결', detail: '설비·전기 연동', amount: 8 }
      );
    }
  } else if (trade === 'plaster') {
    const P = MATERIAL_RATES.plaster;
    const area = sizeUnit === '㎡' ? Math.max(1, sizeVal) : Math.max(1, +(toPyung(sizeVal, sizeUnit, 10) * 3.3).toFixed(1));
    const withTile = /타일/.test(notes) || c?.plaster?.tile;
    const withHeating = /난방/.test(notes) || c?.plaster?.heating;
    const plasterCrew = crewLabor(rates, 'plasterer', 27, area, P.perDay);
    const mortar = plasterCrew.cost;
    crewDays += plasterCrew.days + (withTile ? Math.max(0.5, Math.round((area / 7) * 10) / 10) : 0);
    const material = Math.round(area * P.materialPer);
    const heating = withHeating ? Math.round(area * P.heatingPer) : 0;
    const tileAdd = withTile ? Math.round(area * (TILE_ADD.material + TILE_ADD.install)) : 0;

    laborTotal += mortar + heating + (withTile ? Math.round(area * TILE_ADD.install) : 0);
    materialTotal += material + (withTile ? Math.round(area * TILE_ADD.material) : 0);
    wasteTotal += Math.max(10, Math.round(area * 0.4));
    targetSummary = `바닥 미장 ${area}㎡${withHeating ? ' + 난방 보강' : ''}${withTile ? ' + 타일' : ''} (미장공 ${plasterCrew.days}일 × ${plasterCrew.rate}만)`;
    items.push(
      { id: 'plaster', category: '노무', name: `바닥 미장 (${area}㎡)`, detail: `미장공 ${plasterCrew.days}일 × ${plasterCrew.rate}만 (하루 ${P.perDay}㎡)`, amount: mortar },
      { id: 'mat', category: '자재', name: '몰탈·메쉬·양생 자재', detail: `${area}㎡ × ${P.materialPer}만`, amount: material }
    );
    if (withHeating) items.push({ id: 'heating', category: '추가(구조)', name: '난방배관·단열 보강', detail: `${area}㎡ × ${P.heatingPer}만`, amount: heating });
    if (withTile)
      items.push(
        { id: 'tile', category: '자재', name: `타일 자재 (${area}㎡)`, detail: `${area}㎡ × ${TILE_ADD.material}만`, amount: Math.round(area * TILE_ADD.material) },
        { id: 'tile_labor', category: '노무', name: `타일 시공 (${area}㎡)`, detail: `${area}㎡ × ${TILE_ADD.install}만`, amount: Math.round(area * TILE_ADD.install) }
      );
    items.push({ id: 'waste', category: '폐기물', name: '폐기물·잔재 반출', detail: '몰탈 잔재·포대', amount: Math.max(10, Math.round(area * 0.4)) });
    if (mortar + material + heating + tileAdd < P.minimum) {
      const gap = Math.round(P.minimum - (mortar + material + heating + tileAdd));
      items.push({ id: 'min_floor', category: '추가(현장)', name: '최소 출동비', detail: '자재 하차·양생', amount: gap });
      laborTotal += gap;
    }
  } else if (trade === 'window') {
    const W = MATERIAL_RATES.window;
    // 창호는 '평'보다 ㎡로 말하는 현장이 많다 — 규모 미입력이면 발코니 1~2짝(6㎡) 기준
    const area =
      sizeVal > 0 ? (sizeUnit === '㎡' ? Math.max(1, sizeVal) : Math.max(1, +(toPyung(sizeVal, sizeUnit, 2) * 3.3).toFixed(1))) : 6;
    const product = Math.round(area * W.matPerSqm);
    const removal = W.removal;
    const wasteCost = W.waste;
    const windowCrew = crewLabor(rates, 'window', 32, area, W.perDay);
    const install = windowCrew.cost;
    crewDays += windowCrew.days + 0.5;
    materialTotal += product;
    laborTotal += install + removal;
    wasteTotal += wasteCost;
    targetSummary = `창호·발코니 ${area}㎡ 교체 (자재 ${W.matPerSqm}만/㎡ + 샷시공 ${windowCrew.days}일 × ${windowCrew.rate}만, 기존 철거 ${removal}만)`;
    items.push(
      { id: 'window', category: '자재', name: `창호·폴딩도어 (${area}㎡)`, detail: `${area}㎡ × ${W.matPerSqm}만 (샷시·유리·부자재)`, amount: product },
      { id: 'window_labor', category: '노무', name: `샷시 시공 (${area}㎡)`, detail: `창호·샷시공 ${windowCrew.days}일 × ${windowCrew.rate}만 (하루 ${W.perDay}㎡)`, amount: install },
      { id: 'removal', category: '노무', name: '기존 창호 철거', detail: '유리·프레임 분리', amount: removal },
      { id: 'waste', category: '폐기물', name: '창호·유리 폐기물', detail: '분리 반출', amount: wasteCost }
    );
    if (product + install + removal + wasteCost < W.minimum) {
      const gap = Math.round(W.minimum - (product + install + removal + wasteCost));
      items.push({ id: 'min_floor', category: '추가(현장)', name: '소규모 현장 최소 반영', detail: '출동·실측·마감 최소선', amount: gap });
      laborTotal += gap;
    }
  } else if (trade === 'repair') {
    const R = MATERIAL_RATES.repair;
    const spots = sizeUnit === '개소' || sizeUnit === '개' ? Math.max(1, sizeVal) : 1;
    // 수선 내용에 따라 부르는 인부가 다르다 — 페인트·탄성 / 코킹·실리콘 / 일반 보수
    const isPaint = /페인트|도장|도색|탄성|발수/.test(notes);
    const isCaulk = /실리콘|코킹/.test(notes);
    const repairRole = isPaint ? 'painter' : isCaulk ? 'caulking' : 'repair';
    const repairLabel = isPaint ? '페인트·탄성공' : isCaulk ? '코킹·실리콘공' : '수선·보수 기공';
    const repairRate = getRate(rates, ['labor', repairRole], isPaint ? 26 : isCaulk ? 25 : 28);
    const repairDays = Math.max(0.5, Math.round(spots * 0.5 * 10) / 10);
    const laborCost = Math.round(repairDays * repairRate);
    const matCost = Math.round(spots * R.materialPer);
    // 방충망 교체는 창호 교체가 아니다 — 짝당 3.5만 + 반나절
    const mosquito = /방충망/.test(ownNotes);
    // 중문(3연동)·방화문 설치는 문 자체가 자재다 (5만/개소로 잡으면 57만, 실제 45~60만 자재)
    const middleDoor = /중문|3연동|삼연동|방화문/.test(ownNotes) && /설치|교체|갈아|바꾸/.test(ownNotes);
    if (mosquito || middleDoor) {
      const qty = mosquito ? Math.max(1, spots) : 1;
      const mat = mosquito ? Math.round(qty * 3.5) : 45;
      const days = mosquito ? Math.max(0.5, Math.round(qty * 0.15 * 2) / 2) : 0.5;
      const labor = Math.round(days * 28);
      crewDays += days;
      laborTotal += labor;
      materialTotal += mat;
      workDays = Math.max(1, Math.ceil(days));
      targetSummary = mosquito ? `방충망 ${qty}짝 교체 (짝당 3.5만 + 시공)` : '중문(3연동)·방화문 설치 (문·문틀·시공)';
      items.push(
        { id: 'labor', category: '노무', name: mosquito ? `방충망 시공 (${qty}짝)` : '중문 설치', detail: `${days}일 × 28만`, amount: labor },
        { id: 'mat', category: '자재', name: mosquito ? `방충망 (${qty}짝)` : '중문·문틀 세트', detail: mosquito ? '짝당 3.5만' : '중문 45만 (문·문틀·손잡이)', amount: mat }
      );
    } else if (isPaint && !isCaulk && sizeVal > 0 && (sizeUnit === '평' || sizeUnit === '㎡')) {
      // "상가 20평 수성 페인트 벽·천장 도장" — 개소 1곳(55만)이 아니라 **면적**으로 계산한다.
      // 평이면 바닥면적 × 벽·천장 배수(벽만 1.9 / 벽+천장 2.6), ㎡면 그 면적 그대로.
      const area =
        sizeUnit === '㎡'
          ? Math.max(1, sizeVal)
          : Math.max(1, +(sizeVal * 3.3 * (/천장/.test(notes) ? 2.6 : /벽|벽체|전체/.test(notes) ? 1.9 : 1.9)).toFixed(1));
      // 탄성코트·발수는 수성페인트보다 자재·공정이 비싸다 (2026 공개 단가 기준)
      const perSqm = /탄성/.test(notes) ? 0.55 : /발수/.test(notes) ? 1.2 : 0.37; // 만원/㎡ (자재+인건)
      const paintLabor = Math.round(area * perSqm * 0.6);
      const paintMat = Math.round(area * perSqm * 0.4);
      const paintDays = Math.max(0.5, Math.round((paintLabor / Math.max(1, repairRate)) * 10) / 10);
      crewDays += paintDays;
      laborTotal += paintLabor;
      materialTotal += paintMat;
      workDays = Math.max(1, Math.ceil(paintDays));
      targetSummary = `도장(페인트) ${area}㎡ — ${/탄성/.test(notes) ? '탄성코트' : /발수/.test(notes) ? '발수제' : '수성페인트'} ${sizeUnit === '평' ? `${sizeVal}평 ` : ''}벽·천장 퍼티·하도·본도장 2회 (도장공 ${paintDays}일)`;
      items.push(
        { id: 'labor', category: '노무', name: `도장 인력 (${area}㎡)`, detail: `${repairLabel} ${paintDays}일 × ${repairRate}만`, amount: paintLabor },
        { id: 'mat', category: '자재', name: `도료·퍼티·부자재 (${area}㎡)`, detail: `${/탄성/.test(notes) ? '탄성코트' : /발수/.test(notes) ? '발수제' : '수성페인트'}·프라이머·마스킹`, amount: paintMat }
      );
    } else {
    crewDays += repairDays;
    laborTotal += laborCost;
    materialTotal += matCost;
    targetSummary = `부분 수선 ${spots}개소 (${repairLabel} ${repairDays}일 × ${repairRate}만 + 자재 ${R.materialPer}만/개소)`;
    items.push(
      { id: 'labor', category: '노무', name: `수선 인력 (${spots}개소)`, detail: `${repairLabel} ${repairDays}일 × ${repairRate}만`, amount: laborCost },
      { id: 'mat', category: '자재', name: '수선 자재·부자재', detail: `${spots}개소 × ${R.materialPer}만`, amount: matCost }
    );
    workDays = Math.max(1, Math.ceil(repairDays));
    }
    if (laborTotal + materialTotal < R.minimum) {
      const gap = Math.round(R.minimum - (laborTotal + materialTotal));
      items.push({ id: 'min_floor', category: '추가(현장)', name: '최소 출동비', detail: '이동·공구·마감', amount: gap });
      laborTotal += gap;
    }
  } else if (trade === 'carpentry' && c?.partition) {
    // 가벽·칸막이(경량벽체) — 8m 가벽으로 룸 3개를 나누는 현장.
    // '평'으로 환산하면 6평 철거·폐기물로 튀니 길이(m)와 문 개수로만 계산한다.
    const P = MATERIAL_RATES.partition;
    const meters = Math.max(0, Number(c.partition.meters) || 0);
    const doors = Math.max(0, Math.round(Number(c.partition.doors ?? c.partition.rooms) || 0));
    const rooms = Math.max(0, Math.round(Number(c.partition.rooms) || 0));
    const skilled = getRate(rates, ['labor', 'carpenter'], 30);
    const helperRate = getRate(rates, ['labor', 'helper'], 19);
    const mealPerHead = Math.max(0, getRate(rates, ['meal', 'perWorker'], 1));
    const manDays = (meters > 0 ? meters / P.perDayM : 1) + doors * P.doorDays;
    // 사람 수(1~3명) × 일수 조합 중 [인건비+식비]가 가장 적은 쪽 — 단 최소 2일(석고 퍼티·건조)
    let best = null;
    for (let crew = 1; crew <= 3; crew += 1) {
      const days = Math.max(P.minDays, Math.ceil(manDays / crew));
      const labor = days * (skilled + helperRate * (crew - 1));
      const total = labor + days * crew * mealPerHead;
      if (!best || total < best.total - 0.01) best = { crew, days, labor, total };
    }
    const days = best.days;
    const laborCost = Math.round(best.labor);
    const wallMat = Math.round(meters * P.wallPerM);
    const doorMat = doors * P.doorEach;
    const matCost = wallMat + doorMat;
    const wasteCost = meters || doors ? Math.round(P.wasteBase + meters * P.wastePerM) : 0;
    const consum = meters || doors ? P.consum : 0;
    crewDays += days * best.crew;
    laborTotal += laborCost;
    materialTotal += matCost;
    wasteTotal += wasteCost;
    equipTotal += consum;
    workDays = days;
    plannedCrew = {
      crew: best.crew,
      days,
      manDays: Math.round(manDays * 10) / 10,
      why: `가벽 ${meters || '?'}m${doors ? ` + 문 ${doors}개` : ''} — 목수 ${best.crew === 1 ? '1명' : `${best.crew}명(목수+보조)`} ${days}일이 원가 최소`,
    };
    targetSummary = `${meters ? `경량벽체 ${meters}m` : '가벽 길이 확인 필요'}${rooms ? ` · 룸 ${rooms}개` : ''}${doors ? ` · 문 ${doors}개` : ''} — 스터드·석고 2겹 + 퍼티·도장`;
    if (laborCost) items.push({ id: 'labor', category: '노무', name: `목공 인건비 (${days}일)`, detail: `목수 ${skilled}만 + 보조 ${best.crew > 1 ? `${best.crew - 1}명 ${helperRate}만` : '없음'} × ${days}일`, amount: laborCost });
    if (wallMat) items.push({ id: 'mat', category: '자재', name: `경량벽체 자재 (${meters}m)`, detail: `스터드·석고 2겹(양면)·단열·피스·테이프 · m당 ${P.wallPerM}만`, amount: wallMat });
    if (doorMat) items.push({ id: 'mat_door', category: '자재', name: `경량 도어·문틀 (${doors}개)`, detail: `도어 세트·경첩·손잡이 · 개당 ${P.doorEach}만`, amount: doorMat });
    if (wasteCost) items.push({ id: 'waste', category: '폐기물', name: '자재 자투리·포장재 반출', detail: `마대 2~3개 · ${wasteCost}만`, amount: wasteCost });
    if (consum) items.push({ id: 'equip', category: '장비', name: '소모품·공구', detail: '마대·피스·커터·보호구', amount: consum });
  } else if (trade === 'carpentry') {
    const C = MATERIAL_RATES.carpentry;
    // 이보드·결로 단열은 목공 틀·문을 만드는 일이 아니라 벽면 보강이다 — 화면 이름을 나눈다
    const insul = /이보드|단열|결로/.test(notes);
    const meters =
      sizeUnit === 'm' || sizeUnit === '개' || sizeUnit === '개소'
        ? Math.max(1, sizeVal)
        : Math.max(1, +(toPyung(sizeVal, sizeUnit, 3) * 1.5).toFixed(1));
    const carpenterCrew = crewLabor(rates, 'carpenter', 30, meters, C.perDay);
    const laborCost = carpenterCrew.cost;
    const matCost = Math.round(meters * C.matPer);
    crewDays += carpenterCrew.days;
    laborTotal += laborCost;
    materialTotal += matCost;
    targetSummary = insul
      ? `이보드·단열 보강 ${meters}m (목수 ${carpenterCrew.days}일 · 단열보드 부직포 면 · 도배 마감 별도)`
      : `목공 ${meters}m (문·문틀·몰딩·가구·데크) · 목수 ${carpenterCrew.days}일`;
    items.push(
      { id: 'labor', category: '노무', name: insul ? `단열 시공 인력 (${meters}m)` : `목공 인건비 (${meters}m)`, detail: `목수 ${carpenterCrew.days}일 × ${carpenterCrew.rate}만 (하루 ${C.perDay}m)`, amount: laborCost },
      { id: 'mat', category: '자재', name: insul ? `이보드·폼본드·테이프 (${meters}m)` : `목재·부자재 (${meters}m)`, detail: insul ? `단열보드·전용 본드·이음 테이프 (m당 ${C.matPer}만)` : `MDF·각재·경첩·몰딩·도장 (m당 ${C.matPer}만)`, amount: matCost }
    );
    if (laborCost + matCost < C.minimum) {
      const gap = Math.round(C.minimum - (laborCost + matCost));
      items.push({ id: 'min_floor', category: '추가(현장)', name: '최소 출동비', detail: '이동·공구·마감', amount: gap });
      laborTotal += gap;
    }
  } else if (trade === 'electric') {
    const E = MATERIAL_RATES.electric;
    // "34평 아파트 LED 등기구 전체 교체"에서 34평을 34개소로 읽으면 400만이 된다.
    // 평수만 있으면 등기구 개수로 환산한다 — 조명은 4평당 1개(집 전체 6~9개), 콘센트·스위치는 7평당 1개.
    const lighting = /조명|등기구|led|형광등|다운라이트|레일/.test(notes);
    const points =
      sizeUnit === '평' && sizeVal > 0
        ? Math.max(1, Math.min(12, Math.round(sizeVal * (lighting ? 0.25 : 0.15))))
        : Math.max(1, sizeVal || 1);
    // 등기구·레일조명 설치는 하루 10개 안팎, 배선·콘센트 증설은 6개소 기준
    const electricCrew = crewLabor(rates, 'electrician', 28, points, lighting ? 10 : E.perDay);
    const laborCost = electricCrew.cost + E.trip;
    const matCost = Math.round(points * E.matPer);
    crewDays += electricCrew.days;
    workDays = Math.max(1, Math.ceil(electricCrew.days));
    laborTotal += laborCost;
    materialTotal += matCost;
    targetSummary = `전기·조명 ${points}개소 (전기공 ${electricCrew.days}일 × ${electricCrew.rate}만 + 출장 ${E.trip}만)`;
    items.push(
      { id: 'labor', category: '노무', name: `전기 공사 ${points}개소`, detail: `전기·조명공 ${electricCrew.days}일 × ${electricCrew.rate}만 (하루 ${E.perDay}개소) + 출장 ${E.trip}만`, amount: laborCost },
      { id: 'mat', category: '자재', name: '스위치·콘센트·전선·조명', detail: `${points}개소분`, amount: matCost }
    );
    if (laborCost + matCost < E.minimum) {
      const gap = Math.round(E.minimum - (laborCost + matCost));
      items.push({ id: 'min_floor', category: '추가(현장)', name: '최소 출동비', detail: '소규모 현장 하한', amount: gap });
      laborTotal += gap;
    }
  } else if (trade === 'plumbing') {
    const P = MATERIAL_RATES.plumbing;
    const points = Math.max(1, sizeVal || 1);
    const plumbingCrew = crewLabor(rates, 'plumber', 28, points, P.perDay);
    const laborCost = plumbingCrew.cost + P.trip;
    const matCost = Math.round(points * P.matPer);
    crewDays += plumbingCrew.days;
    laborTotal += laborCost;
    materialTotal += matCost;
    targetSummary = `설비·배관 ${points}개소 (설비공 ${plumbingCrew.days}일 × ${plumbingCrew.rate}만 + 출장 ${P.trip}만)`;
    items.push(
      { id: 'labor', category: '노무', name: `배관·설비 ${points}개소`, detail: `설비·배관공 ${plumbingCrew.days}일 × ${plumbingCrew.rate}만 (하루 ${P.perDay}개소) + 출장 ${P.trip}만`, amount: laborCost },
      { id: 'mat', category: '자재', name: '배관·밸브·수전·이음쇠', detail: `${points}개소분`, amount: matCost }
    );
    if (laborCost + matCost < P.minimum) {
      const gap = Math.round(P.minimum - (laborCost + matCost));
      items.push({ id: 'min_floor', category: '추가(현장)', name: '최소 출동비', detail: '소규모 현장 하한', amount: gap });
      laborTotal += gap;
    }
  } else if (trade === 'film') {
    const F = MATERIAL_RATES.film;
    // 필름은 바닥면적(평)을 그대로 칠하는 게 아니다 — 문·창호·가구 표면만 시공한다.
    // ㎡를 적였으면 그 면적, 평만 있으면 표면적(바닥 × 1.6), "문 5짝"처럼 개수만 있으면
    // 문짝 양면+문틀 3.6㎡/짝으로 잡는다 (2026 실견적: 필름공 일당 30만·하루 10~14㎡).
    const doorCount = Number((notes.match(/(?:문|도어)\s*(\d+)\s*(?:짝|개|틀|곳)/) || [])[1] || 0);
    const area =
      sizeVal > 0 && sizeUnit === '㎡'
        ? Math.max(1, sizeVal)
        : sizeVal > 0 && sizeUnit === '평'
        ? Math.max(3, +(sizeVal * 1.6).toFixed(1))
        : doorCount > 0
        ? Math.max(3, +(doorCount * 3.6).toFixed(1))
        : 9.9;
    const filmCrew = crewLabor(rates, 'film', 28, area, F.perDay);
    const laborCost = filmCrew.cost;
    const matCost = Math.round(area * F.matPer);
    crewDays += filmCrew.days;
    laborTotal += laborCost;
    materialTotal += matCost;
    workDays = Math.max(1, Math.ceil(filmCrew.days));
    const withDoor = /중문|현관문/.test(notes) && /설치|시공|교체/.test(notes);
    if (withDoor) {
      const doorCost = 45;
      laborTotal += Math.round(doorCost * 0.55);
      materialTotal += doorCost - Math.round(doorCost * 0.55);
      crewDays += 0.5;
      items.push({ id: 'entrance_door', category: '자재', name: '현관 중문 설치', detail: '중문 1짝 + 레일·손잡이 (필름 마감 별도)', amount: doorCost });
    }
    targetSummary = `필름·시트지 ${area}㎡${withDoor ? ' + 현관 중문 1짝' : ''} (필름공 ${filmCrew.days}일 × ${filmCrew.rate}만)`;
    items.push(
      { id: 'labor', category: '노무', name: `필름 시공 (${area}㎡)`, detail: `필름공 ${filmCrew.days}일 × ${filmCrew.rate}만 (하루 ${F.perDay}㎡) · 기포·재단 포함`, amount: laborCost },
      { id: 'mat', category: '자재', name: `필름·시트지 자재 (${area}㎡)`, detail: `국산 인테리어 필름 (㎡당 ${F.matPer}만)`, amount: matCost }
    );
    if (laborCost + matCost < F.minimum) {
      const gap = Math.round(F.minimum - (laborCost + matCost));
      items.push({ id: 'min_floor', category: '추가(현장)', name: '최소 출동비', detail: '자재 하차·마감 하한', amount: gap });
      laborTotal += gap;
    }
  } else if (trade === 'groundwork') {
    const G = MATERIAL_RATES.groundwork;
    // "미니 포크레인 1일"은 1㎡가 아니라 장비 하루 작업량(약 20㎡)으로 잡는다
    let area = sizeUnit === '㎡' ? Math.max(1, sizeVal) : Math.max(1, +(toPyung(sizeVal, sizeUnit, 10) * 3.3).toFixed(1));
    if (area <= 5 && /포크레인|굴삭기|미니\s*굴삭/.test(notes)) area = 20;
    const base = Math.max(G.minimum, Math.round(area * G.perSqm));
    let crewDaysLocal = Math.max(1, Math.round((area / 30) * 10) / 10);
    crewDays += crewDaysLocal;
    workDays = Math.max(1, Math.ceil(crewDaysLocal));
    const equip = Math.round(base * G.equipRate);
    const laborCost = Math.round((base - equip) * 0.6);
    const matCost = base - equip - laborCost;
    laborTotal += laborCost;
    materialTotal += matCost;
    equipTotal += equip;
    targetSummary = `기초·토목 ${area}㎡ (터파기·골재·다짐·장비)`;
    items.push(
      { id: 'labor', category: '노무', name: `터파기·다짐 인력 (${area}㎡)`, detail: `${G.perSqm}만/㎡ 기준`, amount: laborCost },
      { id: 'mat', category: '자재', name: `골재·시멘트·철근 (${area}㎡)`, detail: '기초 자재', amount: matCost },
      { id: 'equip', category: '장비', name: '굴삭기·다짐 장비', detail: `${Math.round(G.equipRate * 100)}% 반영`, amount: equip }
    );
    wasteTotal += Math.max(0, Math.round(area * 0.8));
  } else if (trade === 'combined' && Array.isArray(c?.subScopes) && c.subScopes.length) {
    // 집 전체·복합 현장 — 포함 공종을 하나도 빠뜨리지 않고 각각 원가를 계산한다.
    const pyung = toPyung(sizeVal, sizeUnit, 15);
    const scopes = c.subScopes;
    const S = MATERIAL_RATES;
    const scopeNames = [];
    let phaseDays = 0; // 공종은 대부분 순서대로 진행된다 — 일수를 따로 더한다

    if (scopes.includes('demolition')) {
      const demoDays = Math.max(1, Math.ceil(pyung / 8));
      const skilled = getRate(rates, ['labor', 'demolition'], 27);
      const helperRate = getRate(rates, ['labor', 'helper'], 19);
      const cost = Math.round(demoDays * (skilled + helperRate));
      crewDays += demoDays * 2;
      phaseDays += demoDays;
      const wasteCost = Math.max(25, Math.round(pyung * 4));
      laborTotal += cost;
      wasteTotal += wasteCost;
      items.push(
        { id: 'labor', category: '노무', name: `철거·해체 (${demoDays}일)`, detail: `${pyung}평 기준 기공+보조`, amount: cost },
        { id: 'waste', category: '폐기물', name: '철거 폐기물 반출·처리', detail: `${pyung}평 기준 성상 분리`, amount: wasteCost }
      );
      scopeNames.push('철거');
    }
    if (scopes.includes('wallpaper')) {
      const wallPyung = +(pyung * 2.3).toFixed(1);
      const rolls = Math.ceil((wallPyung / 5) * 1.15);
      const wallCost = Math.round(rolls * S.wallpaper.paperRoll);
      // 바닥은 'floor' 공종이 따로 계산한다 — 옛 저장 현장(도배+장판 한 칩)은 여기서 보정
      const legacyFloor = !scopes.includes('floor') && (c?.fullInterior || /장판|마루|데코타일|바닥/.test(notes));
      const floorSqm = Math.round(pyung * 2.3);
      const floorCost = legacyFloor ? Math.round(floorSqm * S.wallpaper.floor18) : 0;
      const subMat = Math.min(14, Math.max(8, Math.round(pyung * 0.42)));
      const laborCost = 2 * getRate(rates, ['labor', 'wallpaper'], 30);
      crewDays += 2;
      phaseDays += 2;
      materialTotal += wallCost + floorCost + subMat;
      laborTotal += laborCost;
      items.push(
        { id: 'wallpaper', category: '자재', name: `합지 벽지 (${rolls}롤)`, detail: `벽 ${wallPyung}평`, amount: wallCost },
        ...(legacyFloor ? [{ id: 'floor', category: '자재', name: `1.8T 장판 (${floorSqm}㎡)`, detail: `${pyung}평 기준`, amount: floorCost }] : []),
        { id: 'submat', category: '자재', name: '도배 부자재', detail: '풀·초배지·몰딩', amount: subMat },
        { id: 'labor_wall', category: '노무', name: '도배 노무 (2일)', detail: '기공+보조', amount: laborCost }
      );
      scopeNames.push('도배');
    }
    if (scopes.includes('floor')) {
      // 바닥재 — 장판(1.8/2.2/4.5T)·데코타일·강마루를 구분해 계산한다
      const deco = /데코타일/.test(finishNotes);
      const hard = /강마루|원목마루/.test(finishNotes) || (/마루/.test(finishNotes) && !/장판/.test(finishNotes));
      const f45 = /4\.5|4\.5t|4\.5mm/.test(finishNotes);
      const unit = deco ? S.wallpaper.decoTile : hard ? S.wallpaper.hardWood : f45 ? S.wallpaper.floor45 : /2\.2|2\.2t/.test(finishNotes) ? S.wallpaper.floor22 : S.wallpaper.floor18;
      const floorSqm = Math.round(pyung * 2.3);
      const floorCost = Math.round(floorSqm * unit);
      const floorDays = hard ? Math.max(0.5, Math.round((pyung / 12) * 2) / 2) : pyung >= 30 ? 1 : 0.5;
      const floorRate = getRate(rates, ['labor', 'floor'], 28);
      const floorLabor = Math.round(floorDays * floorRate);
      crewDays += floorDays;
      phaseDays += floorDays;
      materialTotal += floorCost;
      laborTotal += floorLabor;
      const name = deco ? '데코타일' : hard ? '강마루' : f45 ? '4.5T 장판' : /2\.2/.test(finishNotes) ? '2.2T 장판' : '1.8T 장판';
      items.push(
        { id: 'floor', category: '자재', name: `${name} (${floorSqm}㎡)`, detail: `${floorSqm}㎡ × ${unit}만 (자재·부자재)`, amount: floorCost },
        { id: 'labor_floor', category: '노무', name: `바닥 시공 (${floorDays}일)`, detail: `${floorDays}일 × ${floorRate}만`, amount: floorLabor }
      );
      scopeNames.push(name);
    }
    if (scopes.includes('paint')) {
      // 도장은 바닥면적 × 벽·천장 배수(2.6)로 면적을 잡는다
      const area = Math.round(pyung * 3.3 * 2.6);
      const paintMat = Math.round(area * 0.37 * 0.4);
      const paintLabor = Math.round(area * 0.37 * 0.6);
      const paintDays = Math.max(0.5, Math.round((paintLabor / 26) * 2) / 2);
      crewDays += paintDays;
      phaseDays += paintDays;
      materialTotal += paintMat;
      laborTotal += paintLabor;
      items.push(
        { id: 'paint', category: '노무', name: `도장·페인트 (${area}㎡)`, detail: `도장공 ${paintDays}일`, amount: paintLabor },
        { id: 'paint_mat', category: '자재', name: `도료·퍼티·마스킹 (${area}㎡)`, detail: `수성페인트 하도·본도 2회`, amount: paintMat }
      );
      scopeNames.push('도장');
    }
    if (scopes.includes('electric')) {
      const E = S.electric;
      const points = Math.max(1, Math.min(14, Math.round(pyung * 0.25) || 1));
      const ec = crewLabor(rates, 'electrician', 28, points, 10);
      const laborCost = ec.cost + E.trip;
      const matCost = Math.round(points * E.matPer);
      crewDays += ec.days;
      phaseDays += Math.ceil(ec.days);
      laborTotal += laborCost;
      materialTotal += matCost;
      items.push(
        { id: 'elec_labor', category: '노무', name: `전기·조명 ${points}개소`, detail: `전기공 ${ec.days}일 × ${ec.rate}만 + 출장 ${E.trip}만`, amount: laborCost },
        { id: 'elec_mat', category: '자재', name: '등기구·스위치·전선', detail: `${points}개소분`, amount: matCost }
      );
      scopeNames.push('전기·조명');
    }
    if (scopes.includes('film')) {
      const F = S.film;
      const doorCount = Number((notes.match(/(?:문|도어)\s*(\d+)\s*(?:짝|개|틀|곳)/) || [])[1] || 0);
      const area = Math.max(4, doorCount > 0 ? +(doorCount * 3.6).toFixed(1) : 6);
      const fc = crewLabor(rates, 'film', 28, area, F.perDay);
      const matCost = Math.round(area * F.matPer);
      crewDays += fc.days;
      phaseDays += fc.days;
      laborTotal += fc.cost;
      materialTotal += matCost;
      items.push(
        { id: 'film_labor', category: '노무', name: `필름 시공 (${area}㎡)`, detail: `필름공 ${fc.days}일 × ${fc.rate}만`, amount: fc.cost },
        { id: 'film_mat', category: '자재', name: `필름·시트지 (${area}㎡)`, detail: `${area}㎡ × ${F.matPer}만`, amount: matCost }
      );
      scopeNames.push('필름');
    }
    if (scopes.includes('bathroom')) {
      const B = S.bathroom;
      // 현장 글에 적힌 칸 수를 그대로 쓴다 ("화장실 2칸 올수리"가 1칸으로 잡히던 것)
      const kansRaw = notes.match(/(?:욕실|화장실)\s*(\d+)\s*칸/) || notes.match(/(한|두|세|네)\s*칸/);
      const KOR_KAN = { 한: 1, 두: 2, 세: 3, 네: 4 };
      const kans = Math.max(1, kansRaw ? Number(kansRaw[1]) || KOR_KAN[kansRaw[1]] || 1 : 1);
      const laborCost = Math.round(B.laborDays * getRate(rates, ['labor', 'bathroom'], 37) * kans);
      crewDays += B.laborDays * kans;
      phaseDays += Math.max(5, B.laborDays * kans);
      const mat = B.demolition + B.waterproofPer + B.tilePer + B.fixturePer;
      materialTotal += mat * (kans - 1) + Math.round(mat - B.demolition);
      laborTotal += laborCost + Math.round(B.demolition * (kans - 1));
      wasteTotal += B.wastePer * kans;
      items.push(
        { id: 'bath_mat', category: '자재', name: `욕실 ${kans}칸 철거·방수·타일·도기`, detail: `철거 ${B.demolition} + 방수 ${B.waterproofPer} + 타일 ${B.tilePer} + 도기 ${B.fixturePer}`, amount: mat * (kans - 1) + Math.round(mat - B.demolition) },
        { id: 'bath_labor', category: '노무', name: `욕실 타일공 (${B.laborDays * kans}일)`, detail: `${kans}칸 기준`, amount: laborCost },
        { id: 'bath_waste', category: '폐기물', name: '욕실 폐기물 반출', detail: '타일·도기', amount: B.wastePer * kans }
      );
      scopeNames.push(`욕실 ${kans}칸`);
    }
    if (scopes.includes('kitchen')) {
      const K = S.kitchen;
      const sink = Math.round(3.2 * K.sinkPerM);
      const top = Math.round(3.2 * K.topPerM);
      const laborCost = K.laborDays * getRate(rates, ['labor', 'kitchen'], 32);
      crewDays += K.laborDays;
      phaseDays += K.laborDays;
      materialTotal += sink + top;
      laborTotal += laborCost;
      wasteTotal += K.waste;
      items.push(
        { id: 'sink', category: '자재', name: '기본형 싱크대 (3.2m)', detail: '상·하부장', amount: sink },
        { id: 'top', category: '자재', name: '인조대리석 상판 (3.2m)', detail: '3.2m × 16만', amount: top },
        { id: 'kitchen_labor', category: '노무', name: `주방 노무 (${K.laborDays}일)`, detail: '철거·설비·설치', amount: laborCost },
        { id: 'kitchen_waste', category: '폐기물', name: '기존 싱크대 철거·반출', detail: '해체 및 처리', amount: K.waste }
      );
      scopeNames.push('주방');
    }
    if (scopes.includes('entrance')) {
      const cost = Math.round(pyung >= 20 ? 55 : 45);
      const laborPart = Math.round(cost * 0.6);
      crewDays += 1;
      phaseDays += 1;
      laborTotal += laborPart;
      materialTotal += cost - laborPart;
      items.push({ id: 'entrance', category: '자재', name: '현관 중문·신발장·현관 타일', detail: '중문 1 + 신발장 + 타일', amount: cost });
      scopeNames.push('현관');
    }
    if (scopes.includes('plaster')) {
      const area = Math.max(1, +(pyung * 3.3).toFixed(1));
      const combinedPlaster = crewLabor(rates, 'plasterer', 27, area, 25);
      const mortar = combinedPlaster.cost;
      const mat = Math.round(area * S.plaster.materialPer);
      crewDays += combinedPlaster.days;
      phaseDays += combinedPlaster.days;
      laborTotal += mortar;
      materialTotal += mat;
      items.push(
        { id: 'plaster', category: '노무', name: `바닥 미장 (${area}㎡)`, detail: `미장공 ${combinedPlaster.days}일 × ${combinedPlaster.rate}만`, amount: mortar },
        { id: 'plaster_mat', category: '자재', name: '몰탈·메쉬·양생', detail: `${area}㎡ × ${S.plaster.materialPer}만`, amount: mat }
      );
      scopeNames.push('바닥 미장');
    }
    if (scopes.includes('groundwork')) {
      const G = S.groundwork;
      const area = Math.max(1, +(pyung * 3.3).toFixed(1));
      const gBase = Math.max(G.minimum, Math.round(area * G.perSqm));
      const gEquip = Math.round(gBase * G.equipRate);
      const gLabor = Math.round((gBase - gEquip) * 0.6);
      const gMat = gBase - gEquip - gLabor;
      crewDays += Math.max(1, Math.round((area / 30) * 10) / 10);
      phaseDays += Math.max(1, Math.round((area / 30) * 10) / 10);
      laborTotal += gLabor;
      materialTotal += gMat;
      equipTotal += gEquip;
      items.push(
        { id: 'groundwork', category: '노무', name: `터파기·정지·다짐 (${area}㎡)`, detail: `기초·정지 ${G.perSqm}만/㎡ 기준`, amount: gLabor },
        { id: 'groundwork_mat', category: '자재', name: `골재·시멘트·철근 (${area}㎡)`, detail: '기초·되메우기 자재', amount: gMat },
        { id: 'groundwork_equip', category: '장비', name: '굴삭기·다짐 장비', detail: `${Math.round(G.equipRate * 100)}% 반영`, amount: gEquip }
      );
      scopeNames.push('기초·정지');
    }
    const customScopeNames = scopes.filter((s) => typeof s === 'string' && s.startsWith('x:')).map((s) => s.slice(2));
    if (customScopeNames.length) scopeNames.push(...customScopeNames);
    const excludedText =
      Array.isArray(c?.excludedScopes) && c.excludedScopes.length
        ? ` · ${c.excludedScopes.map((x) => (x === 'window' ? '창호' : x)).join('·')} 제외`
        : '';
    // 철거+정지처럼 마감이 없는 복합은 '인테리어'라고 부르지 않는다
    const comboLabel = interiorStyle ? '복합 인테리어' : '복합 공사';
    // 올수리·전체 인테리어 — 눈에 안 보이는 기본 공정(문·몰딩·도장·전기·설비·조명)까지
    // 평당 기준으로 보정한다. (15평 전체 인테리어가 400만원대로 나오던 과소 견적 방지)
    if (c?.fullInterior) {
      const floor = Math.round(pyung * 85);
      const cur = laborTotal + materialTotal + wasteTotal + equipTotal;
      if (cur < floor) {
        const gap = floor - cur;
        const laborPart = Math.round(gap * 0.6);
        items.push({
          id: 'full_package',
          category: '추가(현장)',
          name: '올수리 기본 포함 공정 (문·몰딩·도장·전기·설비·조명)',
          detail: `${pyung}평 기준 — 금액·범위는 현장 확인 후 조정`,
          amount: gap,
        });
        laborTotal += laborPart;
        materialTotal += gap - laborPart;
        crewDays += Math.max(1, Math.round((pyung / 10) * 10) / 10);
      }
    }
    targetSummary = `${pyung}평 ${comboLabel} — ${scopeNames.join(' + ') || '범위 확인 필요'}${excludedText}`;
    // 복합 일수 — 공종은 순서대로 진행되므로 공종별 일수를 더한다(전체 인테리어는 양생·발주 대기로 2~3주가 정상).
    workDays = Math.max(2, Math.min(25, Math.ceil(phaseDays)));
    plannedCrew = {
      crew: 2,
      days: workDays,
      manDays: Math.round(crewDays * 10) / 10,
      why: `복합 현장 — 2명 팀이 공종 순서대로 (연인원 ${Math.round(crewDays * 10) / 10}명·일)`,
    };
  } else {
    // 기타/미분류 — 만능 인력·자재 직접 견적 모드
    const plan = c?.customPlan || {};
    const ppl = Math.max(0, toNum(plan.people));
    const days = Math.max(0, toNum(plan.days));
    const wage = plan.wage === '' || plan.wage === undefined ? getRate(rates, ['labor', 'helper'], 19) : Math.max(0, toNum(plan.wage));
    const materialIn = Math.max(0, toNum(plan.material));
    const equipIn = Math.max(0, toNum(plan.equip));
    const wasteIn = Math.max(0, toNum(plan.waste));
    const hasPlan = ppl > 0 || days > 0 || materialIn > 0 || equipIn > 0 || wasteIn > 0;
    const label = c?.tradeName
      ? String(c.tradeName).slice(0, 24)
      : trade === 'combined'
      ? '복합 인테리어'
      : '직접 입력 현장';

    if (hasPlan) {
      const laborCost = Math.round(ppl * days * wage);
      crewDays += ppl * days;
      if (laborCost) items.push({ id: 'labor', category: '노무', name: `인부 ${ppl}명 × ${days}일`, detail: `일당 ${wage}만`, amount: laborCost });
      if (materialIn) items.push({ id: 'mat', category: '자재', name: '자재비 (직접 입력)', detail: `${label} 자재`, amount: materialIn });
      if (equipIn) items.push({ id: 'equip', category: '장비', name: '장비·운반 (직접 입력)', detail: '장비·반출', amount: equipIn });
      if (wasteIn) items.push({ id: 'waste', category: '폐기물', name: '폐기물·반출 (직접 입력)', detail: '수거·처리', amount: wasteIn });
      laborTotal += laborCost;
      materialTotal += materialIn;
      equipTotal += equipIn;
      wasteTotal += wasteIn;
      targetSummary = `${label} · 인부 ${ppl}명×${days}일(일당 ${wage}만) + 자재 ${materialIn}만 + 장비 ${equipIn}만 + 폐기물 ${wasteIn}만`;
    } else {
      // 규모를 모르는 '직접 입력' 현장 — 사무실·상가라는 말만 보고 15평을 잡으면 큰 금액이 나간다.
      // 한 공간 기준(6평)으로 작게 잡고, 화면에 '규모·범위 확인 필요'를 같이 쓴다.
      const pyung = toPyung(sizeVal, sizeUnit, defaultPyungOf(c, 15));
      const laborCost = Math.round(50 + pyung * 6);
      crewDays += Math.max(1, Math.round((pyung / 8) * 10) / 10);
      const matCost = Math.round(60 + pyung * 8);
      laborTotal += laborCost;
      materialTotal += matCost;
      wasteTotal += 33;
      targetSummary =
        trade === 'combined'
          ? `${pyung}평 복합 공사 — 포함 공종을 1단계에서 켜면 정확해집니다`
          : `${label} (약 ${pyung}평 기준 가산출 — 만능 견적 모드에 인부·자재·장비를 넣으면 정확해집니다)`;
      items.push(
        { id: 'labor', category: '노무', name: '복합 공정 노무비', detail: `${pyung}평 기준`, amount: laborCost },
        { id: 'mat', category: '자재', name: '복합 공정 표준 자재비', detail: `${pyung}평 기준`, amount: matCost },
        { id: 'waste', category: '폐기물', name: '폐기물 처리 (2.5톤 1대)', detail: '수거 반출', amount: 33 }
      );
    }
  }

  const baseLabor = laborTotal;
  const baseMaterial = materialTotal;

  // ---- 실측 체크리스트 가산 ----
  let surchargeTotal = 0;
  // 현장·규제·운반 가산은 '항목'으로만 쌓이고 원가 합계에 안 들어가면 화면엔 뜨는데
  // 정작 견적엔 안 실려 사장님이 그 돈을 손해 본다(관리소 신고·석면·내력벽·단전단수 등).
  // 그래서 합계에 이미 들어간 항목(inTotals)만 빼고 나머지는 surchargeExtra에 모아 원가에 더한다.
  let surchargeExtra = 0;
  // mode: 'extra' = 원가에 더한다(기본) · 'in' = 이미 인건비·자재 등 합계에 들어감 · 'aside' = 조건부 별도비(발생 시에만 청구)
  const addSurcharge = (id, category, name, detail, amount, mode = 'extra') => {
    if (!amount) return;
    surchargeTotal += amount;
    if (mode === 'extra') surchargeExtra += amount;
    items.push({ id, category, name, detail, amount, isSurcharge: true, conditional: mode === 'aside' });
  };

  const lifting = computeLifting(c, rates);
  // 현장 조건(층수·시간·거리·장비·규제)은 engine/surcharge.js 한 표에서 온다.
  // 같은 조건이 두 번 붙지 않게, 그리고 화면에만 뜨고 원가에 안 들어가는 일이 없게.
  const siteCtx = {
    rates,
    lifting,
    pyung: toPyung(c?.sizeValue, c?.sizeUnit, 15),
    wasteTotal,
    laborTotal,
    workDays: workDays || 1,
    outOfTown: !!(c?.region && c.region !== '안동' && c.region !== '기타' && /출장|외곽|원거리/.test(notes)),
    survey: (id) => surveyOn(c, id),
    amount: (id, fallback) => surveyAmount(c, id, fallback),
  };
  siteSurchargeLines(c, siteCtx).forEach((l) => {
    addSurcharge(l.id, l.category, l.name, l.detail, l.amount, l.mode);
    if (l.addToLabor) laborTotal += l.amount;
    if (l.addToMaterial) materialTotal += l.amount;
    if (l.addToEquip) equipTotal += l.amount;
    if (l.addToWaste) wasteTotal += l.amount;
    if (l.crewDays) crewDays += l.crewDays;
  });

  // ---- 직접 추가한 실측 항목 ----
  (c?.customChecklist || []).forEach((it) => {
    const key = `custom_${it.id || it.label}`;
    if (!surveyOn(c, key)) return;
    const amount = surveyAmount(c, key, Math.max(0, Number(it.amount) || 0));
    addSurcharge(key, '추가(현장)', it.label || '직접 추가 항목', it.memo || '현장에서 직접 추가', amount, 'in');
    laborTotal += amount;
  });

  // ---- 디자인·자재 번역기 고난도 디테일 할증 (인테리어·마감 현장만) ----
  const detail = detailSurcharge(c);
  if (interiorStyle && detail.rate > 0) {
    const base = laborTotal + materialTotal;
    const amount = Math.round((base * detail.rate) / 100);
    surchargeTotal += amount;
    laborTotal += amount;
    items.push({
      id: 'design_detail',
      category: '추가(디테일)',
      name: `손이 많이 가는 마감 +${detail.rate}%`,
      detail: detail.rows.map((d) => d.label).join(' · ') + ` (공사 기간 +${detail.days}일)`,
      amount,
      isSurcharge: true,
    });
  }

  // ---- 폐기물 실비 반영 (선택) ----
  if (c?.waste?.applyActual && c?.waste?.actualCost) {
    const actual = Math.round(toNum(c.waste.actualCost));
    const delta = actual - wasteTotal;
    wasteTotal = actual;
    items.push({
      id: 'waste_actual',
      category: '폐기물',
      name: '폐기물 실비(차량 기준) 반영',
      detail: c.waste.assignMode === 'mixed' ? '혼합 반출 기준 — 성상 분리 시 절감 가능' : '성상 분리 반출 기준',
      amount: delta,
      isAdjust: true,
    });
  }

  // ---- 답사 변동(3단계) — 견적가뿐 아니라 원가·공사일수에도 그대로 반영한다 ----
  // 예전에는 답사에서 금액을 빼도 원가가 그대로라 4단계가 '보수적 원가 243만보다 100만 적자'처럼
  // 실제로는 남는 현장을 적자로 보여 줬다. 변동은 '그 일이 빠지거나 붙은 것'이므로 원가도 같이 움직인다.
  const changeLogs = Array.isArray(c?.changeLogs) ? c.changeLogs : [];
  const signOf = (log) => (log?.type === 'decrease' ? -1 : 1);
  const priceDeltaOf = (log) => signOf(log) * (Number(log?.amount) || 0);
  // 원가 변동: 항목에 적힌 costAmount가 있으면 그 값을, 없으면 견적 변동액과 같은 만큼 본다.
  // costFree(값만 깎기·협상)면 원가는 그대로 — 순수한 가격 흥정은 남는 돈이 줄어드는 게 맞다.
  const costDeltaOf = (log) => {
    if (log?.costFree) return 0;
    const raw = log?.costAmount;
    const explicit = raw !== null && raw !== undefined && String(raw).trim() !== '' ? Number(raw) : null;
    return signOf(log) * (Number.isFinite(explicit) ? explicit : Number(log?.amount) || 0);
  };
  const adjustmentTotal = Math.round(changeLogs.reduce((sum, l) => sum + priceDeltaOf(l), 0));
  const adjustTotal = Math.round(changeLogs.reduce((sum, l) => sum + costDeltaOf(l), 0));
  const adjustDays = Math.round(changeLogs.reduce((sum, l) => sum + Math.max(0, Number(l?.days) || 0), 0) * 10) / 10;
  if (adjustTotal !== 0) {
    const grew = adjustTotal > 0;
    items.push({
      id: 'survey_adjust',
      category: '답사 변동',
      name: `답사 변동 ${changeLogs.length}건 ${grew ? '추가' : '감소'} (${grew ? '+' : ''}${adjustTotal}만)`,
      detail: changeLogs
        .filter((l) => costDeltaOf(l) !== 0)
        .map((l) => `${l.item || '변동'} ${costDeltaOf(l) > 0 ? '+' : ''}${costDeltaOf(l)}만`)
        .join(' · '),
      amount: adjustTotal,
      isAdjust: true,
    });
  }

  // ---- 교통비·식비 — 현장 거리와 총 연인원(명·일)으로 자동 계산 ----
  // 기준 거리(기본 15km)를 넘으면 (거리 ÷ 기준거리, 내림) × 연인원 × 1인당 추가금이 붙는다.
  const distanceKm = Math.max(0, toNum(c?.distanceKm));
  const baseKm = Math.max(1, getRate(rates, ['travel', 'baseKm'], 15));
  const travelPer = Math.max(0, getRate(rates, ['travel', 'perWorker'], 1));
  const mealPer = Math.max(0, getRate(rates, ['meal', 'perWorker'], 1));
  const crewDayCount = Math.max(0, Math.round((crewDays + adjustDays) * 10) / 10);
  const travelUnits = distanceKm >= baseKm ? Math.floor(distanceKm / baseKm) : 0;
  const travelCost = Math.round(travelUnits * crewDayCount * travelPer);
  const mealCost = Math.round(crewDayCount * mealPer);
  const crewCost = travelCost + mealCost;
  if (crewCost > 0) {
    items.push({
      id: 'crew_cost',
      category: '노무',
      name: '교통비 · 식비',
      detail: [
        `연인원 ${crewDayCount}명·일`,
        mealPer ? `식비 ${mealPer}만/인·일` : '',
        travelUnits ? `원거리 ${distanceKm}km ÷ ${baseKm}km ${travelUnits}회 × ${travelPer}만` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      amount: crewCost,
    });
    laborTotal += crewCost;
  }
  const crew = {
    days: crewDayCount,
    distanceKm,
    baseKm,
    travelUnits,
    travelPer,
    mealPer,
    travelCost,
    mealCost,
    total: crewCost,
  };

  // ---- 실전 원가 절감 스위치 (보조 인력 1명 감축 — 사람을 쓰는 공종만) ----
  const helperTrades = ['demolition', 'wallpaper', 'bathroom', 'kitchen', 'plaster', 'tilewaterproof', 'combined', 'custom'];
  if (c?.cuts?.helper && helperTrades.includes(trade)) {
    const cut = Math.round(getRate(rates, ['labor', 'helper'], 17));
    items.push({
      id: 'helper_cut',
      category: '노무',
      name: '보조 인력 1명 감축',
      detail: '현장 정리·운반을 직접 하는 조건',
      amount: -cut,
      isAdjust: true,
    });
    laborTotal -= cut;
  }

  // ---- 추천 자재 세트(실속/표준/고급) 반영: 세트를 바꾸면 견적이 즉시 바뀐다 ----
  // 단, 철거·폐기물·기초·정지·인력처럼 자재 등급 개념이 없는 현장은 항상 표준(1.0)으로 계산한다.
  // (공종을 철거로 바꿨는데 예전에 고른 '고급' 세트가 남아 견적을 흔드는 일을 막는다)
  const mset = interiorStyle ? materialSetFor(c, trade) : null; // 철거·폐기물·정지엔 자재 세트 자체가 없다
  const matMul = mset && Number.isFinite(mset.mul) && mset.mul > 0 ? mset.mul : 1;
  if (matMul !== 1) {
    items.forEach((it) => {
      if (it.category === '자재') it.amount = Math.round((Number(it.amount) || 0) * matMul);
    });
    materialTotal = Math.round(materialTotal * matMul);
  }

  // 항목별 포함/제외 (견적서에서 한 줄씩 끌 수 있다)
  const excludedIds = Array.isArray(c?.excludedItems) ? c.excludedItems : [];
  const excludedAmount = items
    .filter((i) => excludedIds.includes(i.id))
    .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  // 소형·부품 현장은 원가 바닥도 낮춘다 (에어컨 1대 철거가 30만원으로 보이지 않게)
  const costFloor = smallJob ? 12 : 30;

  // ── 4축 합계는 **줄에서 다시 센다** ─────────────────────────
  // 위에서 만든 줄(items) 하나하나가 자기 축(자재·인건비·장비·폐기물)을 갖고 있고,
  // 합계는 그 줄들의 합이다. 예전처럼 laborTotal += … 로 따로 더하지 않으므로
  // 같은 돈이 두 축에 겹쳐 들어가거나 빠지는 일이 구조적으로 생기지 않는다.
  items.forEach((it) => {
    it.axis = axisOf(it);
  });
  const ledger = createLedger();
  items.forEach((it) =>
    ledger.add({ ...it, phase: it.id === 'survey_adjust' ? 'change' : it.isSurcharge ? 'surcharge' : 'base' })
  );
  const countedLines = ledger.lines.filter((l) => !l.conditional && !excludedIds.includes(l.id));
  const axisSum = (axis, pred = () => true) =>
    countedLines.filter((l) => l.axis === axis && pred(l)).reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const axisTotals = AXES.reduce((out, axis) => ({ ...out, [axis]: axisSum(axis) }), {});
  const baseAxisTotals = AXES.reduce((out, axis) => ({ ...out, [axis]: axisSum(axis, (l) => l.id !== 'survey_adjust') }), {});
  laborTotal = axisTotals.labor;
  materialTotal = axisTotals.material;
  wasteTotal = axisTotals.waste;
  equipTotal = axisTotals.equip;

  // 실지 원가(변동 전) — 견적가는 이 값으로 잡고, 답사 변동은 금액·원가에 각각 한 번씩만 더한다.
  // (변동을 원가에도 넣은 뒤 그 원가로 다시 가격을 계산하면 -40만이 -90만으로 두 번 빠진다)
  const baseLineSum = AXES.reduce((sum, axis) => sum + baseAxisTotals[axis], 0);
  let baseDirectCost = Math.max(costFloor, Math.round(baseLineSum));
  if (baseDirectCost > Math.round(baseLineSum)) {
    // 최소 공사비 하한을 적용하면 그 차액도 줄로 남긴다 (합계 = 줄 합계 불변식)
    const gap = baseDirectCost - Math.round(baseLineSum);
    const floorLine = { id: 'cost_floor', category: '추가(현장)', name: '최소 공사비 하한', detail: '출동·실측·마감 최소선', amount: gap, axis: 'labor' };
    items.push(floorLine);
    ledger.add(floorLine);
    baseAxisTotals.labor += gap;
    axisTotals.labor += gap;
    laborTotal += gap;
  }
  let totalDirectCost = Math.max(costFloor, baseDirectCost + adjustTotal);

  // ---- 관공서 공고: 설계내역서 확인 전까지 실행원가를 수주금액의 80%로 보수적으로 잡는다 ----
  // (일반 15평 공식으로 두면 2,720만짜리 공고가 원가 338만으로 보여 '남는 돈 +2,382만' 착시가 생긴다)
  const bidPriceMan = Math.round(Number(c?.bid?.bidPrice || 0) / 10000) || Math.round(Number(c?.bidBudget) || 0);
  const isBid = bidPriceMan > 0;
  const bidCostFloor = isBid ? Math.round(bidPriceMan * 0.8) : 0;
  if (isBid && totalDirectCost < bidCostFloor) {
    const gap = bidCostFloor - totalDirectCost;
    items.push({
      id: 'bid_cost_floor',
      category: '추가(공고)',
      name: '공고 실행원가 보정 (수주금액의 80%)',
      detail: '설계내역서·물량 확인 전까지 보수적으로 잡은 실행원가',
      amount: gap,
      isAdjust: true,
    });
    totalDirectCost += gap;
    baseDirectCost += gap;
  }
  // 공고 원가 메모는 내부 값(bidNote)으로만 둔다 — 손님 문서·이웃 안내문에 새면 안 된다
  const bidNote = isBid ? `공고 수주금액 ${bidPriceMan.toLocaleString('ko-KR')}만의 80%를 실행원가 하한으로 반영` : '';
  if (isBid) {
    const work = workTypeLabel(c?.bid?.workTypes) || info.label;
    targetSummary = `${String(c?.bid?.title || c?.title || '공고').slice(0, 40)} · ${work} · 수주금액 ${bidPriceMan.toLocaleString('ko-KR')}만원`;
  }

  const markedItems = items.map((i) => ({ ...i, excluded: excludedIds.includes(i.id) }));

  // ── 마진·예비비 ──────────────────────────────────────────────
  // 폐기물 단독은 자재·시공이 아니라 차량 실비를 그대로 받는 일이다. 일반 시공 마진(22~35%)을
  // 얹으면 2.5톤 한 차가 113만원이 되어 현실 시세(85~95만)를 벗어나고 반차는 26만으로 손해가 된다.
  // → 운용 마진 13%(10~15% 구간), 예비비 0%(차량 실비는 시공처럼 흔들리지 않는다).
  const wasteOnly = trade === 'waste';
  const WASTE_MARGIN = WASTE_QUOTE_MARGIN;
  const marginTouched =
    typeof c?.marginRate === 'number' && (!wasteOnly || c.marginRate !== TRADES.waste.defaultMargin);
  const marginTarget = marginTouched ? c.marginRate : wasteOnly ? WASTE_MARGIN : info.defaultMargin;
  // 폐기물 단독은 차량 실비를 그대로 받는 일 — 다른 공종에서 물려받은 20~35% 마진이 남아 있어도
  // 운용 마진 상한(15%)까지만 적용해 현실 시세(2.5톤 85~95만)를 넘지 않게 한다.
  let safeMargin = wasteOnly
    ? Math.min(15, Math.max(5, marginTarget))
    : Math.min(60, Math.max(5, marginTarget));

  let clientPrice;
  let customPrice = null;
  if (c?.customClientPrice !== null && c?.customClientPrice !== undefined && c?.customClientPrice !== '') {
    customPrice = Math.max(0, toNum(c.customClientPrice));
  }
  const priceForCost = (cost) => Math.round(cost / (1 - safeMargin / 100));
  const rangePriceFromCost = (cost) => priceForCost(cost);

  // ---- 2026 보수적 보호: 예비비(안전 버퍼) ----
  // 원가를 그대로 믿지 않고 5~8% 예비비를 더한 '보수적 원가'로 견적가를 낸다.
  const bufferDefault = getRate(rates, ['buffer'], 6);
  let bufferRate = Math.max(
    0,
    Math.min(15, typeof c?.bufferRate === 'number' ? c.bufferRate : bufferDefault)
  );
  if (wasteOnly && (typeof c?.bufferRate !== 'number' || c.bufferRate === bufferDefault)) bufferRate = 0;
  let costBuffer = Math.round((totalDirectCost * bufferRate) / 100);
  let costWithBuffer = totalDirectCost + costBuffer;

  const minJobBase = getRate(rates, ['minimumJob'], 40);
  const minJob = smallJob ? Math.min(20, minJobBase) : minJobBase;
  let suggestedPrice = Math.round((baseDirectCost * (1 + bufferRate / 100)) / (1 - safeMargin / 100));
  const minApplied = minJob > 0 && suggestedPrice < minJob;
  if (minApplied) suggestedPrice = minJob;   // 자동 청구 단가(인력 지원)는 사람 수 × 일수 × 청구단가가 자연히 맞는다
  let quotedLabor = null;
  if (trade === 'labor' && customPrice === null) {
    const people = sizeUnit === '명' && sizeVal > 0 ? sizeVal : Math.max(1, parseInt(sizeVal, 10) || 1);
    const days = Math.max(1, parseInt(c?.laborDays, 10) || 1);
    quotedLabor = Math.round(people * days * laborChargeOf(rates, notes));
  }
  let baseClientPrice = customPrice !== null ? Math.max(customPrice, 0) : quotedLabor !== null ? quotedLabor : suggestedPrice;

  // ── 관공서 공고: 부를 금액은 공고 수주금액이다 ────────────────────────────
  // 예전에는 1,500만 공고에 실행원가 80%(1,200만)·마진 25%로 1,590만을 제시해
  // 공고금액을 넘는 금액이 화면에 떴다. 낙찰금액은 수주금액을 넘지 않으므로
  // 손님이 직접 부른 금액·직접 입력가가 없으면 수주금액으로 잡고 마진을 그 안에서 보여 준다.
  const bidLocked = isBid && customPrice === null && quotedLabor === null;

  // 현장 변동(추가·감소) 누적 — 위에서 뽑은 값을 그대로 쓴다 (견적가에만 더하지 않고 원가에도 반영했다)

  // 앱이 계산한 최종 견적(참고용) — 단가·변동을 모두 반영한 값
  let appClientPrice = bidLocked
    ? Math.max(0, bidPriceMan + adjustmentTotal)
    : Math.max(0, baseClientPrice + adjustmentTotal);

  // 내가 부른 금액(손님에게 실제로 부른 합의가) — 있으면 이 금액이 최종 견적이다.
  // 답사 변동·자재 변경을 이미 반영해 손님과 말한 숫자이므로, 앱 계산가로 다시 더하지 않는다.
  const calledRaw = c?.calledPrice;
  const hasCalledPrice =
    calledRaw !== null && calledRaw !== undefined && String(calledRaw).trim() !== '' && Number.isFinite(Number(calledRaw));
  const calledPrice = hasCalledPrice ? Math.max(0, Math.round(Number(calledRaw))) : null;
  clientPrice = calledPrice !== null ? calledPrice : appClientPrice;

  // ── 시세 상식 검증 (v3.20, engine/sanity.js) ─────────────────────────────
  // 전 공종(철거·폐기물·인력·욕실·주방·타일·도배·바닥·필름·도장·전기·방수·창호·목공·복합)의
  // 계산 결과가 규모별 현실 시세 [min, 보통, 보통, max]를 벗어나면 마진·예비비를 자동으로 조정한다.
  // 야간·지하·양중·석면 같은 현장 할증은 시세 밖의 돈이므로 빼고 본다(할증 제외).
  const surchargeShare =
    totalDirectCost > 0 ? Math.min(0.85, Math.max(0, (surchargeExtra || 0) / totalDirectCost)) : 0;
  const sanityParts = {
    vehicle: wasteVehicleCost,
    ticket: wasteTicket,
    people: laborPeople,
    days: laborDaysN || (plannedCrew ? plannedCrew.days : workDays),
    charge: laborCharge,
    crew: plannedCrew ? plannedCrew.crew : 0,
    labor: laborTotal,
    material: materialTotal,
    waste: wasteTotal,
    equip: equipTotal,
    lifting: lifting ? lifting.cost : 0,
    floor: lifting ? lifting.floor : 0,
  };
  let sanity = marketSanity({
    trade,
    kind: demolitionKind,
    units: demolitionUnits,
    sizeValue: sizeVal,
    sizeUnit,
    notes,
    tons: wasteTons,
    people: laborPeople,
    days: laborDaysN,
    baseCost: baseDirectCost,
    cost: totalDirectCost,
    bufferRate,
    margin: safeMargin,
    price: Math.round(clientPrice * (1 - surchargeShare)),
    disabled: isBid ? 'bid' : '',
    locked: customPrice !== null || hasCalledPrice || bidLocked || quotedLabor !== null,
  });
  if (sanity.adjusted) {
    safeMargin = sanity.margin;
    bufferRate = sanity.bufferRate;
    costBuffer = Math.round((totalDirectCost * bufferRate) / 100);
    costWithBuffer = totalDirectCost + costBuffer;
    suggestedPrice = Math.round((baseDirectCost * (1 + bufferRate / 100)) / (1 - safeMargin / 100));
    if (minJob > 0 && suggestedPrice < minJob) suggestedPrice = minJob;
    baseClientPrice = customPrice !== null ? Math.max(customPrice, 0) : quotedLabor !== null ? quotedLabor : suggestedPrice;
    appClientPrice = bidLocked ? Math.max(0, bidPriceMan + adjustmentTotal) : Math.max(0, baseClientPrice + adjustmentTotal);
    clientPrice = calledPrice !== null ? calledPrice : appClientPrice;
    const compare = Math.round(clientPrice * (1 - surchargeShare));
    sanity = { ...sanity, price: compare, position: marketPosition(compare, sanity.band) };
  }

  const vatAmount = c?.includeVat ? Math.round(clientPrice * 0.1) : 0;
  const finalPrice = clientPrice + vatAmount;
  const netProfit = clientPrice - totalDirectCost;
  const marginPercent = clientPrice > 0 ? Math.round((netProfit / clientPrice) * 100) : 0;
  const isBelowBreakEven = netProfit <= 0;
  const netProfitBuffered = clientPrice - costWithBuffer;
  const marginBuffered = clientPrice > 0 ? Math.round((netProfitBuffered / clientPrice) * 100) : 0; // 보수적(예비비 포함) 마진

  // 수금 계획 (기본 계약금 30 / 중도 40 / 잔금 30)
  const planInput = c?.paymentPlan || {};
  const plan = {
    deposit: Number.isFinite(Number(planInput.deposit)) ? Number(planInput.deposit) : 30,
    mid: Number.isFinite(Number(planInput.mid)) ? Number(planInput.mid) : 40,
    balance: Number.isFinite(Number(planInput.balance)) ? Number(planInput.balance) : 30,
  };
  const planSum = plan.deposit + plan.mid + plan.balance;
  const depositAmount = Math.round((finalPrice * plan.deposit) / 100);
  const midAmount = Math.round((finalPrice * plan.mid) / 100);
  const balanceAmount = Math.max(0, Math.round(finalPrice - depositAmount - midAmount));
  const payments = {
    deposit: { ratio: plan.deposit, amount: depositAmount },
    mid: { ratio: plan.mid, amount: midAmount },
    balance: { ratio: plan.balance, amount: balanceAmount },
  };
  const paid = toNum(c?.paidAmount);
  const remaining = Math.max(0, finalPrice - paid);
  const balanceRatio = plan.balance;
  const remainingRatio = finalPrice > 0 ? Math.round((remaining / finalPrice) * 100) : 0;

  const missingInfos = [];
  const isPartialJob = trade === 'demolition' && !!partialOf(c).on;
  if (!c?.photos?.length) missingInfos.push('현장 사진');
  // 부분 철거는 품목·수량이 곧 규모다 — '공사 규모·층수'를 비었다고 보지 않는다
  if (!isPartialJob && (!sizeVal || sizeUnit === '모름')) missingInfos.push('공사 규모');
  if (!isPartialJob && !lifting.floor && !/\d+층/.test(notes)) missingInfos.push('층수·엘베');
  if (trade === 'unclassified') missingInfos.push('공종');

  // 공사일수 — 앞 단계(가견적·최종·시공·문서)가 모두 같은 하루를 쓰도록 최종값을 하나로 정한다.
  // 답사에서 일정이 늘거나 줄면(예: '하루 더 걸림 +1일') 그만큼 반영한다.
  const baseWorkDays = workDays > 0 ? workDays : estimateWorkDays(c, { trade });
  workDays = Math.max(0.5, Math.round((baseWorkDays + adjustDays) * 10) / 10);

  // 인원 × 일수 추천 — 철거는 위에서 계산했고, 나머지 공종은 실제 투입 인원이 정해져 있다
  if (!plannedCrew) {
    const team = { wallpaper: 2, bathroom: 2, kitchen: 2, tilewaterproof: 2, plaster: 2, window: 2, combined: 3, carpentry: 1, electric: 1, plumbing: 1, film: 1, repair: 1, waste: 1, labor: 1, groundwork: 2 }[trade] || 1;
    plannedCrew = {
      crew: team,
      days: workDays,
      why: team > 1 ? `${TRADES[trade]?.short || '시공'}은 ${team}명이 나눠 맡는 게 원가 최소` : `1명이 ${workDays}일 처리`,
    };
  } else if (plannedCrew.days !== workDays) {
    // 답사에서 일정이 늘었으면 추천 일수도 같이 맞춘다 (한 화면에 4일·5일이 섞이면 안 된다)
    plannedCrew = {
      ...plannedCrew,
      days: workDays,
      why: adjustDays > 0 ? `답사에서 일정이 늘어 ${plannedCrew.crew}명 × ${workDays}일로 잡았습니다` : plannedCrew.why,
    };
  }

  return {
    trade,
    tradeLabel,
    targetSummary,
    clientSummary: clientSafeText(targetSummary),
    interiorStyle,
    materialSet: mset,
    items: markedItems,
    excludedIds,
    excludedAmount,
    baseLabor,
    baseMaterial,
    laborTotal,
    materialTotal,
    axisTotals,
    ledgerLines: ledger.lines,
    wasteTotal,
    equipTotal,
    surchargeTotal,
    surchargeExtra,
    // 견적서 '폐기물 ○대' 표기용 — 화면·문서가 같은 대수를 쓰게 한다
    wasteTrucks: (() => {
      const w = markedItems.find((i) => /폐기물/.test(i.category || '') && !i.excluded && Number(i.amount) > 0);
      const m = w && String(w.name || '').match(/(\d+)\s*대/);
      return m ? Number(m[1]) : Math.max(1, parseInt(c?.waste?.trucks, 10) || 1);
    })(),
    detailSurcharge: detail,
    lifting,
    crew,
    crewCosts: crew,
    totalDirectCost,
    bufferRate,
    costBuffer,
    costWithBuffer,
    netProfitBuffered,
    marginBuffered,
    marginTarget: safeMargin,
    suggestedPrice,
    baseClientPrice,
    appClientPrice,
    calledPrice,
    hasCalledPrice,
    adjustmentTotal,
    adjustTotal,
    adjustDays,
    crewPlan: plannedCrew,
    changeLogs,
    clientPrice,
    customPrice,
    vatAmount,
    finalPrice,
    netProfit,
    marginPercent,
    isBelowBreakEven,
    // 예상 범위: 최소(인건비·단순 공정) ~ 기준 ~ 최대(폐기물·양중·자재 추가)
    // 공고는 낙찰금액이 정해져 있다 — 범위를 벌리지 않고 수주금액 기준으로만 보여 준다.
    rangeMin: bidLocked
      ? Math.max(0, Math.round(bidPriceMan + adjustmentTotal))
      : Math.round(
          calledPrice !== null
            ? calledPrice * 0.95
            : (customPrice !== null ? baseClientPrice * 0.95 : rangePriceFromCost(costWithBuffer * 0.96)) + adjustmentTotal
        ),
    rangeMax: bidLocked
      ? Math.max(0, Math.round(bidPriceMan + adjustmentTotal))
      : Math.round(
          calledPrice !== null
            ? calledPrice * 1.12
            : (customPrice !== null ? baseClientPrice * 1.12 : rangePriceFromCost(costWithBuffer * 1.18)) + adjustmentTotal
        ),
    rangeBase: clientPrice,
    minimumDefense: Math.round(costWithBuffer * 1.05),
    minApplied,
    minJob,
    plan,
    planSum,
    payments,
    paid,
    remaining,
    balanceRatio,
    remainingRatio,
    missingInfos,
    isBid,
    bidNote,
    bidPriceMan,
    bidCostFloor,
    isUncertain: missingInfos.length >= 2,
    displayTotal: finalPrice,
    // '보통 시세 안내' — 범위·현재 위치·왜 이 금액인지까지 화면이 그대로 읽는다
    sanity: {
      ...sanity,
      fullPrice: clientPrice,
      surchargeShare,
      cost: totalDirectCost,
      margin: marginPercent,
      why: marketWhy({ ...sanity, cost: totalDirectCost, margin: marginPercent, fullPrice: clientPrice, parts: sanityParts }),
    },
    marketBand: sanity.band,
    workDays,
  };
}

// 카드/현황판용 짧은 요약
export function caseSummary(c) {
  const calc = computeEstimate(c);
  return {
    price: calc.finalPrice,
    cost: calc.totalDirectCost,
    costWithBuffer: calc.costWithBuffer,
    profit: calc.netProfit,
    profitBuffered: calc.netProfitBuffered,
    margin: calc.marginPercent,
    marginBuffered: calc.marginBuffered,
    bufferRate: calc.bufferRate,
    below: calc.isBelowBreakEven,
  };
}
