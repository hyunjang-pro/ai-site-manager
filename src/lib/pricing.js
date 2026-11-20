// 견적 엔진 — 경북 철거·인테리어 실무 단가 (단위: 만원)
// 검증된 4개 기준 견적(15평 철거 374 / 24평 도배·장판 324 / 욕실 1칸 454 / 주방 3.2m 325)의
// 원가 구조와 "고객가 = 원가 ÷ (1 − 마진율)" 공식을 그대로 모듈화했다.
import { TRADES, HARD_DETAILS } from './constants.js';
import { ratesOf, getRate } from './rates.js';
import { wasteVehicle } from './waste.js';
import { materialSetFor } from './materials.js';
import { detailRowsFor, detailTotals } from './details.js';

export const MAN = 10000; // 원 → 만원

// 2026 실견적 보정 자재·공정 단가 (work/real-interior-quotes-2026.md 5-1·5-2)
export const MATERIAL_RATES = {
  wallpaper: { silkRoll: 4.5, paperRoll: 4.2, floor18: 1.1, floor22: 1.5 },
  bathroom: { tilePer: 120, fixturePer: 50, waterproofPer: 20, demolition: 80, ubrExtra: 90, laborDays: 3, wastePer: 20, overlayWaste: 5 },
  kitchen: { sinkPerM: 60, topPerM: 16, waste: 45, laborDays: 3 },
  tile: { materialPer: 3.2, installPer: 4.5, waterproofPer: 3.4, demolitionPer: 2.2, minimum: 45 },
  window: { perSqm: 28, matPerSqm: 24, perDay: 8, removal: 8, waste: 15, minimum: 35 },
  repair: { perSpot: 12, materialPer: 5, minimum: 15 },
  plaster: { mortarPer: 2.8, materialPer: 1.2, heatingPer: 2.5, minimum: 30, perDay: 9.6 },
  waste: { defaultTons: 1.5 },
  // 2026 실무 단가 — 노무는 '직종 일당 × 작업일수(하루 처리량 기준)'로 계산한다
  carpentry: { perM: 9, matPer: 4, perDay: 6, minimum: 25 },
  electric: { trip: 15, perPoint: 8, matPer: 3.2, perDay: 6, minimum: 25 },
  plumbing: { trip: 15, perPoint: 12, matPer: 4.2, perDay: 3.5, minimum: 30 },
  film: { perSqm: 2.2, matPer: 1.2, perDay: 28, minimum: 25 },
  groundwork: { perSqm: 4.5, equipRate: 0.25, minimum: 50 },
};

// 직종 일당 × 작업일수. '하루 처리량(perDay)'은 지금 단가 수준이 그대로 유지되게 잡은 값이다.
function crewLabor(rates, role, fallbackRate, quantity, perDay, minDays = 0.5) {
  const rate = getRate(rates, ['labor', role], fallbackRate);
  const days = Math.max(minDays, Math.min(30, Math.round((quantity / Math.max(0.1, perDay)) * 10) / 10));
  return { rate, days, cost: Math.round(days * rate) };
}

const TILE_ADD = { material: MATERIAL_RATES.tile.materialPer, install: MATERIAL_RATES.tile.installPer };

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

