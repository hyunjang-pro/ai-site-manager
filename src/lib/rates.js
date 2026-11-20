// 기본 단가표 (만원 단위) — 실제 견적 60건 분석(work/real-interior-quotes-2026.md 5-1·5-2) 반영.
// 설정에서 바꾸면 "앞으로 만드는 현장"에만 적용된다. 이미 만든 현장은 unitPriceSnapshot 을 그대로 쓴다.
export const DEFAULT_RATES = {
  labor: {
    demolition: 27, // 철거공 공표 26.1만(2026.9.1) + 지역 인력수급 여유
    helper: 19, // 보통인부 공표 17.3만 + 사무소 수수료 여유
    wallpaper: 30, // 도배 기공 일당 (2026 하반기 시세)
    bathroom: 37, // 타일공 공표 29.4만 + 기능공 프리미엄
    kitchen: 32, // 목수·설비
    tilewaterproof: 37,
    window: 32,
    repair: 28,
    daylabor: 19, // 인력 지원 원가(일당)
  },
  waste: {
    truckMixed: 35, // 2.5톤 혼합 폐기물 (2026 수도권 70~80만, 지방 반영)
    truckHeavy: 52, // 5톤 중량 폐기물
    truck1: 42.5, // 1톤차 실비 (40~45만 중간값) — 생활폐기물 '한차' 기본
    truckHalf: 26, // 반차(0.5톤) — 1톤차의 60% 수준 (보조금 없을 때 실제 지급액)
    truck25: 75, // 2.5톤차 실비 (70~80만)
    grapple: 31, // 집게차 1회
    perTon: 32, // 중간처리 72,721원/톤 + 수집운반·상차 인건비
    loading: 19, // 상차 인부 1일
    ticket: 3, // 폐기물 처리확인서·행정
  },
  plaster: {
    mortar: 2.8, // 바닥 미장(몰탈) 시공 ㎡당
    material: 1.2, // 몰탈·메쉬·양생 자재
    heating: 2.5, // 난방배관·단열 보강 ㎡당
    minimum: 30,
  },
  tile: {
    material: 3.2, // 타일 자재 ㎡당
    install: 4.5, // 타일 시공 ㎡당
    waterproof: 3.4, // 방수(2회+담수) ㎡당
    demolition: 2.2, // 기존 마감 철거 ㎡당
    minimum: 45,
  },
  window: {
    perSqm: 28, // 폴딩도어·샤시 자재+시공 ㎡당
    removal: 8, // 기존 창호 철거
    waste: 15,
    minimum: 35,
  },
  repair: {
    perSpot: 12, // 부분 수선 1개소
    material: 5,
    minimum: 15,
  },
  laborSupply: {
    charge: 26, // 인력 지원 청구 단가(일당)
    cost: 19, // 지급 일당
    insurance: 2, // 4대보험·안전관리
  },
  buffer: 6, // 보수적 예비비 % (0·5·6·8)
  ladder: {
    hour: 12,
    half: 35,
    day: 55,
    small: 12, // 소형 사다리차 1회 (4층 규모, 실견적 A)
  },
  elevator: 5.5, // 엘리베이터 사용료(기본)
  site: {
    protect: 8, // 보양 1곳 (엘베·복도·현관)
    adminReport: 8, // 관리사무소 신고·동의서 대행
    materialLift: 15, // 자재 양중
    cleanup: 45, // 준공 청소(34평 기준)
  },
  minimumJob: 40, // 단품 공사 최소 공사비 하한
};

