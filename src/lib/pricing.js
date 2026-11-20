// 견적 엔진 — 경북 철거·인테리어 실무 단가 (단위: 만원)
// 검증된 4개 기준 견적(15평 철거 374 / 24평 도배·장판 324 / 욕실 1칸 454 / 주방 3.2m 325)의
// 원가 구조와 "고객가 = 원가 ÷ (1 − 마진율)" 공식을 그대로 모듈화했다.
import { TRADES, HARD_DETAILS } from './constants';
import { ratesOf, getRate } from './rates.js';

export const MAN = 10000; // 원 → 만원

// 2026 실견적 보정 자재·공정 단가 (work/real-interior-quotes-2026.md 5-1·5-2)
export const MATERIAL_RATES = {
  wallpaper: { silkRoll: 4.5, paperRoll: 4.2, floor18: 1.1, floor22: 1.5 },
  bathroom: { tilePer: 120, fixturePer: 50, waterproofPer: 20, demolition: 80, ubrExtra: 90, laborDays: 3, wastePer: 20, overlayWaste: 5 },
  kitchen: { sinkPerM: 60, topPerM: 16, waste: 45, laborDays: 3 },
  tile: { materialPer: 3.2, installPer: 4.5, waterproofPer: 3.4, demolitionPer: 2.2, minimum: 45 },
  window: { perSqm: 28, removal: 8, waste: 15, minimum: 35 },
  repair: { perSpot: 12, materialPer: 5, minimum: 15 },
  plaster: { mortarPer: 2.8, materialPer: 1.2, heatingPer: 2.5, minimum: 30 },
  waste: { defaultTons: 1.5 },
};

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

