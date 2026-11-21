// 기본 단가표 (만원 단위) — 실제 견적 60건 분석(work/real-interior-quotes-2026.md 5-1·5-2) 반영.
// 설정에서 바꾸면 "앞으로 만드는 현장"에만 적용된다. 이미 만든 현장은 unitPriceSnapshot 을 그대로 쓴다.
export const DEFAULT_RATES = {
  labor: {
    // ── 철거·기본 인부 ──
    demolition: 27, // 철거공 공표 26.1만(2026.9.1) + 지역 인력수급 여유
    helper: 19, // 보통인부 공표 17.3만 + 사무소 수수료 여유
    // ── 도배·타일·주방 ──
    wallpaper: 30, // 도배 기공 일당 (2026 하반기 시세)
    bathroom: 37, // 타일공 공표 29.4만 + 기능공 프리미엄
    kitchen: 32, // 주방 철거·설치 기공
    // ── 직종별 기능공 (2026 실견적 DB 14직종 + 장판·코킹·창호·청소) ──
    carpenter: 30, // 목수(목공) — 문·문틀·몰딩·가구·데크
    electrician: 28, // 전기·조명공 — 콘센트·스위치·매입등
    plumber: 28, // 설비·배관공 — 수전·배관·보일러
    plasterer: 27, // 미장·방수공 — 바닥 몰탈·방수
    film: 28, // 인테리어 필름공 — 필름·시트지
    floor: 28, // 장판·마루공
    window: 32, // 창호·샷시공
    painter: 26, // 페인트·탄성공 (도장)
    caulking: 25, // 코킹·실리콘공
    cleaner: 19, // 준공 청소 인원
    repair: 28, // 부분 수선 기공 (도장·코킹이 아닌 보수)
    tilewaterproof: 37,
    daylabor: 19, // 인력 지원 원가(일당)
  },
  // 원거리 교통비 — 기준 거리 이상이면 (거리 ÷ 기준거리, 내림) × 연인원 × 1인당 추가금
  travel: {
    baseKm: 15, // 이 거리까지는 교통비 없음
    perWorker: 1, // 기준 거리 1구간마다 인부 1명·1일당 만원
  },
  meal: {
    perWorker: 1, // 인부 1명 하루 식비 (만원)
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
    skyHalf: 45, // 고소작업차(스카이) 반나절 — 간판·외부 작업
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
    group: '인건비 — 철거·기본 인부',
    icon: '👷',
    hint: '하루 일당입니다. 이 값으로 노무비를 계산합니다.',
    fields: [
      { path: ['labor', 'demolition'], label: '철거 기공', unit: '만원/일' },
      { path: ['labor', 'helper'], label: '보조·잡부', unit: '만원/일' },
    ],
  },
  {
    group: '인건비 — 도배·타일·주방',
    icon: '🏠',
    fields: [
      { path: ['labor', 'wallpaper'], label: '도배 기공', unit: '만원/일' },
      { path: ['labor', 'bathroom'], label: '타일·욕실 기공', unit: '만원/일' },
      { path: ['labor', 'kitchen'], label: '주방 설치 기공', unit: '만원/일' },
    ],
  },
  {
    group: '인건비 — 직종별 기능공',
    icon: '🔧',
    hint: '철거·폐기물·인테리어에 부르는 인부 종류입니다. 그 직종 노무비가 이 일당으로 계산됩니다.',
    fields: [
      { path: ['labor', 'carpenter'], label: '목수 (목공)', unit: '만원/일' },
      { path: ['labor', 'electrician'], label: '전기·조명공', unit: '만원/일' },
      { path: ['labor', 'plumber'], label: '설비·배관공', unit: '만원/일' },
      { path: ['labor', 'plasterer'], label: '미장·방수공', unit: '만원/일' },
      { path: ['labor', 'film'], label: '인테리어 필름공', unit: '만원/일' },
      { path: ['labor', 'floor'], label: '장판·마루공', unit: '만원/일' },
      { path: ['labor', 'window'], label: '창호·샷시공', unit: '만원/일' },
      { path: ['labor', 'painter'], label: '페인트·탄성공', unit: '만원/일' },
      { path: ['labor', 'caulking'], label: '코킹·실리콘공', unit: '만원/일' },
      { path: ['labor', 'repair'], label: '수선·보수 기공', unit: '만원/일' },
      { path: ['labor', 'cleaner'], label: '준공 청소 인원', unit: '만원/일' },
    ],
  },
  {
    group: '교통비·식비',
    icon: '🚚',
    hint: '현장 거리(km)가 기준을 넘으면 교통비가, 모든 현장에 식비가 연인원(명·일)만큼 자동으로 붙습니다.',
    fields: [
      { path: ['travel', 'baseKm'], label: '기준 거리 (이내는 무료)', unit: 'km' },
      { path: ['travel', 'perWorker'], label: '기준 거리 넘을 때 1인당', unit: '만원/일' },
      { path: ['meal', 'perWorker'], label: '인부 1인당 하루 식비', unit: '만원/일' },
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
      { path: ['ladder', 'skyHalf'], label: '고소작업차(스카이) 반나절', unit: '만원' },
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

// 직종 목록 — 설정 일당과 '인부 종류' 고르기에 같이 쓴다.
export const LABOR_ROLES = [
  { key: 'demolition', label: '철거 기공' },
  { key: 'helper', label: '보조·잡부' },
  { key: 'wallpaper', label: '도배 기공' },
  { key: 'bathroom', label: '타일·욕실 기공' },
  { key: 'kitchen', label: '주방 설치 기공' },
  { key: 'carpenter', label: '목수 (목공)' },
  { key: 'electrician', label: '전기·조명공' },
  { key: 'plumber', label: '설비·배관공' },
  { key: 'plasterer', label: '미장·방수공' },
  { key: 'film', label: '인테리어 필름공' },
  { key: 'floor', label: '장판·마루공' },
  { key: 'window', label: '창호·샷시공' },
  { key: 'painter', label: '페인트·탄성공' },
  { key: 'caulking', label: '코킹·실리콘공' },
  { key: 'repair', label: '수선·보수 기공' },
  { key: 'cleaner', label: '준공 청소 인원' },
];

// 1평 = 3.305785㎡ — ㎡ 단가를 평당으로 바꿔 암산 없이 보여준다.
const SQM_PER_PYEONG = 3.305785;
export function perPyeong(perSqm) {
  const v = Number(perSqm) * SQM_PER_PYEONG;
  if (!Number.isFinite(v) || v <= 0) return '0';
  const rounded = Math.round(v * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

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