export const RATE_FIELDS = [
  {
    group: '인건비 (하루 일당)',
    icon: '👷',
    fields: [
      { path: ['labor', 'demolition'], label: '철거 기공', unit: '만원/일' },
      { path: ['labor', 'helper'], label: '보조·잡부', unit: '만원/일' },
      { path: ['labor', 'wallpaper'], label: '도배 기공', unit: '만원/일' },
      { path: ['labor', 'bathroom'], label: '타일·욕실 기공', unit: '만원/일' },
      { path: ['labor', 'kitchen'], label: '주방 설치 기공', unit: '만원/일' },
    ],
  },
  {
    group: '폐기물 차량·장비',
    icon: '🚛',
    fields: [
      { path: ['waste', 'truckMixed'], label: '2.5톤 혼합 (견적)', unit: '만원/대' },
      { path: ['waste', 'truckHeavy'], label: '5톤 중량 (견적)', unit: '만원/대' },
      { path: ['waste', 'truck1'], label: '1톤차 실비', unit: '만원/대' },
      { path: ['waste', 'truck25'], label: '2.5톤차 실비', unit: '만원/대' },
      { path: ['waste', 'perTon'], label: '톤당 운반·처리', unit: '만원/톤' },
      { path: ['waste', 'grapple'], label: '집게차', unit: '만원/회' },
    ],
  },
  {
    group: '사다리차·부대비용',
    icon: '🪜',
    fields: [
      { path: ['ladder', 'hour'], label: '사다리차 1시간', unit: '만원' },
      { path: ['ladder', 'half'], label: '사다리차 반나절', unit: '만원' },
      { path: ['ladder', 'day'], label: '사다리차 하루', unit: '만원' },
      { path: ['ladder', 'small'], label: '사다리차 소형', unit: '만원/회' },
      { path: ['elevator'], label: '엘리베이터 사용료', unit: '만원' },
      { path: ['site', 'protect'], label: '보양(1곳)', unit: '만원' },
      { path: ['site', 'adminReport'], label: '관리사무소 신고', unit: '만원' },
      { path: ['site', 'materialLift'], label: '자재 올리기', unit: '만원' },
      { path: ['site', 'cleanup'], label: '준공 청소', unit: '만원' },
    ],
  },
  {
    group: '최소 공사비',
    icon: '📍',
    fields: [{ path: ['minimumJob'], label: '단품 최소 공사비', unit: '만원' }],
  },
  {
    group: '타일·방수·창호·수선 (2026)',
    icon: '🧱',
    fields: [
      { path: ['plaster', 'mortar'], label: '바닥 미장', unit: '만원/㎡' },
      { path: ['tile', 'install'], label: '타일 시공', unit: '만원/㎡' },
      { path: ['tile', 'waterproof'], label: '방수(2회+담수)', unit: '만원/㎡' },
      { path: ['tile', 'demolition'], label: '마감 철거', unit: '만원/㎡' },
      { path: ['window', 'perSqm'], label: '창호(자재+시공)', unit: '만원/㎡' },
      { path: ['repair', 'perSpot'], label: '부분 수선', unit: '만원/개소' },
    ],
  },
  {
    group: '폐기물·인력 지원',
    icon: '🚛',
    fields: [
      { path: ['waste', 'perTon'], label: '톤당 운반·처리', unit: '만원/톤' },
      { path: ['waste', 'loading'], label: '상차 인부', unit: '만원/일' },
      { path: ['laborSupply', 'charge'], label: '인력 지원 청구', unit: '만원/일' },
      { path: ['laborSupply', 'cost'], label: '인력 지원 원가', unit: '만원/일' },
    ],
  },
  {
    group: '보수적 견적 보호',
    icon: '🛡️',
    fields: [{ path: ['buffer'], label: '예비비(안전 버퍼)', unit: '%' }],
  },
];

export function cloneRates(rates) {
  return JSON.parse(JSON.stringify(rates));
}

export function mergeRates(base, patch) {
  const merged = cloneRates(DEFAULT_RATES);
  const apply = (target, source) => {
    Object.entries(source || {}).forEach(([k, v]) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if (!target[k] || typeof target[k] !== 'object') target[k] = {};
        apply(target[k], v);
      } else if (Number.isFinite(Number(v))) {
        target[k] = Number(v);
      }
    });
  };
  if (base && typeof base === 'object') apply(merged, base);
  if (patch && typeof patch === 'object') apply(merged, patch);
  return merged;
}

export function ratesOf(c) {
  return mergeRates(DEFAULT_RATES, c?.unitPriceSnapshot || {});
}

export function getRate(rates, path, fallback = 0) {
  let cur = rates;
  for (const key of path) {
    if (cur === null || cur === undefined) return fallback;
    cur = cur[key];
  }
  const n = Number(cur);
  return Number.isFinite(n) ? n : fallback;
}

export function setRate(rates, path, value) {
  const next = cloneRates(rates || DEFAULT_RATES);
  let cur = next;
  path.forEach((key, i) => {
    if (i === path.length - 1) cur[key] = Number(value) || 0;
    else {
      if (!cur[key] || typeof cur[key] !== 'object') cur[key] = {};
      cur = cur[key];
    }
  });
  return next;
}
