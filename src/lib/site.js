// 현장 조건 → 부대비용 자동 포함.
// "왜 보양·폐기물·양중·관리사무소 신고·준공 청소가 빠졌다고 경고만 뜨나?" 문제를 없애기 위해,
// 현장 성격(아파트/단독·층수·엘베·공종·외부 작업)을 보고 처음부터 견적에 넣는다.
// 사용자가 한 번이라도 직접 끄면(survey[id] === false) 그 선택이 자동 포함보다 우선한다.
import { getRate, ratesOf } from './rates.js';
import { bathroomDemoOnly, kitchenDemoOnly } from './scope.js';

// 평 환산 (pricing.js와 같은 기준 — 순환 import를 피하려고 여기서 계산한다)
function pyungOf(sizeValue, sizeUnit, fallback = 15) {
  const v = parseFloat(sizeValue);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  const unit = sizeUnit || '평';
  if (unit === '평') return v;
  if (unit === '㎡') return Math.max(1, +(v / 3.3).toFixed(1));
  if (unit === '칸') return +(v * 1.8).toFixed(1);
  if (unit === 'm') return +(v * 1.5).toFixed(1);
  if (unit === '개') return +(v * 1.2).toFixed(1);
  if (unit === '톤') return +(v * 4).toFixed(1);
  return fallback;
}

const MULTI_UNIT = /아파트|오피스텔|빌라|상가|사무실|오피스|근린|상업|매장|식당|음식점|카페|학원|병원|약국|관공서|학교|빌딩|건물/;
const DETACHED = /단독|구옥|주택|농가|전원|한옥|창고|데크|외부|옥외|야외|마당|담장|공장/;
const OUTDOOR = /간판|외부|옥외|야외|데크|창고|담장|울타리|펜스|주차장|옥상|지붕|루프|실외기/;
// 준공 청소가 원래 붙는 '마감' 공종 — 철거·폐기물·토목·인력은 청소를 별도로 잡지 않는다
const CLEAN_TRADES = ['wallpaper', 'bathroom', 'kitchen', 'tilewaterproof', 'plaster', 'repair', 'film', 'carpentry', 'window', 'combined', 'custom'];

export const SITE_ITEMS = [
  { id: 'protectLevel', label: '보양(엘베·복도·현관)', why: '공용부 파손은 우리가 배상' },
  { id: 'adminDeposit', label: '관리사무소 신고·동의서', why: '신고 없이 착공하면 중단될 수 있음' },
  { id: 'materialLift', label: '자재 양중(층까지 올리기)', why: '엘베 없으면 인력이 하루 더 듦' },
  { id: 'afterCare', label: '준공 청소', why: '준공 검수에서 가장 많이 지적되는 항목' },
];

// 이 현장이 어떤 성격인지 (실내/외부, 공용부가 있는 건물인지, 층·엘베)
export function siteContext(c) {
  const text = [c?.rawInput, c?.notes, c?.title, c?.location, c?.tradeName].filter(Boolean).join(' ');
  const trade = c?.trade || 'unclassified';
  const partial = !!(c?.demolition?.mode === 'partial');
  const floor = parseInt(c?.lifting?.floor, 10) || 0;
  const elevator = c?.lifting?.elevator || 'unknown';
  const smallOrWaste = trade === 'waste' || trade === 'labor' || trade === 'groundwork' || partial;
  const outdoor = partial
    ? !!c?.demolition?.exterior
    : OUTDOOR.test(text) && !/실내|내부|아파트\s*내/.test(text);
  const multiUnit = MULTI_UNIT.test(text);
  const detached = DETACHED.test(text);
  const indoor = !smallOrWaste && !outdoor && !detached;
  return { trade, floor, elevator, outdoor, multiUnit, detached, partial, smallOrWaste, indoor, text };
}

// 조건별 자동 포함 여부 + 이유
export function autoIncidentals(c) {
  const ctx = siteContext(c);
  const reason = {};
  const out = { protectLevel: false, adminDeposit: false, materialLift: false, afterCare: false };

  if (ctx.indoor) {
    // 보양은 공용부(엘베·복도)가 있는 건물의 실내 작업에만
    if (ctx.multiUnit || ctx.floor >= 2) {
      out.protectLevel = true;
      reason.protectLevel = ctx.multiUnit ? '공용부가 있는 건물' : `${ctx.floor}층 실내 작업`;
    }
    if (ctx.multiUnit) {
      out.adminDeposit = true;
      reason.adminDeposit = '관리사무소가 있는 건물';
    }
    if (ctx.floor >= 2 && ctx.elevator !== 'yes') {
      out.materialLift = true;
      reason.materialLift = '엘베 없이 계단 양중';
    }
    // 준공 청소는 '마감'이 있는 현장만 — 철거+정지처럼 마감이 없으면 붙이지 않는다.
    // 욕실·주방도 '철거만' 하는 현장이면 청소할 마감이 없다.
    const demoOnly = bathroomDemoOnly(c) || kitchenDemoOnly(c);
    const cleanTrade = CLEAN_TRADES.includes(ctx.trade) && ctx.trade !== 'combined' && !demoOnly;
    if (cleanTrade || c?.fullInterior) {
      out.afterCare = true;
      reason.afterCare = '마감 공정 — 준공 검수 대비';
    }
  }
  return { ...out, reason, ctx };
}

// 실제 계산에 쓰는 survey — 자동 포함 + 사용자가 직접 켜고 끈 값
export function resolveSurvey(c) {
  const auto = autoIncidentals(c);
  const survey = { ...(c?.survey || {}) };
  ['protectLevel', 'adminDeposit', 'materialLift', 'afterCare'].forEach((id) => {
    if (survey[id] === undefined || survey[id] === null) survey[id] = !!auto[id];
  });
  return survey;
}

// 현장 부대비용 목록 — 화면·검증에서 같은 금액을 쓴다.
export function siteCostRows(c) {
  const rates = ratesOf(c);
  const survey = resolveSurvey(c);
  const auto = autoIncidentals(c);
  const amounts = c?.surveyAmounts || {};
  const pick = (id, fallback) => {
    const raw = amounts[id];
    if (raw === null || raw === undefined || raw === '') return fallback;
    const num = Number(raw);
    return Number.isFinite(num) && num >= 0 ? num : fallback;
  };
  const pyung = pyungOf(c?.sizeValue, c?.sizeUnit, 15);
  const spots = Math.max(1, parseInt(c?.protectSpots, 10) || 1);
  const cleanPeople = Math.max(1, Math.ceil(pyung / 20));
  const cleanRate = getRate(rates, ['labor', 'cleaner'], 19);
  const fallback = {
    protectLevel: getRate(rates, ['site', 'protect'], 8) * spots,
    adminDeposit: getRate(rates, ['site', 'adminReport'], 8),
    materialLift: getRate(rates, ['site', 'materialLift'], 15),
    afterCare: Math.round(cleanPeople * cleanRate),
  };
  return SITE_ITEMS.map((item) => ({
    ...item,
    amount: pick(item.id, fallback[item.id]),
    on: !!survey[item.id],
    auto: auto[item.id] ? auto.reason[item.id] || '현장 조건' : '',
    userSet: c?.survey?.[item.id] === true || c?.survey?.[item.id] === false,
  }));
}
