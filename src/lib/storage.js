// 저장·예시 데이터 — LocalStorage 자동 저장
import { STORAGE_KEY, TRADES } from './constants';
import { emptyWasteScopes } from './waste';
import { DEFAULT_RATES, cloneRates, mergeRates } from './rates';

const todayISO = () => new Date().toISOString().slice(0, 10);

function baseCase(overrides = {}) {
  const trade = overrides.trade || 'demolition';
  const info = TRADES[trade];
  return {
    id: `case-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: todayISO(),
    updatedAt: todayISO(),
    title: '새 현장',
    clientName: '',
    clientPhone: '',
    location: '',
    region: '안동',
    trade,
    sizeValue: '',
    sizeUnit: info.defaultUnit,
    notes: '',
    supplement: '',
    rawInput: '',
    ocrRaw: '',
    photos: [],
    // v3 — 시공 시작일·자재 세트·업체별 발주 체크
    startDate: '',
    workDays: '',
    materialSet: '',
    orderChecks: {},
    subsidyCheck: {},
    design: { preset: '', keywords: '', details: [] },
    waste: {
      scopes: emptyWasteScopes(),
      trucks: '',
      heavy: false,
      applyActual: false,
      actualCost: 0,
      assignMode: 'separated',
    },
    asbestos: { builtYear: '', usage: 'unknown', ceiling: 'unknown', roof: 'unknown', insulation: 'no', areaSqm: '' },
    lifting: { floor: '', elevator: 'unknown', ladderAllowed: 'unknown', carryDistance: '', mode: '' },
    survey: {},
    evidence: {},
    marginRate: info.defaultMargin,
    bufferRate: undefined, // 만들 때 단가표의 예비비를 복사
    laborDays: 1,
    tileWork: { mode: 'both' },
    plaster: { heating: false, tile: false },
    extraWorks: [],
    excludedWorks: [],
    smsStrength: true,
    bid: null,
    customClientPrice: '',
    includeVat: false,
    stage: 'prelim',
    collection: 'deposit_wait',
    paidAmount: 0,
    paymentPlan: { deposit: 30, mid: 40, balance: 30 },
    gates: {
      deposit: false,
      midPaid: false,
      lift: { notice: false, protect: false, neighbor: false, ladder: false },
      waterproof: { startedAt: '', checks: { level: false, h24: false, beforeDrain: false }, belowOk: false },
      strip: false,
      primer: false,
      dry: false,
      demo: false,
      water: false,
      gas: false,
      measure: false,
      separate: false,
      plan: false,
      evidence: false,
      donePhoto: false,
      defect: false,
      balancePaid: false,
    },
    changeLogs: [],
    crew: [],
    dispatch: { date: '', time: '08:00', vehicle: '1톤 포터', safetyEdu: true },
    agencyFeeRate: 10,
    negotiation: { proposal: '' },
    // 이 현장을 만들 때의 단가표 — 나중에 설정을 바꿔도 이 값으로 계속 계산된다
    unitPriceSnapshot: cloneRates(overrides.unitPriceSnapshot || DEFAULT_RATES),
    ...overrides,
  };
}

function scopes(on = {}) {
  const base = emptyWasteScopes();
  Object.entries(on).forEach(([k, area]) => {
    base[k] = { on: true, area };
  });
  return base;
}

const SEED_CASES = [
  baseCase({
    id: 'case-demolition',
    createdAt: '2026-11-14',
    title: '안동 풍산읍 15평 상가 원상복구 철거',
    clientName: '김 사장님',
    clientPhone: '010-0000-0001',
    location: '안동시 풍산읍 상가 2층',
    region: '안동',
    trade: 'demolition',
    sizeValue: 15,
    sizeUnit: '평',
    notes: '집게차 포함, 천장 텍스·경량벽체·데코타일 철거. 2층, 엘베 없음.',
    supplement: '',
    design: { preset: 'value', keywords: '철거 원상복구', details: [] },
    waste: { scopes: scopes({ floor: 45, ceiling: 45, wall: 10 }), trucks: 3, heavy: false, applyActual: false, actualCost: 0, assignMode: 'separated' },
    asbestos: { builtYear: '1996', usage: 'nonhouse', ceiling: 'tex', roof: 'unknown', insulation: 'no', areaSqm: '45' },
    lifting: { floor: 2, elevator: 'no', ladderAllowed: 'no', carryDistance: 20, mode: 'carry' },
    survey: { noElevator: true, longCarry: false, wasteIncluded: true, scopeCreep: true, protectLevel: true },
    evidence: { floor: true, wall: true, ceiling: true, hallway: true, elevator: true, neighbor: false },
    marginRate: 20,
    customClientPrice: 374,
    stage: 'balance',
    collection: 'balance_wait',
    paidAmount: 330,
    gates: {
      deposit: true,
      lift: { notice: true, protect: true, neighbor: true, ladder: true },
      waterproof: { startedAt: '', checks: {}, belowOk: false },
      separate: true,
      plan: true,
      evidence: true,
      donePhoto: true,
      defect: false,
      balancePaid: false,
    },
    dispatch: { date: '2026-11-15', time: '08:00', vehicle: '1톤 포터', safetyEdu: true },
  }),
  baseCase({
    id: 'case-wallpaper',
    createdAt: '2026-11-18',
    title: '포항 두호동 24평 빌라 도배·장판',
    clientName: '이 주무관',
    clientPhone: '010-0000-0002',
    location: '포항시 북구 두호동 빌라 3층',
    region: '포항',
    trade: 'wallpaper',
    sizeValue: 24,
    sizeUnit: '평',
    notes: '합지 + 1.8T 장판 실속형, 엘베 없음 3층, 빈집.',
    design: { preset: 'wood', keywords: '화이트 우드 밝게', details: [] },
    waste: { scopes: scopes({ floor: 55 }), trucks: 1, heavy: false, applyActual: false, actualCost: 0, assignMode: 'separated' },
    lifting: { floor: 3, elevator: 'no', ladderAllowed: 'yes', carryDistance: 15, mode: 'carry' },
    survey: { noElevator: true, residential: false, wasteIncluded: true },
    marginRate: 20,
    customClientPrice: 324,
    stage: 'survey',
    collection: 'deposit_wait',
    paidAmount: 0,
    gates: { deposit: false, lift: { notice: false, protect: false, neighbor: false, ladder: false } },
    dispatch: { date: '2026-11-22', time: '08:00', vehicle: '1톤 포터', safetyEdu: true },
  }),
  baseCase({
    id: 'case-bathroom',
    createdAt: '2026-11-12',
    title: '구미 형곡동 32평 아파트 욕실 1칸',
    clientName: '박영희 고객님',
    clientPhone: '010-0000-0003',
    location: '구미시 형곡동 아파트 8층',
    region: '구미',
    trade: 'bathroom',
    sizeValue: 1,
    sizeUnit: '칸',
    notes: '전체 철거 후 600각 포세린, 아메리칸스탠다드 도기.',
    design: { preset: 'premium', keywords: '호텔식 욕실', details: [] },
    asbestos: { builtYear: '1997', usage: 'house', ceiling: 'tex', roof: 'unknown', insulation: 'no', areaSqm: '12' },
    waste: { scopes: scopes({ tile: 12, fixture: 0 }), trucks: 1, heavy: true, applyActual: false, actualCost: 0, assignMode: 'separated' },
    lifting: { floor: 8, elevator: 'yes', ladderAllowed: 'unknown', carryDistance: 20, mode: 'elevator' },
    survey: { protectLevel: true, wasteIncluded: true },
    marginRate: 30,
    customClientPrice: 480,
    stage: 'prelim',
    collection: 'deposit_wait',
    paidAmount: 0,
  }),
  baseCase({
    id: 'case-kitchen',
    createdAt: '2026-11-05',
    title: '안동 용상동 주방 3.2m 싱크대 교체',
    clientName: '최민수 고객님',
    clientPhone: '010-0000-0004',
    location: '안동시 용상동 아파트 5층',
    region: '안동',
    trade: 'kitchen',
    sizeValue: 3.2,
    sizeUnit: 'm',
    notes: '기본형(무늬 필름) 싱크대 + 인조대리석 상판, 기존 후드 재사용.',
    design: { preset: 'modern', keywords: '모던 화이트', details: [] },
    waste: { scopes: scopes({ kitchen: 4 }), trucks: 1, heavy: false, applyActual: false, actualCost: 0, assignMode: 'separated' },
    lifting: { floor: 5, elevator: 'yes', ladderAllowed: 'unknown', carryDistance: 25, mode: 'elevator' },
    survey: { residential: true, protectLevel: true, wasteIncluded: true },
    marginRate: 25,
    customClientPrice: 450,
    stage: 'working',
    collection: 'mid_paid',
    paidAmount: 260,
    gates: {
      deposit: true,
      lift: { notice: true, protect: true, neighbor: true, ladder: false },
      demo: true,
      water: true,
      gas: true,
      measure: true,
      donePhoto: false,
      defect: false,
      balancePaid: false,
    },
    dispatch: { date: '2026-11-19', time: '08:30', vehicle: '1톤 포터', safetyEdu: true },
  }),
  baseCase({
    id: 'case-closed-wall',
    createdAt: '2026-10-28',
    title: '안동 옥동 32평 실크 도배·장판',
    clientName: '정 사장님',
    clientPhone: '010-0000-0005',
    location: '안동시 옥동 아파트 12층',
    region: '안동',
    trade: 'wallpaper',
    sizeValue: 32,
    sizeUnit: '평',
    notes: '실크 벽지 + 2.2T 장판, 엘베 사용.',
    marginRate: 20,
    customClientPrice: 452,
    stage: 'closed',
    collection: 'settled',
    paidAmount: 452,
    lifting: { floor: 12, elevator: 'yes', ladderAllowed: 'unknown', carryDistance: 20, mode: 'elevator' },
    gates: { deposit: true, lift: { notice: true, protect: true, neighbor: true, ladder: false }, strip: true, primer: true, dry: true, donePhoto: true, defect: true, balancePaid: true },
  }),
  baseCase({
    id: 'case-closed-demo',
    createdAt: '2026-10-15',
    title: '예천읍 20평 상가 철거',
    clientName: '한 대표님',
    clientPhone: '010-0000-0006',
    location: '예천군 예천읍 상가 1층',
    region: '예천',
    trade: 'demolition',
    sizeValue: 20,
    sizeUnit: '평',
    notes: '경량벽체·천장 철거, 집게차 1회, 1층.',
    marginRate: 20,
    customClientPrice: 520,
    stage: 'closed',
    collection: 'settled',
    paidAmount: 520,
    lifting: { floor: 1, elevator: 'no', ladderAllowed: 'yes', carryDistance: 10, mode: 'carry' },
    gates: { deposit: true, lift: { notice: true, protect: true, neighbor: true, ladder: true }, separate: true, plan: true, evidence: true, donePhoto: true, defect: true, balancePaid: true },
  }),
];

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.cases) && parsed.cases.length > 0) {
        const settings = { ...defaultState().settings, ...(parsed.settings || {}) };
        // 예전에 저장된 현장은 지금 설정 단가를 한 번 복사해 고정한다 (이후 설정 변경에 영향 없음)
        const cases = parsed.cases.map((c) => ({
          ...c,
          unitPriceSnapshot: c.unitPriceSnapshot || mergeRates(DEFAULT_RATES, settings.rates || {}),
        }));
        return { ...defaultState(), ...parsed, settings, cases };
      }
    }
  } catch (e) {
    console.warn('저장된 장부를 읽지 못했습니다.', e);
  }
  return defaultState();
}

export function defaultState() {
  return {
    version: 1,
    cases: SEED_CASES,
    settings: { apiKey: '', region: '안동', businessName: '경북 철거·인테리어', useAi: false, agencyFeeRate: 10, rates: cloneRates(DEFAULT_RATES) },
    lastSaved: '',
  };
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, lastSaved: new Date().toISOString() }));
    return true;
  } catch (e) {
    console.warn('저장 실패', e);
    return false;
  }
}

export function resetState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // ignore
  }
  return defaultState();
}

export function newCase(trade = 'demolition', rates = null) {
  const snapshot = cloneRates(rates || DEFAULT_RATES);
  return baseCase({
    trade,
    title: '새 현장',
    sizeUnit: TRADES[trade]?.defaultUnit || '평',
    unitPriceSnapshot: snapshot,
    bufferRate: Number(snapshot.buffer ?? 6),
  });
}
