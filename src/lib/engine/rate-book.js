// 품목 단가표 (SSOT) — 만원 단위. 줄마다 네 축(자재·인건비·장비·폐기물)으로 나뉜다.
// ─────────────────────────────────────────────────────────────
// 예전에는 '욕실 타일 60만/칸'처럼 뭉친 값이 자재·노무·폐기물 어디에도 속하지 않은 채
// 코드 여기저기서 더해졌다. 이제는 뭉친 값도 **축별로 쪼개서** 적는다.
//  · m = 자재, l = 인건비, e = 장비, w = 폐기물
//  · 쪼갠 합은 예전 뭉친 값과 같다 (금액이 바뀌지 않는다)
//  · 인건비는 '일당 × 작업일수'로 계산하므로, 여기서는 하루 처리량(perDay)을 적는다
import { ratesOf, getRate } from '../rates.js';

const line = (m = 0, l = 0, e = 0, w = 0) => ({ m, l, e, w });
const total = (x) => (x.m || 0) + (x.l || 0) + (x.e || 0) + (x.w || 0);

export const RATE_BOOK = {
  // ── 철거 ──
  demolition: {
    perManDayPyung: { restore: 3.5, finish: 8, strip: 4.5, structural: 1.5 },
    tonsPerPyung: { restore: 0.2, finish: 0.1, strip: 0.26, structural: 0.8 },
    crew: { helperMinPyung: 12 },
    // 상가 원상복구(천장·벽체·바닥 마감까지 뜯고 반출)는 안동·지방 시세 평당 22~25만(고객가)이다.
    // 그 안에서 인건비 몫은 평당 12만 — 아래 층·물량 보정은 이 선을 넘지 않는다.
    restoreLaborPerPyung: 11,
    restoreScope: /원상복구|전체\s*철거|전부\s*철거|올\s*철거|전체\s*해체|철거\s*현장|철거\s*공사/,
    consumables: { min: 5, max: 10, perPyung: 0.53, axis: line(0, 0, 1, 0) },
  },
  // ── 도배·바닥 ──
  wallpaper: {
    roll: { paper: line(4.2), silk: line(4.5) },
    floor: { t18: line(1.1), t22: line(1.5), t45: line(2.6), deco: line(2.4), hard: line(3.4) },
    wallPyungPerPyung: 2.3,
    lossRate: 1.15,
    subMaterial: { min: 8, max: 14, perPyung: 0.42, axis: line(1) },
  },
  // ── 욕실 ──
  bathroom: {
    tile: line(35, 25),
    tileStrip: line(0, 45),
    fixture: line(50),
    waterproof: line(12, 8),
    demolition: line(0, 80),
    waste: line(0, 0, 0, 20),
    overlayWaste: line(0, 0, 0, 5),
    tileOnlyWaste: line(0, 0, 0, 12),
    ubrExtra: line(0, 90),
    demoOnly: line(0, 52),
    demoOnlyWaste: line(0, 0, 0, 24),
    laborDays: 3,
    tileOnlyLaborDays: 2,
  },
  // ── 주방 ──
  kitchen: {
    sinkPerM: line(60),
    topPerM: line(16),
    waste: line(0, 0, 0, 45),
    counterWaste: line(0, 0, 0, 10),
    demoOnly: line(0, 30),
    demoOnlyWaste: line(0, 0, 0, 28),
    laborDays: 3,
  },
  // ── 타일·방수 (면적) ──
  tile: {
    materialPer: line(3.2),
    installPer: line(0, 4.5),
    waterproofPer: line(2.2, 1.2),
    demolitionPer: line(0, 2.2),
    wastePer: line(0, 0, 0, 1.2),
    minimum: 45,
  },
  // ── 창호 ──
  window: {
    matPerSqm: line(24),
    removal: line(0, 8),
    waste: line(0, 0, 0, 15),
    perDay: 8,
    minimum: 35,
  },
  // ── 수선·도장 ──
  repair: {
    perSpotLabor: line(0, 12),
    materialPer: line(5),
    paint: { water: 0.37, elastic: 0.55, repellent: 1.2 }, // 만원/㎡ (자재+인건비)
    paintMaterialShare: 0.4,
    mosquitoEach: line(3.5),
    middleDoorSet: line(45),
    minimum: 15,
  },
  // ── 미장 ──
  plaster: {
    mortarPerSqm: line(0, 2.8),
    materialPer: line(0.8),
    heatingPer: line(2.5),
    perDay: 16,
    minimum: 30,
  },
  // ── 목공 ──
  carpentry: {
    matPerM: line(4),
    perDay: 6,
    minimum: 25,
  },
  // ── 가벽(경량벽체) ──
  partition: {
    wallPerM: line(3.2),
    doorEach: line(16),
    perDayM: 4,
    doorDays: 0.34,
    minDays: 2,
    waste: { base: 11, perM: 0.5 },
    consum: line(0, 0, 5),
    height: 2.4,
  },
  // ── 전기·조명 ──
  electric: {
    trip: line(0, 15),
    matPerPoint: line(3.2),
    perDay: 6,
    lightingPerDay: 10,
    minimum: 25,
  },
  // ── 설비·배관 ──
  plumbing: {
    trip: line(0, 15),
    matPerPoint: line(4.2),
    perDay: 3.5,
    minimum: 30,
  },
  // ── 필름 ──
  film: {
    matPerSqm: line(1.8),
    perDay: 14,
    minimum: 25,
    doorSqm: 3.6,
  },
  // ── 기초·토목 ──
  groundwork: {
    perSqm: line(0, 2.7, 1.125, 0), // 4.5만/㎡ = 인건비 60% + 장비 25% + 자재 15%
    materialShare: 0.15,
    equipShare: 0.25,
    minimum: 50,
    wastePerSqm: line(0, 0, 0, 0.8),
  },
  // ── 복합(전체 인테리어) ──
  combined: {
    perPyungFloor: 85, // 올수리 기본 포함 공정 하한 (평당)
  },
  // ── 현장 부대(4축) ──
  site: {
    lift: line(0, 1),
    longCarry: line(0, 8),
    noParking: line(0, 5),
    narrowDoor: line(0, 5),
    heatingPipe: line(0, 35),
    leak: line(0, 30),
    oldPlumbing: line(25),
    loadBearing: line(0, 30),
    asbestos: line(0, 0, 30),
    workTimeLimit: line(0, 20),
    adminReport: line(0, 0, 8),
    powerWaterCut: line(0, 0, 5),
    gasFirePermit: line(0, 0, 10),
    residential: line(0, 12),
    protect: line(0, 0, 8),
    clean: line(0, 19),
  },
  // ── 인력 지원 ──
  laborSupply: { insurance: 2 },
};