// 디자인·자재 번역기에서 선택한 고난도 디테일의 할증률/공기
export function detailSurcharge(c) {
  const selected = Array.isArray(c?.design?.details) ? c.design.details : [];
  const rows = HARD_DETAILS.filter((d) => selected.includes(d.id));
  const rate = Math.min(50, rows.reduce((s, d) => s + d.rate, 0));
  const days = rows.reduce((s, d) => s + d.days, 0);
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
    const carryPerTruck = 5 + (elevator === 'no' ? 10 : 0) + Math.max(0, floor - 2) * 2;
    const trucks = Math.max(1, Math.ceil(tons / 1.5));
    options.push({
      id: 'carry',
      label: `인력 반출 (1톤차 ${trucks}대)`,
      cost: Math.round(trucks * carryPerTruck),
      detail: `폐기물 약 ${tons}톤 · 1톤차당 ${carryPerTruck}만(층수·엘베 조건)`,
    });
    if (ladderAllowed !== 'no') {
      const half = getRate(rates, ['ladder', 'half'], 35);
      const day = getRate(rates, ['ladder', 'day'], 55);
      const hour = getRate(rates, ['ladder', 'hour'], 12);
      options.push({ id: 'ladder_half', label: '사다리차 반나절', cost: half, detail: `1시간 ${hour}만 / 반나절 ${half}만 / 하루 ${day}만` });
      options.push({ id: 'ladder_day', label: '사다리차 하루', cost: day, detail: '자재·폐기물 동시 양중 시' });
    }
    if (ladderAllowed === 'no') {
      options.push({ id: 'special', label: '특수 양중(사다리차 불가)', cost: 28, detail: '주차·소방통로·전선 문제로 대체 장비' });
    }
  }
  if (carryM >= 30) {
    options.push({ id: 'longcarry', label: '장거리 운반(30m 이상) 추가', cost: 8, detail: '잡부 반일 추가' });
  }

  const chosenId = lift.mode || (options[0] ? options[0].id : 'none');
  const chosen = options.find((o) => o.id === chosenId) || options[0] || { id: 'none', label: '없음', cost: 0 };
  const cost = chosen ? chosen.cost : 0;
  const warnings = [];
  if (elevator === 'no' && floor >= 3) warnings.push(`엘베 없음 ${floor}층 — 양중비가 견적에서 가장 자주 빠지는 항목입니다.`);
  if (ladderAllowed === 'no') warnings.push('사다리차 설치 불가 — 특수 양중비를 반드시 견적에 넣으세요.');
  if (!floor) warnings.push('층수를 입력하면 양중비가 정확해집니다.');

  return { floor, elevator, ladderAllowed, carryM, pyung, tons, options, chosen, cost, warnings };
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
    const laborDays = pyung >= 30 ? 3 : 2;
    const laborCost = laborDays * getRate(rates, ['labor', 'wallpaper'], 28);

    materialTotal += wallCost + floorCost + subMat;
    laborTotal += laborCost;

    targetSummary = `${pyung}평 ${silk ? '실크' : '합지'} 도배(벽 ${wallPyung}평/${rolls}롤) + ${is22 ? '2.2T' : '1.8T'} 장판(${floorSqm}㎡)`;
    items.push(
      { id: 'wallpaper', category: '자재', name: `${silk ? '실크' : '합지'} 벽지 (${rolls}롤)`, detail: `벽 ${wallPyung}평 ÷ 5평/롤 × 1.15(손실) × ${rollUnit}만`, amount: wallCost },
      { id: 'floor', category: '자재', name: `${is22 ? '2.2T' : '1.8T'} 장판 (${floorSqm}㎡)`, detail: `${pyung}평 × 2.3 = ${floorSqm}㎡ × ${floorUnit}만`, amount: floorCost },
      { id: 'submat', category: '자재', name: '도배·장판 부자재', detail: '친환경 풀·초배지·장판본드·실리콘', amount: subMat },
      { id: 'labor', category: '노무', name: `도배·장판 노무 (${laborDays}일)`, detail: `기공 1명 + 보조 1명 (${laborDays}일)`, amount: laborCost }
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
    const tons = sizeUnit === '톤' && sizeVal > 0 ? sizeVal : Math.max(0.5, +(toPyung(sizeVal, sizeUnit, 8) * 0.18).toFixed(1));
    const perTon = getRate(rates, ['waste', 'perTon'], 32);
    const loadDays = tons >= 5 ? 2 : 1;
    const loadingRate = getRate(rates, ['waste', 'loading'], 19);
    const loading = Math.round(loadingRate * loadDays);
    const heavy = tons >= 8;
    const truck = heavy ? getRate(rates, ['waste', 'truck25'], 75) : getRate(rates, ['waste', 'truck1'], 42.5);
    const ticket = getRate(rates, ['waste', 'ticket'], 3);
    const disposal = Math.round(tons * perTon);

    wasteTotal += truck + disposal;
    laborTotal += loading;
    equipTotal += ticket;
    targetSummary = `폐기물 약 ${tons}톤 수거·상차·운반·처리 (톤당 ${perTon}만 · ${heavy ? '2.5톤' : '1톤'}차 ${truck}만)`;
    items.push(
      { id: 'waste_disposal', category: '폐기물', name: `폐기물 중간처리 (${tons}톤)`, detail: `${tons}톤 × ${perTon}만 (2026 성상별 단가 기준)`, amount: disposal },
      { id: 'waste_truck', category: '폐기물', name: `${heavy ? '2.5톤' : '1톤'} 수집·운반 차량 1대`, detail: '상차 2시간 포함, 처리장 운반', amount: Math.round(truck) },
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
    const mortar = Math.round(area * P.mortarPer);
    const material = Math.round(area * P.materialPer);
    const heating = withHeating ? Math.round(area * P.heatingPer) : 0;
    const tileAdd = withTile ? Math.round(area * (TILE_ADD.material + TILE_ADD.install)) : 0;

    laborTotal += mortar + heating + (withTile ? Math.round(area * TILE_ADD.install) : 0);
    materialTotal += material + (withTile ? Math.round(area * TILE_ADD.material) : 0);
    wasteTotal += Math.max(12, Math.round(area * 0.9));
    targetSummary = `바닥 미장 ${area}㎡${withHeating ? ' + 난방 보강' : ''}${withTile ? ' + 타일' : ''} (미장 ${P.mortarPer}만/㎡)`;
    items.push(
      { id: 'plaster', category: '노무', name: `바닥 미장 (${area}㎡)`, detail: `${area}㎡ × ${P.mortarPer}만 (몰탈·미장공)`, amount: mortar },
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
    const product = Math.round(area * W.perSqm);
    const removal = W.removal;
    const wasteCost = W.waste;
    materialTotal += product;
    laborTotal += removal;
    wasteTotal += wasteCost;
    targetSummary = `창호·발코니 ${area}㎡ 교체 (자재+시공 ${W.perSqm}만/㎡, 기존 철거 ${removal}만)`;
    items.push(
      { id: 'window', category: '자재', name: `창호·폴딩도어 (${area}㎡)`, detail: `${area}㎡ × ${W.perSqm}만 (자재+시공)`, amount: product },
      { id: 'removal', category: '노무', name: '기존 창호 철거', detail: '유리·프레임 분리', amount: removal },
      { id: 'waste', category: '폐기물', name: '창호·유리 폐기물', detail: '분리 반출', amount: wasteCost }
    );
    if (product + removal + wasteCost < W.minimum) {
      const gap = Math.round(W.minimum - (product + removal + wasteCost));
      items.push({ id: 'min_floor', category: '추가(현장)', name: '소규모 현장 최소 반영', detail: '출동·실측·마감 최소선', amount: gap });
      laborTotal += gap;
    }
  } else if (trade === 'repair') {
    const R = MATERIAL_RATES.repair;
    const spots = sizeUnit === '개소' || sizeUnit === '개' ? Math.max(1, sizeVal) : 1;
    const laborCost = Math.round(spots * R.perSpot);
    const matCost = Math.round(spots * R.materialPer);
    laborTotal += laborCost;
    materialTotal += matCost;
    targetSummary = `부분 수선 ${spots}개소 (1개소 ${R.perSpot}만 + 자재 ${R.materialPer}만)`;
    items.push(
      { id: 'labor', category: '노무', name: `수선 인력 (${spots}개소)`, detail: `${spots}개소 × ${R.perSpot}만`, amount: laborCost },
      { id: 'mat', category: '자재', name: '수선 자재·부자재', detail: `${spots}개소 × ${R.materialPer}만`, amount: matCost }
    );
    if (laborCost + matCost < R.minimum) {
      const gap = Math.round(R.minimum - (laborCost + matCost));
      items.push({ id: 'min_floor', category: '추가(현장)', name: '최소 출동비', detail: '이동·공구·마감', amount: gap });
      laborTotal += gap;
    }
  } else {
    const pyung = toPyung(sizeVal, sizeUnit, 15);
    const laborCost = Math.round(50 + pyung * 6);
    const matCost = Math.round(60 + pyung * 8);
    laborTotal += laborCost;
    materialTotal += matCost;
    wasteTotal += 33;
    targetSummary = trade === 'combined' ? `${pyung}평 복합 인테리어(철거+도배+부분 욕실)` : `미분류 현장 (약 ${pyung}평 기준 가산출 — 공종 선택 필요)`;
    items.push(
      { id: 'labor', category: '노무', name: '복합 공정 노무비', detail: `${pyung}평 기준`, amount: laborCost },
      { id: 'mat', category: '자재', name: '복합 공정 표준 자재비', detail: `${pyung}평 기준`, amount: matCost },
      { id: 'waste', category: '폐기물', name: '폐기물 처리 (2.5톤 1대)', detail: '수거 반출', amount: 33 }
    );
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
  if (surveyOn(c, 'adminDeposit'))
    addSurcharge('deposit', '추가(규제)', '관리사무소 신고·동의서', getRate(rates, ['site', 'adminReport'], 8) + '만 (대행)', getRate(rates, ['site', 'adminReport'], 8));
  if (surveyOn(c, 'powerWaterCut')) addSurcharge('cut', '추가(규제)', '단전·단수 조치', '차단·마감', 5);
  if (surveyOn(c, 'gasFirePermit')) addSurcharge('gas', '추가(규제)', '가스·소방 작업허가', '허가·보양', 10);
  if (surveyOn(c, 'residential')) { addSurcharge('residential', '추가(현장)', '거주 중 시공 보양', '가구 이동·먼지막이·매일 청소', 12); laborTotal += 12; }
  if (surveyOn(c, 'protectLevel')) {
    const protect = getRate(rates, ['site', 'protect'], 8) * Math.max(1, parseInt(c?.protectSpots, 10) || 1);
    addSurcharge('protect', '추가(현장)', '보양(엘베·복도·현관)', `1곳 ${getRate(rates, ['site', 'protect'], 8)}만 × ${Math.max(1, parseInt(c?.protectSpots, 10) || 1)}곳`, protect);
    materialTotal += protect;
  }
  if (surveyOn(c, 'materialLift')) {
    const liftCost = getRate(rates, ['site', 'materialLift'], 15);
    addSurcharge('materialLift', '추가(운반)', '자재 올리기', '자재를 층까지 올리는 인력', liftCost);
    laborTotal += liftCost;
  }
  if (surveyOn(c, 'ladderSmall')) {
    const small = getRate(rates, ['ladder', 'small'], 12);
    addSurcharge('ladderSmall', '추가(운반)', '사다리차 소형 1회', '4층 규모 자재·폐기물 반출', small);
    equipTotal += small;
  }
  if (surveyOn(c, 'afterCare')) {
    const cleanup = getRate(rates, ['site', 'cleanup'], 45);
    addSurcharge('clean', '추가(현장)', '준공 청소', '오염 제거·바닥 청소 (34평 기준)', cleanup);
    laborTotal += cleanup;
  }

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

  // 항목별 포함/제외 (견적서에서 한 줄씩 끌 수 있다)
  const excludedIds = Array.isArray(c?.excludedItems) ? c.excludedItems : [];
  const excludedAmount = items
    .filter((i) => excludedIds.includes(i.id))
    .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const markedItems = items.map((i) => ({ ...i, excluded: excludedIds.includes(i.id) }));

  const totalDirectCost = Math.max(
    30,
    Math.round(laborTotal + materialTotal + wasteTotal + equipTotal - excludedAmount)
  );
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
  const plan = c?.paymentPlan || { deposit: 30, mid: 40, balance: 30 };
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
    paid,
    remaining,
    balanceRatio,
    remainingRatio,
    missingInfos,
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