function surveyOn(c, id) {
  return !!(c?.survey && c.survey[id]);
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

// 양중·반출 4문항 → 옵션별 실비 (만원)
export function computeLifting(c, ratesIn) {
  const rates = ratesIn || ratesOf(c);
  const lift = c?.lifting || {};
  const floor = Math.max(0, parseInt(lift.floor, 10) || 0);
  const elevator = lift.elevator === 'yes' ? 'yes' : lift.elevator === 'no' ? 'no' : 'unknown';
  const ladderAllowed = lift.ladderAllowed === 'yes' ? 'yes' : lift.ladderAllowed === 'no' ? 'no' : 'unknown';
  const carryM = Math.max(0, parseInt(lift.carryDistance, 10) || 0);
  const pyung = toPyung(c?.sizeValue, c?.sizeUnit, 15);
  const tons = Math.max(0.5, +(pyung * 0.09).toFixed(1)); // 25평 ≈ 2.2톤

  const manual = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  // 인력 반출 = 인부 수 × 인건비(설정 일당) + 트럭 대수 × 1톤차 실비 (5만원 고정값 없음)
  const wage = getRate(rates, ['labor', 'helper'], 19);
  const truckUnit = getRate(rates, ['waste', 'truck1'], 42.5);
  const carryPeople = Math.max(1, parseInt(lift.carryPeople, 10) || Math.max(1, Math.ceil((floor || 2) / 2)));
  const truckCount = Math.max(1, parseInt(lift.truckCount, 10) || Math.max(1, Math.ceil(tons / 1.5)));
  const carryComputed = Math.round(carryPeople * wage + truckCount * truckUnit);
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
  if (elevator !== 'yes') {
    options.push({
      id: 'carry',
      label: `인력 반출 (인부 ${carryPeople}명 · 1톤차 ${truckCount}대)`,
      cost: carryCost,
      detail: `인부 ${carryPeople}명 × ${wage}만 + 1톤차 ${truckCount}대 × ${truckUnit}만 = ${carryCost}만`,
      editable: 'carry',
    });
    if (ladderAllowed !== 'no') {
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

  const chosenId = lift.mode || (options[0] ? options[0].id : 'none');
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
  const trade = getTrade(c);
  const info = TRADES[trade];
  const notes = `${c?.title || ''} ${c?.notes || ''} ${c?.location || ''} ${c?.supplement || ''}`.toLowerCase();
  const sizeVal = toNum(c?.sizeValue);
  const sizeUnit = c?.sizeUnit || info.defaultUnit;
  const rates = ratesOf(c); // 이 현장을 만들 때의 단가표(스냅샷)
  const items = [];

  let laborTotal = 0;
  let materialTotal = 0;
  let wasteTotal = 0;
  let equipTotal = 0;
  let crewDays = 0; // 총 연인원(명·일) — 교통비·식비를 여기에 곱한다
  let targetSummary = '';

  if (trade === 'demolition') {
    const pyung = toPyung(sizeVal, sizeUnit, 15);
    const scope = c?.demolition?.scope === 'partial' ? 'partial' : 'restore';
    // 순수 철거는 평/8, 원상복구(천장·벽체·바닥 마감까지)는 평/6 — 실견적 33평 2일에 맞춘 값
    const days = Math.max(1, Math.min(12, Math.ceil(pyung / (scope === 'restore' ? 6 : 8))));
    const skilled = getRate(rates, ['labor', 'demolition'], 25);
    const helper = getRate(rates, ['labor', 'helper'], 17);
    const helperCount = pyung >= 12 ? 2 : 1;
    const perDay = skilled + helper * helperCount;
    const laborCost = days * perDay;
    crewDays += days * (1 + helperCount);
    const defaultTrucks = Math.max(1, Math.round(pyung / 5));
    const truckCount = Math.max(1, parseInt(c?.waste?.trucks, 10) || defaultTrucks);
    const heavy = c?.waste?.heavy === true;
    const truckUnit = heavy ? getRate(rates, ['waste', 'truckHeavy'], 50) : getRate(rates, ['waste', 'truckMixed'], 33);
    const wasteCost = truckCount * truckUnit;
    const grapple = /집게차/.test(notes) || pyung >= 10 ? getRate(rates, ['waste', 'grapple'], 30) : 0;
    const consumables = Math.min(10, Math.max(5, Math.round(pyung * 0.53)));
    laborTotal += laborCost;
    wasteTotal += wasteCost;
    equipTotal += grapple + consumables;

    targetSummary =
      `${pyung}평 ${scope === 'restore' ? '철거 + 원상복구(천장·벽체·바닥)' : '순수 철거(마감 제외)'} · 약 ${days}일 공정`;
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
        name: `${heavy ? '중량' : '혼합·목재'} 폐기물 (${truckCount}대)`,
        detail: `${truckCount}대 × ${truckUnit}만`,
        amount: wasteCost,
      }
    );
    if (grapple > 0) items.push({ id: 'grapple', category: '장비', name: '집게차 상차·운반', detail: '1회 출동 기준', amount: grapple });
    items.push({ id: 'consumables', category: '장비', name: '철거 소모품', detail: '마대·보양·커터날 등', amount: consumables });

  } else if (trade === 'wallpaper') {
    const pyung = toPyung(sizeVal, sizeUnit, 24);
    const silk = /실크/.test(notes);
    const wallPyung = +(pyung * 2.3).toFixed(1);
    const rollUnit = silk ? MATERIAL_RATES.wallpaper.silkRoll : MATERIAL_RATES.wallpaper.paperRoll;
    const rolls = Math.ceil((wallPyung / 5) * 1.15); // 손실 15% 포함 (실견적 A)
    const wallCost = Math.round(rolls * rollUnit);
    const floorSqm = Math.round(pyung * 2.3);
    const is22 = /2\.2|2\.2t|2\.2mm/.test(notes);
    const floorUnit = is22 ? MATERIAL_RATES.wallpaper.floor22 : MATERIAL_RATES.wallpaper.floor18;
    const floorCost = Math.round(floorSqm * floorUnit);
    const subMat = Math.min(14, Math.max(8, Math.round(pyung * 0.42)));
    // 도배공 하루 30평 안팎 · 장판공 반나절~하루 — 둘을 나눠 각 직종 일당으로 계산한다
    const wallDays = pyung >= 30 ? 2 : 1.5;
    const floorDays = pyung >= 30 ? 1 : 0.5;
    const wallRate = getRate(rates, ['labor', 'wallpaper'], 30);
    const floorRate = getRate(rates, ['labor', 'floor'], 28);
    const laborDays = +(wallDays + floorDays).toFixed(1);
    const laborCost = Math.round(wallDays * wallRate + floorDays * floorRate);
    crewDays += laborDays;

    materialTotal += wallCost + floorCost + subMat;
    laborTotal += laborCost;

    targetSummary = `${pyung}평 ${silk ? '실크' : '합지'} 도배(벽 ${wallPyung}평/${rolls}롤) + ${is22 ? '2.2T' : '1.8T'} 장판(${floorSqm}㎡)`;
    items.push(
      { id: 'wallpaper', category: '자재', name: `${silk ? '실크' : '합지'} 벽지 (${rolls}롤)`, detail: `벽 ${wallPyung}평 ÷ 5평/롤 × 1.15(손실) × ${rollUnit}만`, amount: wallCost },
      { id: 'floor', category: '자재', name: `${is22 ? '2.2T' : '1.8T'} 장판 (${floorSqm}㎡)`, detail: `${pyung}평 × 2.3 = ${floorSqm}㎡ × ${floorUnit}만`, amount: floorCost },
      { id: 'submat', category: '자재', name: '도배·장판 부자재', detail: '친환경 풀·초배지·장판본드·실리콘', amount: subMat },
      { id: 'labor', category: '노무', name: `도배·장판 노무 (${laborDays}일)`, detail: `도배 ${wallDays}일 × ${wallRate}만 + 장판·마루 ${floorDays}일 × ${floorRate}만`, amount: laborCost }
    );
  } else if (trade === 'bathroom') {
    const kans = sizeUnit === '칸' && sizeVal > 0 ? sizeVal : 1;
    const is600 = /600각|포세린/.test(notes);
    const american = /아메리칸/.test(notes);
    const method = c?.tileRemain ? 'overlay' : ['full', 'overlay', 'ubr'].includes(c?.bathroom?.method) ? c.bathroom.method : 'full';
    const B = MATERIAL_RATES.bathroom;
    const demolitionPer = method === 'full' ? B.demolition : method === 'ubr' ? B.demolition + B.ubrExtra : 0;
    const waterproofPer = method === 'overlay' ? 0 : B.waterproofPer;
    const wastePer = method === 'overlay' ? B.overlayWaste : method === 'ubr' ? 25 : B.wastePer;
    const laborDays = B.laborDays;
    const laborCost = Math.round(laborDays * getRate(rates, ['labor', 'bathroom'], 35) * kans);
    crewDays += laborDays * kans;

    materialTotal += Math.round((B.tilePer + B.fixturePer + waterproofPer + demolitionPer) * kans);
    laborTotal += laborCost;
    wasteTotal += Math.round(wastePer * kans);

    const methodLabel = method === 'overlay' ? '덧방' : method === 'ubr' ? 'UBR 조립식 철거' : '전체 철거';
    targetSummary = `욕실 ${kans}칸(약 ${(kans * 1.8).toFixed(1)}평) ${methodLabel} 후 ${is600 ? '600각 포세린' : '300×600 국산타일'} + ${american ? '아메리칸스탠다드' : '국산 도기·수전'} 교체`;
    items.push(
      { id: 'demolition', category: '노무', name: `${methodLabel} 및 폐기`, detail: method === 'overlay' ? '덧방은 철거·방수 제외' : `${demolitionPer}만/칸`, amount: Math.round(demolitionPer * kans) },
      { id: 'waterproof', category: '자재', name: '방수(액체 2회 + 물 채움 테스트)', detail: waterproofPer ? `${waterproofPer}만/개소` : '덧방은 방수 생략', amount: Math.round(waterproofPer * kans) },
      { id: 'tile', category: '자재', name: `${is600 ? '600각 포세린' : '300×600 국산'} 타일`, detail: `벽+바닥 × ${B.tilePer}만/칸 (자재+시공 분리)`, amount: Math.round(B.tilePer * kans) },
      { id: 'fixture', category: '자재', name: `${american ? '아메리칸스탠다드' : '국산'} 도기·수전`, detail: `양변기·세면대·수전·장 (${B.fixturePer}만/칸)`, amount: Math.round(B.fixturePer * kans) },
      { id: 'labor', category: '노무', name: `타일공 ${laborDays * kans}일`, detail: `타일공 2품 기준 (${laborDays}일 × ${getRate(rates, ['labor', 'bathroom'], 35)}만)`, amount: laborCost },
      { id: 'waste', category: '폐기물', name: '욕실 폐기물 반출', detail: `타일·도기 수거 (${wastePer}만/칸)`, amount: Math.round(wastePer * kans) }
    );
  } else if (trade === 'kitchen') {
    const meters = sizeUnit === 'm' && sizeVal > 0 ? sizeVal : 3.2;
    const K = MATERIAL_RATES.kitchen;
    const sink = Math.round(meters * K.sinkPerM);
    const top = Math.round(meters * K.topPerM);
    const laborCost = K.laborDays * getRate(rates, ['labor', 'kitchen'], 30);
    crewDays += K.laborDays;
    materialTotal += sink + top;
    wasteTotal += K.waste;
    laborTotal += laborCost;

    targetSummary = `주방 ${meters}m 기본형 싱크대(상·하부장) + 인조대리석 상판 교체 및 철거`;
    items.push(
      { id: 'sink', category: '자재', name: `기본형 싱크대 (${meters}m)`, detail: `${meters}m × ${K.sinkPerM}만/m (상·하부장)`, amount: sink },
      { id: 'top', category: '자재', name: `인조대리석 상판 (${meters}m)`, detail: `${meters}m × ${K.topPerM}만/m`, amount: top },
      { id: 'waste', category: '폐기물', name: '기존 싱크대 철거·반출', detail: '해체 및 폐기물 처리 (실견적 45만)', amount: K.waste },
      { id: 'labor', category: '노무', name: `주방 노무 (${K.laborDays}일)`, detail: `철거·설비·설치 기공 ${K.laborDays}일 × ${getRate(rates, ['labor', 'kitchen'], 30)}만`, amount: laborCost }
    );
  } else if (trade === 'waste') {
    // 차량 1탭 선택(반차·1톤 1차·2.5톤)이 톤수·차량비를 정한다. 생활폐기물 '한차'는 1톤 1차.
    const vehicle = wasteVehicle(c);
    const tons = vehicle.tons;
    const perTon = getRate(rates, ['waste', 'perTon'], 32);
    const loadDays = tons >= 5 ? 2 : 1;
    const loadingRate = getRate(rates, ['waste', 'loading'], 19);
    const loading = Math.round(loadingRate * loadDays);
    crewDays += loadDays;
    const truck = getRate(rates, ['waste', vehicle.rateKey], vehicle.rate);
    const ticket = getRate(rates, ['waste', 'ticket'], 3);
    const disposal = Math.round(tons * perTon);

    wasteTotal += truck + disposal;
    laborTotal += loading;
    equipTotal += ticket;
    targetSummary = `폐기물 약 ${tons}톤 수거·상차·운반·처리 (${vehicle.label} ${Math.round(truck)}만 · 톤당 ${perTon}만)`;
    items.push(
      { id: 'waste_disposal', category: '폐기물', name: `폐기물 중간처리 (${tons}톤)`, detail: `${tons}톤 × ${perTon}만 (2026 성상별 단가 기준)`, amount: disposal },
      { id: 'waste_truck', category: '폐기물', name: `${vehicle.label} 수집·운반 차량 1대`, detail: '상차 2시간 포함, 처리장 운반', amount: Math.round(truck) },
      { id: 'labor', category: '노무', name: `상차·분리 인부 (${loadDays}일)`, detail: `1명 × ${loadDays}일 × ${loadingRate}만`, amount: loading },
      { id: 'ticket', category: '장비', name: '처리확인서·올바로 등록', detail: '행정 처리', amount: Math.round(ticket) }
    );
  } else if (trade === 'labor') {
    const people = sizeUnit === '명' && sizeVal > 0 ? sizeVal : Math.max(1, parseInt(sizeVal, 10) || 1);
    const days = Math.max(1, parseInt(c?.laborDays, 10) || 1);
    const charge = getRate(rates, ['laborSupply', 'charge'], 26);
    const cost = getRate(rates, ['laborSupply', 'cost'], 19);
    const insurance = Math.round(getRate(rates, ['laborSupply', 'insurance'], 2) * people * days);
    const wageCost = Math.round(people * days * cost);
    crewDays += people * days;

    laborTotal += wageCost + insurance;
    targetSummary = `일용 인력 ${people}명 × ${days}일 지원 (청구 ${charge}만/일 · 원가 ${cost}만/일 + 보험 ${insurance}만)`;
    items.push(
      { id: 'labor', category: '노무', name: `인력 ${people}명 × ${days}일`, detail: `${cost}만/일 기준 (일당·식대)`, amount: wageCost },
      { id: 'insurance', category: '추가(규제)', name: '4대보험·안전관리', detail: `${people}명 × ${days}일`, amount: insurance }
    );
  } else if (trade === 'tilewaterproof') {
    const T = MATERIAL_RATES.tile;
    const area = sizeUnit === '㎡' ? Math.max(1, sizeVal) : Math.max(1, +(toPyung(sizeVal, sizeUnit, 4) * 3.3).toFixed(1));
    const mode = ['waterproof', 'tile', 'both'].includes(c?.tileWork?.mode) ? c.tileWork.mode : 'both';
    const tileArea = mode === 'waterproof' ? 0 : area;
    const wpArea = mode === 'waterproof' || mode === 'both' ? area : 0;
    const remainTile = !!c?.tileRemain;
    const demo = mode === 'both' && !remainTile ? Math.round(area * T.demolitionPer) : 0;
    const tileMaterial = Math.round(tileArea * T.materialPer);
    const tileLabor = Math.round(tileArea * T.installPer);
    const waterproof = Math.round(wpArea * T.waterproofPer);
    const wasteCost = remainTile ? 8 : Math.max(15, Math.round(area * 1.4));
    crewDays +=
      (tileArea ? Math.max(0.5, Math.round((tileArea / 7) * 10) / 10) : 0) +
      (wpArea ? Math.max(0.2, Math.round((wpArea / 35) * 10) / 10) : 0);

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
    wasteTotal += Math.max(12, Math.round(area * 0.9));
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
    items.push({ id: 'waste', category: '폐기물', name: '폐기물·잔재 반출', detail: '몰탈 잔재·포대', amount: Math.max(12, Math.round(area * 0.9)) });
    if (mortar + material + heating + tileAdd < P.minimum) {
      const gap = Math.round(P.minimum - (mortar + material + heating + tileAdd));
      items.push({ id: 'min_floor', category: '추가(현장)', name: '최소 출동비', detail: '자재 하차·양생', amount: gap });
      laborTotal += gap;
    }
  } else if (trade === 'window') {
    const W = MATERIAL_RATES.window;
    const area = sizeUnit === '㎡' ? Math.max(1, sizeVal) : Math.max(1, +(toPyung(sizeVal, sizeUnit, 4) * 3.3).toFixed(1));
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
    const isPaint = /페인트|도장|탄성/.test(notes);
    const isCaulk = /실리콘|코킹/.test(notes);
    const repairRole = isPaint ? 'painter' : isCaulk ? 'caulking' : 'repair';
    const repairLabel = isPaint ? '페인트·탄성공' : isCaulk ? '코킹·실리콘공' : '수선·보수 기공';
    const repairRate = getRate(rates, ['labor', repairRole], isPaint ? 26 : isCaulk ? 25 : 28);
    const repairDays = Math.max(0.5, Math.round(spots * 0.5 * 10) / 10);
    const laborCost = Math.round(repairDays * repairRate);
    const matCost = Math.round(spots * R.materialPer);
    crewDays += repairDays;
    laborTotal += laborCost;
    materialTotal += matCost;
    targetSummary = `부분 수선 ${spots}개소 (${repairLabel} ${repairDays}일 × ${repairRate}만 + 자재 ${R.materialPer}만/개소)`;
    items.push(
      { id: 'labor', category: '노무', name: `수선 인력 (${spots}개소)`, detail: `${repairLabel} ${repairDays}일 × ${repairRate}만`, amount: laborCost },
      { id: 'mat', category: '자재', name: '수선 자재·부자재', detail: `${spots}개소 × ${R.materialPer}만`, amount: matCost }
    );
    if (laborCost + matCost < R.minimum) {
      const gap = Math.round(R.minimum - (laborCost + matCost));
      items.push({ id: 'min_floor', category: '추가(현장)', name: '최소 출동비', detail: '이동·공구·마감', amount: gap });
      laborTotal += gap;
    }
  } else if (trade === 'carpentry') {
    const C = MATERIAL_RATES.carpentry;
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
    targetSummary = `목공 ${meters}m (문·문틀·몰딩·가구·데크) · 목수 ${carpenterCrew.days}일`;
    items.push(
      { id: 'labor', category: '노무', name: `목공 인건비 (${meters}m)`, detail: `목수 ${carpenterCrew.days}일 × ${carpenterCrew.rate}만 (하루 ${C.perDay}m)`, amount: laborCost },
      { id: 'mat', category: '자재', name: `목재·부자재 (${meters}m)`, detail: `MDF·각재·경첩·몰딩·도장 (m당 ${C.matPer}만)`, amount: matCost }
    );
    if (laborCost + matCost < C.minimum) {
      const gap = Math.round(C.minimum - (laborCost + matCost));
      items.push({ id: 'min_floor', category: '추가(현장)', name: '최소 출동비', detail: '이동·공구·마감', amount: gap });
      laborTotal += gap;
    }
  } else if (trade === 'electric') {
    const E = MATERIAL_RATES.electric;
    const points = Math.max(1, sizeVal || 1);
    const electricCrew = crewLabor(rates, 'electrician', 28, points, E.perDay);
    const laborCost = electricCrew.cost + E.trip;
    const matCost = Math.round(points * E.matPer);
    crewDays += electricCrew.days;
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
    const area = sizeUnit === '㎡' ? Math.max(1, sizeVal) : Math.max(1, +(toPyung(sizeVal, sizeUnit, 3) * 3.3).toFixed(1));
    const filmCrew = crewLabor(rates, 'film', 28, area, F.perDay);
    const laborCost = filmCrew.cost;
    const matCost = Math.round(area * F.matPer);
    crewDays += filmCrew.days;
    laborTotal += laborCost;
    materialTotal += matCost;
    targetSummary = `필름·시트지 ${area}㎡ (필름공 ${filmCrew.days}일 × ${filmCrew.rate}만)`;
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
    const area = sizeUnit === '㎡' ? Math.max(1, sizeVal) : Math.max(1, +(toPyung(sizeVal, sizeUnit, 10) * 3.3).toFixed(1));
    const base = Math.max(G.minimum, Math.round(area * G.perSqm));
    crewDays += Math.max(1, Math.round((area / 30) * 10) / 10);
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

    if (scopes.includes('demolition')) {
      const demoDays = Math.max(1, Math.ceil(pyung / 8));
      const skilled = getRate(rates, ['labor', 'demolition'], 27);
      const helperRate = getRate(rates, ['labor', 'helper'], 19);
      const cost = Math.round(demoDays * (skilled + helperRate));
      crewDays += demoDays * 2;
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
      const floorSqm = Math.round(pyung * 2.3);
      const floorCost = Math.round(floorSqm * S.wallpaper.floor18);
      const subMat = Math.min(14, Math.max(8, Math.round(pyung * 0.42)));
      const laborCost = 2 * getRate(rates, ['labor', 'wallpaper'], 30);
      crewDays += 2;
      materialTotal += wallCost + floorCost + subMat;
      laborTotal += laborCost;
      items.push(
        { id: 'wallpaper', category: '자재', name: `합지 벽지 (${rolls}롤)`, detail: `벽 ${wallPyung}평`, amount: wallCost },
        { id: 'floor', category: '자재', name: `1.8T 장판 (${floorSqm}㎡)`, detail: `${pyung}평 기준`, amount: floorCost },
        { id: 'submat', category: '자재', name: '도배·장판 부자재', detail: '풀·초배지·본드', amount: subMat },
        { id: 'labor_wall', category: '노무', name: '도배·장판 노무 (2일)', detail: '기공+보조', amount: laborCost }
      );
      scopeNames.push('도배·장판');
    }
    if (scopes.includes('bathroom')) {
      const B = S.bathroom;
      const laborCost = Math.round(B.laborDays * getRate(rates, ['labor', 'bathroom'], 37));
      crewDays += B.laborDays;
      const mat = B.demolition + B.waterproofPer + B.tilePer + B.fixturePer;
      materialTotal += mat;
      laborTotal += laborCost;
      wasteTotal += B.wastePer;
      items.push(
        { id: 'bath_mat', category: '자재', name: '욕실 1칸 철거·방수·타일·도기', detail: '철거 80 + 방수 20 + 타일 120 + 도기 50', amount: mat },
        { id: 'bath_labor', category: '노무', name: `욕실 타일공 (${B.laborDays}일)`, detail: '1칸 기준', amount: laborCost },
        { id: 'bath_waste', category: '폐기물', name: '욕실 폐기물 반출', detail: '타일·도기', amount: B.wastePer }
      );
      scopeNames.push('욕실 1칸');
    }
    if (scopes.includes('kitchen')) {
      const K = S.kitchen;
      const sink = Math.round(3.2 * K.sinkPerM);
      const top = Math.round(3.2 * K.topPerM);
      const laborCost = K.laborDays * getRate(rates, ['labor', 'kitchen'], 32);
      crewDays += K.laborDays;
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
      laborTotal += laborPart;
      materialTotal += cost - laborPart;
      items.push({ id: 'entrance', category: '자재', name: '현관 중문·신발장·현관 타일', detail: '중문 1 + 신발장 + 타일', amount: cost });
      scopeNames.push('현관');
    }
    if (scopes.includes('plaster')) {
      const area = Math.max(1, +(pyung * 3.3).toFixed(1));
      const combinedPlaster = crewLabor(rates, 'plasterer', 27, area, S.plaster.perDay);
      const mortar = combinedPlaster.cost;
      const mat = Math.round(area * S.plaster.materialPer);
      crewDays += combinedPlaster.days;
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
    targetSummary = `${pyung}평 복합 인테리어 — ${scopeNames.join(' + ') || '범위 확인 필요'}${excludedText}`;
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
      const pyung = toPyung(sizeVal, sizeUnit, 15);
      const laborCost = Math.round(50 + pyung * 6);
      crewDays += Math.max(1, Math.round((pyung / 8) * 10) / 10);
      const matCost = Math.round(60 + pyung * 8);
      laborTotal += laborCost;
      materialTotal += matCost;
      wasteTotal += 33;
      targetSummary =
        trade === 'combined'
          ? `${pyung}평 복합 인테리어(철거+도배+부분 욕실)`
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
  const addSurcharge = (id, category, name, detail, amount) => {
    if (!amount) return;
    surchargeTotal += amount;
    items.push({ id, category, name, detail, amount, isSurcharge: true });
  };

  const lifting = computeLifting(c, rates);
  if (lifting.cost > 0) {
    addSurcharge('lift', '추가(운반)', `자재·폐기물 운반 — ${lifting.chosen.label}`, lifting.chosen.detail, lifting.cost);
    laborTotal += lifting.cost;
  }

  if (surveyOn(c, 'longCarry') && lifting.carryM < 30) addSurcharge('longCarry', '추가(운반)', '운반거리 30m 이상', '잡부 반일 추가', 8);
  if (surveyOn(c, 'noParking')) addSurcharge('noParking', '추가(운반)', '차량 진입·주차 곤란', '반출 대기·추가 운반', 5);
  if (surveyOn(c, 'narrowDoor')) addSurcharge('narrowDoor', '추가(운반)', '출입문·복도 협소', '소형 운반·분해 반입', 5);
  if (surveyOn(c, 'floorHeatingPipe')) { addSurcharge('heating', '추가(구조)', '난방배관 매설 대비', '저속 파쇄·보수 예비비', 35); laborTotal += 35; }
  if (surveyOn(c, 'existingLeak')) { addSurcharge('leak', '추가(구조)', '기존 누수 보수·방수', '보강 시공비', 30); laborTotal += 30; }
  if (surveyOn(c, 'oldPlumbing')) { addSurcharge('plumbing', '추가(구조)', '노후 급배수관 정리', '배관 교체·압력 테스트', 25); materialTotal += 25; }
  if (surveyOn(c, 'loadBearingWall')) addSurcharge('loadBearing', '추가(구조)', '내력벽 철거 구조검토', '구조기술사 검토·보강(없으면 착공 금지)', 30);
  if (surveyOn(c, 'asbestosRisk')) addSurcharge('asbestos', '추가(규제)', '석면 사전조사 착수비', '시료 분석·조사기관 수수료', 30);
  if (surveyOn(c, 'workTimeLimit')) { addSurcharge('worktime', '추가(규제)', '작업시간 제한', '공사 기간이 늘어난 인건비', 20); laborTotal += 20; }
  // 혼합 폐기물 — 성상 분리를 안 하면 처리비가 3~6배가 된다. 현장 확인 후 체크하는 항목.
  if (surveyOn(c, 'wasteMixed')) {
    // 체크한 항목은 현장마다 금액을 직접 고칠 수 있다(0원 = 서비스·직접 처리).
    const mixed = surveyAmount(c, 'wasteMixed', Math.max(15, Math.round(wasteTotal * 0.35)));
    addSurcharge('mixedWaste', '추가(폐기물)', '혼합 폐기물 분리·추가 처리', '성상 분리 인력 + 혼합 처리 단가', mixed);
    wasteTotal += mixed;
  }
  if (surveyOn(c, 'adminDeposit')) {
    const admin = surveyAmount(c, 'adminDeposit', getRate(rates, ['site', 'adminReport'], 8));
    addSurcharge('deposit', '추가(규제)', '관리사무소 신고·동의서', '동의서 작성·대행', admin);
  }
  if (surveyOn(c, 'powerWaterCut')) addSurcharge('cut', '추가(규제)', '단전·단수 조치', '차단·마감', 5);
  if (surveyOn(c, 'gasFirePermit')) addSurcharge('gas', '추가(규제)', '가스·소방 작업허가', '허가·보양', 10);
  if (surveyOn(c, 'residential')) {
    const live = surveyAmount(c, 'residential', 12);
    addSurcharge('residential', '추가(현장)', '거주 중 시공 보양', '가구 이동·먼지막이·매일 청소', live);
    laborTotal += live;
  }
  if (surveyOn(c, 'protectLevel')) {
    const spots = Math.max(1, parseInt(c?.protectSpots, 10) || 1);
    const protect = surveyAmount(c, 'protectLevel', getRate(rates, ['site', 'protect'], 8) * spots);
    addSurcharge('protect', '추가(현장)', '보양(엘베·복도·현관)', `${spots}곳 기준 (아래에서 금액 수정)`, protect);
    materialTotal += protect;
  }
  if (surveyOn(c, 'materialLift')) {
    const liftCost = surveyAmount(c, 'materialLift', getRate(rates, ['site', 'materialLift'], 15));
    addSurcharge('materialLift', '추가(운반)', '자재 올리기', '자재를 층까지 올리는 인력', liftCost);
    laborTotal += liftCost;
  }
  if (surveyOn(c, 'ladderSmall')) {
    const small = surveyAmount(c, 'ladderSmall', getRate(rates, ['ladder', 'small'], 12));
    addSurcharge('ladderSmall', '추가(운반)', '사다리차 소형 1회', '4층 규모 자재·폐기물 반출', small);
    equipTotal += small;
  }
  if (surveyOn(c, 'ladderHalf')) {
    const halfDay = surveyAmount(c, 'ladderHalf', getRate(rates, ['ladder', 'half'], 35));
    addSurcharge('ladderHalf', '추가(운반)', '사다리차 반나절', '자재·폐기물 반출', halfDay);
    equipTotal += halfDay;
  }
  if (surveyOn(c, 'afterCare')) {
    const pyungForClean = toPyung(c?.sizeValue, c?.sizeUnit, 15);
    const cleanPeople = Math.max(1, Math.ceil(pyungForClean / 20));
    const cleanRate = getRate(rates, ['labor', 'cleaner'], 19);
    const cleanup = surveyAmount(c, 'afterCare', Math.round(cleanPeople * cleanRate));
    addSurcharge('clean', '추가(현장)', '준공 청소', `청소 ${cleanPeople}명 × 1일 × ${cleanRate}만 (${pyungForClean}평 기준)`, cleanup);
    laborTotal += cleanup;
    crewDays += cleanPeople;
  }

  // ---- 직접 추가한 실측 항목 ----
  (c?.customChecklist || []).forEach((it) => {
    const key = `custom_${it.id || it.label}`;
    if (!surveyOn(c, key)) return;
    const amount = surveyAmount(c, key, Math.max(0, Number(it.amount) || 0));
    addSurcharge(key, '추가(현장)', it.label || '직접 추가 항목', it.memo || '현장에서 직접 추가', amount);
    laborTotal += amount;
  });

  // ---- 디자인·자재 번역기 고난도 디테일 할증 ----
  const detail = detailSurcharge(c);
  if (detail.rate > 0) {
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

  // ---- 교통비·식비 — 현장 거리와 총 연인원(명·일)으로 자동 계산 ----
  // 기준 거리(기본 15km)를 넘으면 (거리 ÷ 기준거리, 내림) × 연인원 × 1인당 추가금이 붙는다.
  const distanceKm = Math.max(0, toNum(c?.distanceKm));
  const baseKm = Math.max(1, getRate(rates, ['travel', 'baseKm'], 15));
  const travelPer = Math.max(0, getRate(rates, ['travel', 'perWorker'], 1));
  const mealPer = Math.max(0, getRate(rates, ['meal', 'perWorker'], 1));
  const crewDayCount = Math.max(0, Math.round(crewDays * 10) / 10);
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
  const mset = materialSetFor(c, trade);
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
  let totalDirectCost = Math.max(
    30,
    Math.round(laborTotal + materialTotal + wasteTotal + equipTotal - excludedAmount)
  );

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
  }
  if (isBid) {
    targetSummary = `${targetSummary} · 공고 수주금액 ${bidPriceMan.toLocaleString('ko-KR')}만의 80%를 실행원가 하한으로 반영`;
  }

  const markedItems = items.map((i) => ({ ...i, excluded: excludedIds.includes(i.id) }));

  const marginTarget = typeof c?.marginRate === 'number' ? c.marginRate : info.defaultMargin;
  const safeMargin = Math.min(60, Math.max(5, marginTarget));

  let clientPrice;
  let customPrice = null;
  if (c?.customClientPrice !== null && c?.customClientPrice !== undefined && c?.customClientPrice !== '') {
    customPrice = Math.max(0, toNum(c.customClientPrice));
  }
  const priceForCost = (cost) => Math.round(cost / (1 - safeMargin / 100));
  const rangePriceFromCost = (cost) => priceForCost(cost);

  // ---- 2026 보수적 보호: 예비비(안전 버퍼) ----
  // 원가를 그대로 믿지 않고 5~8% 예비비를 더한 '보수적 원가'로 견적가를 낸다.
  const bufferRate = Math.max(
    0,
    Math.min(15, typeof c?.bufferRate === 'number' ? c.bufferRate : getRate(rates, ['buffer'], 6))
  );
  const costBuffer = Math.round((totalDirectCost * bufferRate) / 100);
  const costWithBuffer = totalDirectCost + costBuffer;

  const minJob = getRate(rates, ['minimumJob'], 40);
  let suggestedPrice = Math.round(costWithBuffer / (1 - safeMargin / 100));
  const minApplied = minJob > 0 && suggestedPrice < minJob;
  if (minApplied) suggestedPrice = minJob;   // 자동 청구 단가(인력 지원)는 사람 수 × 일수 × 청구단가가 자연히 맞는다
  let quotedLabor = null;
  if (trade === 'labor' && customPrice === null) {
    const people = sizeUnit === '명' && sizeVal > 0 ? sizeVal : Math.max(1, parseInt(sizeVal, 10) || 1);
    const days = Math.max(1, parseInt(c?.laborDays, 10) || 1);
    quotedLabor = Math.round(people * days * getRate(rates, ['laborSupply', 'charge'], 26));
  }
  const baseClientPrice = customPrice !== null ? Math.max(customPrice, 0) : quotedLabor !== null ? quotedLabor : suggestedPrice;

  // 현장 변동(추가·감소) 누적 — 견적서 금액에 그대로 더한다
  const changeLogs = Array.isArray(c?.changeLogs) ? c.changeLogs : [];
  const adjustmentTotal = Math.round(
    changeLogs.reduce((sum, l) => sum + (l?.type === 'decrease' ? -1 : 1) * (Number(l?.amount) || 0), 0)
  );
  clientPrice = Math.max(0, baseClientPrice + adjustmentTotal);

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
  if (!c?.photos?.length) missingInfos.push('현장 사진');
  if (!sizeVal || sizeUnit === '모름') missingInfos.push('공사 규모');
  if (!lifting.floor && !/\d+층/.test(notes)) missingInfos.push('층수·엘베');
  if (trade === 'unclassified') missingInfos.push('공종');

  return {
    trade,
    tradeLabel: info.short,
    targetSummary,
    clientSummary: clientSafeText(targetSummary),
    materialSet: mset,
    items: markedItems,
    excludedIds,
    excludedAmount,
    baseLabor,
    baseMaterial,
    laborTotal,
    materialTotal,
    wasteTotal,
    equipTotal,
    surchargeTotal,
    detailSurcharge: detail,
    lifting,
    crew,
    totalDirectCost,
    bufferRate,
    costBuffer,
    costWithBuffer,
    netProfitBuffered,
    marginBuffered,
    marginTarget: safeMargin,
    suggestedPrice,
    baseClientPrice,
    adjustmentTotal,
    changeLogs,
    clientPrice,
    customPrice,
    vatAmount,
    finalPrice,
    netProfit,
    marginPercent,
    isBelowBreakEven,
    // 예상 범위: 최소(인건비·단순 공정) ~ 기준 ~ 최대(폐기물·양중·자재 추가)
    rangeMin: Math.round((customPrice !== null ? baseClientPrice * 0.95 : rangePriceFromCost(costWithBuffer * 0.96)) + adjustmentTotal),
    rangeMax: Math.round((customPrice !== null ? baseClientPrice * 1.12 : rangePriceFromCost(costWithBuffer * 1.18)) + adjustmentTotal),
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
    bidPriceMan,
    bidCostFloor,
    isUncertain: missingInfos.length >= 2,
    displayTotal: finalPrice,
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