// 예전 코드·문서가 쓰던 뭉친 단가 — 위 표에서 합계로 만든다 (한 곳에서만 값을 적는다)
export const MATERIAL_RATES = (() => {
  const B = RATE_BOOK;
  return {
    wallpaper: {
      silkRoll: total(B.wallpaper.roll.silk),
      paperRoll: total(B.wallpaper.roll.paper),
      floor18: total(B.wallpaper.floor.t18),
      floor22: total(B.wallpaper.floor.t22),
      floor45: total(B.wallpaper.floor.t45),
      decoTile: total(B.wallpaper.floor.deco),
      hardWood: total(B.wallpaper.floor.hard),
    },
    bathroom: {
      tilePer: total(B.bathroom.tile),
      tileStripPer: total(B.bathroom.tileStrip),
      tileOnlyLaborDays: B.bathroom.tileOnlyLaborDays,
      fixturePer: total(B.bathroom.fixture),
      waterproofPer: total(B.bathroom.waterproof),
      demolition: total(B.bathroom.demolition),
      ubrExtra: total(B.bathroom.ubrExtra),
      laborDays: B.bathroom.laborDays,
      wastePer: total(B.bathroom.waste),
      overlayWaste: total(B.bathroom.overlayWaste),
      demoOnlyPer: total(B.bathroom.demoOnly),
      demoOnlyWaste: total(B.bathroom.demoOnlyWaste),
    },
    kitchen: {
      sinkPerM: total(B.kitchen.sinkPerM),
      topPerM: total(B.kitchen.topPerM),
      waste: total(B.kitchen.waste),
      laborDays: B.kitchen.laborDays,
      demoOnlyPer: total(B.kitchen.demoOnly),
      demoOnlyWaste: total(B.kitchen.demoOnlyWaste),
    },
    tile: {
      materialPer: total(B.tile.materialPer),
      installPer: total(B.tile.installPer),
      waterproofPer: total(B.tile.waterproofPer),
      demolitionPer: total(B.tile.demolitionPer),
      minimum: B.tile.minimum,
    },
    window: { perSqm: total(B.window.matPerSqm) + 0, matPerSqm: total(B.window.matPerSqm), perDay: B.window.perDay, removal: total(B.window.removal), waste: total(B.window.waste), minimum: B.window.minimum },
    repair: { perSpot: total(B.repair.perSpotLabor), materialPer: total(B.repair.materialPer), minimum: B.repair.minimum },
    plaster: { mortarPer: total(B.plaster.mortarPerSqm), materialPer: total(B.plaster.materialPer), heatingPer: total(B.plaster.heatingPer), minimum: B.plaster.minimum, perDay: B.plaster.perDay },
    waste: { defaultTons: 1.5 },
    carpentry: { perM: total(B.carpentry.matPerM), matPer: total(B.carpentry.matPerM), perDay: B.carpentry.perDay, minimum: B.carpentry.minimum },
    partition: {
      wallPerM: total(B.partition.wallPerM),
      doorEach: total(B.partition.doorEach),
      perDayM: B.partition.perDayM,
      doorDays: B.partition.doorDays,
      minDays: B.partition.minDays,
      wasteBase: B.partition.waste.base,
      wastePerM: B.partition.waste.perM,
      consum: total(B.partition.consum),
      height: B.partition.height,
    },
    electric: { trip: total(B.electric.trip), perPoint: 8, matPer: total(B.electric.matPerPoint), perDay: B.electric.perDay, minimum: B.electric.minimum },
    plumbing: { trip: total(B.plumbing.trip), perPoint: 12, matPer: total(B.plumbing.matPerPoint), perDay: B.plumbing.perDay, minimum: B.plumbing.minimum },
    film: { perSqm: 2.2, matPer: total(B.film.matPerSqm), perDay: B.film.perDay, minimum: B.film.minimum },
    groundwork: { perSqm: 4.5, equipRate: 0.25, minimum: 50 },
  };
})();

// 한 품목의 축별 금액 — 수량을 넣으면 4축으로 바로 나온다
export function axisAmount(entry, qty = 1) {
  const q = Number(qty) || 0;
  return {
    material: Math.round((entry.m || 0) * q),
    labor: Math.round((entry.l || 0) * q),
    equip: Math.round((entry.e || 0) * q),
    waste: Math.round((entry.w || 0) * q),
  };
}

// 인건비 일당은 사용자가 설정에서 바꿀 수 있으므로 rates에서 읽는다
export function dayRate(rates, role, fallback) {
  return getRate(rates || ratesOf(null), ['labor', role], fallback);
}
