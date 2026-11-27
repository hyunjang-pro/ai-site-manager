// ── 시세 상식 검증 엔진 (v3.20) ─────────────────────────────────────────
// 견적 엔진이 낸 고객가가 그 공종·규모의 **현실 시세**를 벗어나지 않게 막는 마지막 층.
//
// 범위는 네 값이다.  [min, low, high, max]   (만원 · 부가세 별도)
//   min  — 이보다 싸면 사장님이 손해다(과도하게 낮음) → 마진을 올려 하한까지 끌어올린다
//   low~high — '보통 시세' 구간. 화면의 「보통 시세 안내」가 이 값을 그대로 읽어 준다
//   high — 넘으면 조금 비싼 편(수주는 되지만 설명이 필요)
//   max  — 넘으면 수주가 안 되는 비정상 상한 → 마진·예비비를 낮춰 안으로 넣는다
//
// 근거: 2026년 공개 실견적·지역 시세 집계(reference.js 41건), 집지니·숨고·얼마드나 공개 견적,
//       경북 인력사무소 시세, 폐기물 처리업체 차량 단가표. 상세 근거는 각 공종 주석에 적었다.
//       금액은 모두 만원이며 부가세 별도(견적의 clientPrice와 같은 기준)다.

const R = (v) => Math.round(Number(v) || 0);
const num = (v, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};
// 규모가 작을 때도 최소선을 지킨다 — 출동·실측·마감 최소비
const atLeast = (floorWon, per, n) => R(Math.max(floorWon, per * n));
const trim1 = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10));

// ── 공종별 시세 범위표 ───────────────────────────────────────────────
export const MARKET_BANDS = {
  // 철거·원상복구 — 안동·경북 상가 원상복구 평당 18~28만(중간 23),
  // 아파트 마감 철거 평당 3~12만(집지니 24평 439 · 34평 115 · 25평 297), 품목 철거는 개수 단위(간판 2개 45~105).
  demolition: {
    name: '철거',
    nameOf: (kind) =>
      kind === 'partial' ? '철거' : kind === 'finish' ? '마감 철거' : kind === 'structural' ? '건물 전체 철거' : '철거·원상복구',
    basis: '경북 상가 원상복구 평당 18~28만 · 주거 마감 철거 평당 3~12만 · 품목 철거는 개수 기준',
    range: ({ n, kind }) => {
      const p = n;
      if (kind === 'partial') return { min: 15, low: 25, high: 130, max: 320 };
      if (kind === 'finish') return { min: atLeast(20, 1.5, p), low: atLeast(40, 3.5, p), high: atLeast(120, 9, p), max: atLeast(220, 18, p) };
      if (kind === 'structural') return { min: atLeast(150, 10, p), low: atLeast(300, 22, p), high: atLeast(600, 45, p), max: atLeast(900, 70, p) };
      return { min: atLeast(40, 3, p), low: atLeast(80, 7, p), high: atLeast(300, 26, p), max: atLeast(520, 38, p) };
    },
  },
  // 도배·장판 — 24평 합지+장판 149만 · 실크+2.2T 245만 · 15평 원룸 120~165만 · 강마루 15만/평(32평 515만)
  wallpaper: {
    name: '도배·장판',
    basis: '24평 합지+장판 149만 · 실크+2.2T 245만 · 강마루 15만/평 · 15평 원룸 120~165만',
    range: ({ n }) => ({ min: atLeast(25, 2.2, n), low: atLeast(50, 5.5, n), high: atLeast(150, 17, n), max: atLeast(300, 27, n) }),
  },
  // 욕실 — 올수리 380~700만/칸(지역 538) · 타일만 250~400만(309) · 철거만 100~230만 · 2칸 올수리 700~1350만
  bathroom: {
    name: '욕실 공사',
    basis: '올수리 380~700만/칸 · 타일만 250~400만 · 철거만 100~230만 · 2칸 올수리 700~1,350만',
    range: ({ n }) => ({ min: atLeast(40, 70, n), low: atLeast(90, 240, n), high: atLeast(430, 630, n), max: atLeast(650, 820, n) }),
  },
  // 주방 — 싱크대 3m 교체 300~560만(274건 중간값 3.2m 451) · 상판만 100~220만 · 철거만 20~80만
  kitchen: {
    name: '주방·싱크대',
    basis: '싱크대 3m 교체 300~560만 · 상판만 100~220만 ·철거만 20~80만',
    range: ({ n }) => ({ min: atLeast(25, 20, n), low: atLeast(60, 75, n), high: atLeast(260, 175, n), max: atLeast(420, 225, n) }),
  },
  // 폐기물 — 차량 실비 반차 26~30만 · 1톤 40~55만 · 2.5톤 70~80만 + 올바로 등록,
  // 처리업체가 손님에게 부르는 값은 여기에 진행비 10~15%를 얹은 선(반차 30~35 · 1톤 45~55 · 2.5톤 85~95).
  // 5톤 이상은 톤당 34~45만(2.5톤차 2대 · 혼합 반출 시 +40%).
  waste: {
    name: '폐기물',
    basis: '차량 실비 반차 26만·1톤 42.5만·2.5톤 75만 + 올바로 등록 · 진행비 10~15% 반영',
    range: ({ n }) => {
      const t = Math.max(0.5, n);
      if (t <= 0.7) return { min: 24, low: 30, high: 35, max: 45 };
      if (t <= 1.5) return { min: 35, low: 45, high: 55, max: 72 };
      if (t <= 3) return { min: 65, low: 85, high: 95, max: 110 };
      return { min: R(t * 26), low: R(t * 34), high: R(t * 45), max: R(t * 56) };
    },
  },
  // 인력 지원 — 1명 1일 청구 26만(기능공 32만) · 3명 2일 156만 · 3명 5일 390만
  labor: {
    name: '인력 지원',
    basis: '1명 1일 청구 26만(기능공 32만) · 4대보험·안전관리 포함',
    range: ({ n }) => ({ min: atLeast(15, 14, n), low: atLeast(24, 22, n), high: atLeast(40, 36, n), max: atLeast(70, 60, n) }),
  },
  // 타일·방수 — 소규모 방수+타일 45~110만 · 옥상 20평 우레탄 190~340만 · ㎡당 자재+시공 2.7~7.7만
  tilewaterproof: {
    name: '타일·방수',
    basis: '소규모 방수+타일 45~110만 · 옥상 20평 우레탄 190~340만 · ㎡당 2.7~7.7만',
    range: ({ n }) => ({ min: atLeast(28, 3.5, n), low: atLeast(45, 6.5, n), high: atLeast(100, 16, n), max: atLeast(170, 28, n) }),
  },
  // 바닥 미장 — 20㎡ 50~72만 · 상가 40㎡ 90~130만 · 10평 174만(지역)
  plaster: {
    name: '바닥 미장',
    basis: '20㎡ 50~72만 · 상가 40㎡ 90~130만',
    range: ({ n }) => ({ min: atLeast(25, 2, n), low: atLeast(40, 3.2, n), high: atLeast(90, 8, n), max: atLeast(180, 16, n) }),
  },
  // 창호 — 발코니 6㎡ 시스템창 150~210만 · 12㎡ 교체 300~390만 (철거·방충망 포함 시 220~420만)
  window: {
    name: '창호',
    basis: '발코니 6㎡ 150~210만 · 12㎡ 300~390만',
    range: ({ n }) => ({ min: atLeast(30, 14, n), low: atLeast(60, 22, n), high: atLeast(220, 60, n), max: atLeast(400, 90, n) }),
  },
  // 부분 수선 — 문틀 1개소 15~25만 · 실리콘·타일 보수 3개소 28~45만 · 방충망 짝당 3.5만+시공 ·
  // 중문 3연동 55~150만 · 도장은 ㎡당 0.4~2만(20평 벽·천장 수성 143만, 외벽 발수 246만)
  repair: {
    name: '부분 수선',
    nameOf: (kind) => (kind === 'area' ? '도장' : '부분 수선'),
    basis: '문틀 15~25만/개소 · 방충망 3.5만/짝+시공 · 중문 55~150만 · 도장 ㎡당 0.4~2만',
    range: ({ n, kind }) => {
      if (kind === 'area') return { min: atLeast(20, 0.5, n), low: atLeast(30, 0.8, n), high: atLeast(100, 3.2, n), max: atLeast(180, 5, n) };
      return { min: atLeast(15, 9, n), low: atLeast(25, 18, n), high: atLeast(90, 140, n), max: atLeast(220, 260, n) };
    },
  },
  // 목공 — 문·문틀·몰딩 개당 15~35만 · 가벽 4m 130~400만 · 이보드 12m 70~220만
  carpentry: {
    name: '목공',
    basis: '문·문틀·몰딩 15~35만/개 · 가벽 4m 130~400만 · 이보드 12m 70~220만',
    range: ({ n }) => ({ min: atLeast(15, 8, n), low: atLeast(30, 16, n), high: atLeast(110, 58, n), max: atLeast(240, 100, n) }),
  },
  // 전기·조명 — LED 등기구 전체 교체 70~180만 · 콘센트 개소당 12~20만 · 레일조명 15개 90~160만
  electric: {
    name: '전기·조명',
    basis: 'LED 등기구 교체 70~180만 · 콘센트 개소당 12~20만 · 레일조명 15개 90~160만',
    range: ({ n }) => ({ min: atLeast(20, 5, n), low: atLeast(30, 11, n), high: atLeast(60, 32, n), max: atLeast(110, 55, n) }),
  },
  // 설비·배관 — 수전 교체 20~80만 · 변기 18~25만 · 세면대 25~50만 · 배관 3개소 60~180만
  plumbing: {
    name: '설비·배관',
    basis: '수전 교체 20~80만 · 변기 18~25만 · 세면대 25~50만',
    range: ({ n }) => ({ min: atLeast(18, 8, n), low: atLeast(30, 20, n), high: atLeast(60, 50, n), max: atLeast(100, 90, n) }),
  },
  // 필름 — ㎡당 1.8~2.5만(자재+시공) · 34평 샷시·문짝·싱크대 리폼 200~450만
  film: {
    name: '필름',
    basis: '㎡당 1.8~2.5만 · 34평 샷시·문짝·싱크대 리폼 200~450만',
    range: ({ n }) => ({ min: atLeast(18, 2.5, n), low: atLeast(30, 4, n), high: atLeast(95, 13, n), max: atLeast(170, 22, n) }),
  },
  // 기초·정지 — 미니굴삭기 25~40만/일 · 20㎡ 1일 124만 · 40㎡ 2일 246만
  groundwork: {
    name: '기초·정지',
    basis: '미니굴삭기 25~40만/일 · 20㎡ 1일 124만',
    range: ({ n }) => ({ min: atLeast(25, 1.8, n), low: atLeast(40, 3.2, n), high: atLeast(100, 7.5, n), max: atLeast(220, 15, n) }),
  },
  // 복합 인테리어 — 15평 1,450~2,100만 · 24평 2,100~2,900만 · 32평 올수리 3,000~4,500만
  combined: {
    name: '복합 인테리어',
    basis: '15평 1,450~2,100만 · 24평 2,100~2,900만 · 32평 올수리 3,000~4,500만',
    range: ({ n }) => ({ min: atLeast(40, 10, n), low: atLeast(100, 20, n), high: atLeast(600, 140, n), max: atLeast(900, 200, n) }),
  },
  // 기타 — 손님이 인부·자재·장비를 직접 넣는 현장. 범위를 넓게 두고 조정은 하지 않는다(사용자가 정한 값).
  custom: {
    name: '현장',
    basis: '현장 조건별 직접 입력',
    range: () => ({ min: 30, low: 100, high: 1200, max: 4000 }),
  },
  unclassified: {
    name: '현장',
    basis: '공종 확정 전',
    range: () => ({ min: 30, low: 100, high: 1200, max: 4000 }),
  },
};

const toPyeong = (v, unit) => {
  switch (unit) {
    case '평':
      return v;
    case '㎡':
      return v / 3.3;
    case '칸':
      return v * 1.8;
    case 'm':
      return v * 1.5;
    case '개':
    case '짝':
    case '개소':
      return v * 1.2;
    case '톤':
      return v * 4;
    default:
      return v;
  }
};

// 손님이 말한 단위를 그 공종의 시세 단위로 바꾼다 (평·㎡·칸·m·톤·개소·명·일).
export function bandScale(trade, ctx = {}) {
  const raw = num(ctx.sizeValue, 0);
  const unit = ctx.sizeUnit || '평';
  const has = raw > 0 && unit !== '모름';
  const p = has ? toPyeong(raw, unit) : 0;
  const missing = (label) => ({ n: 0, unit: label, label: '' });

  switch (trade) {
    case 'kitchen': {
      const m = has && unit === 'm' ? raw : 3.2;
      return { n: m, unit: 'm', label: `${trim1(m)}m` };
    }
    case 'bathroom': {
      const k = has ? (unit === '칸' ? raw : Math.max(1, R(p / 1.8))) : 1;
      return { n: k, unit: '칸', label: `${k}칸` };
    }
    case 'waste': {
      const t = num(ctx.tons, 0) || (has && unit === '톤' ? raw : 1);
      return { n: t, unit: '톤', label: `${trim1(t)}톤` };
    }
    case 'labor': {
      const people = Math.max(1, num(ctx.people, 1));
      const days = Math.max(1, num(ctx.days, 1));
      return { n: people * days, unit: '명·일', label: `${people}명 ${days}일` };
    }
    case 'tilewaterproof':
    case 'plaster':
    case 'window':
    case 'film':
    case 'groundwork': {
      const a = has ? (unit === '㎡' ? raw : p * 3.3) : trade === 'window' ? 6 : 20;
      return { n: a, unit: '㎡', label: `${R(a)}㎡` };
    }
    case 'carpentry': {
      const m = has ? (unit === 'm' ? raw : unit === '개' || unit === '개소' || unit === '짝' ? raw * 1.5 : p * 1.5) : 3;
      return { n: m, unit: 'm', label: `${trim1(m)}m` };
    }
    case 'electric':
    case 'plumbing': {
      const spots = has ? (unit === '평' ? Math.max(1, R(raw * 0.2)) : Math.max(1, raw)) : 1;
      return { n: spots, unit: '개소', label: `${R(spots)}개소` };
    }
    case 'repair': {
      const paintLike = /페인트|도장|도색|탄성|발수/.test(String(ctx.notes || ''));
      if (paintLike && has && (unit === '평' || unit === '㎡')) {
        // 도장은 바닥면적이 아니라 벽·천장 면적(평당 약 6.3㎡)으로 본다
        const a = unit === '㎡' ? raw : raw * 6.3;
        return { n: a, unit: '㎡', label: `${R(a)}㎡`, kind: 'area' };
      }
      const spots = has ? Math.max(1, raw) : 1;
      return { n: spots, unit: '개소', label: `${trim1(spots)}개소`, kind: 'spot' };
    }
    case 'demolition':
    case 'wallpaper':
    case 'combined':
    case 'custom':
    case 'unclassified':
    default: {
      if (!has) return missing('평');
      const show = unit === '평' ? raw : Math.round(p * 10) / 10;
      return { n: p, unit: '평', label: `${trim1(show)}평` };
    }
  }
}

// 그 현장의 시세 범위. kind(철거: partial·finish·structural·restore / 수선: area·spot)를 반영한다.
export function marketBand(ctx = {}) {
  const trade = MARKET_BANDS[ctx.trade] ? ctx.trade : 'custom';
  const table = MARKET_BANDS[trade];
  const scale = bandScale(trade, ctx);
  const r = table.range({ n: scale.n, kind: ctx.kind || scale.kind }, ctx);
  const kind = ctx.kind || scale.kind;
  // 화면에 읽어 주는 보통 시세는 5만원 단위로 둔다 (어머님이 읽기 쉽게)
  const to5 = (v) => Math.max(0, Math.round(v / 5) * 5);
  return {
    trade,
    name: table.nameOf ? table.nameOf(kind) : table.name,
    basis: table.basis,
    sizeLabel: scale.label,
    n: scale.n,
    unit: scale.unit,
    min: R(r.min),
    low: to5(r.low),
    high: to5(r.high),
    max: R(r.max),
  };
}

export function marketPosition(price, band) {
  if (!band || !(price > 0)) return 'none';
  if (price < band.min) return 'below';
  if (price > band.max) return 'over';
  if (price < band.low) return 'lowish';
  if (price > band.high) return 'highish';
  return 'in';
}

// ── 자동 보정 ────────────────────────────────────────────────────────
// price 는 '할증(야간·지하·양중 같은 현장 할증)을 뺀' 금액으로 넘긴다.
// 마진 계산식(고객가 = 원가×(1+예비비) ÷ (1−마진))을 그대로 뒤집어 쓴다.
export function marketSanity(ctx = {}) {
  const band = marketBand(ctx);
  const price = Math.max(0, R(ctx.price));
  const base = {
    trade: band.trade,
    band,
    price,
    position: marketPosition(price, band),
    checked: false,
    adjusted: false,
    locked: !!ctx.locked,
    // 관공서 공고는 낙찰금액(수주금액)이 정해져 있다 — 시세 범위로 재단하지 않는다
    disabled: ctx.disabled || '',
  };
  if (base.disabled) return base;
  if (!(price > 0) || !band) return base;

  const cost = Math.max(0, Number(ctx.cost) || 0);
  const baseCost = Math.max(0, Number(ctx.baseCost) || cost);
  const bufferRate = Math.max(0, Math.min(15, Number(ctx.bufferRate) || 0));
  const margin = Math.max(0, Number(ctx.margin) || 0);
  const scale = baseCost * (1 + bufferRate / 100);

  const out = { ...base, checked: true, cost, margin, bufferRate, fromMargin: margin, fromBuffer: bufferRate };

  // 내가 부른 금액·직접 입력가·공고 수주금액은 사장님이 정한 값이다 — 바꾸지 않고 판정만 한다.
  if (out.locked) return out;
  if (out.position === 'in' || out.position === 'lowish' || out.position === 'highish') return out;

  if (out.position === 'over') {
    // ① 마진을 시세 상한까지 낮춘다 (최소 3%는 남긴다)
    const solve = (buf) => {
      const s = baseCost * (1 + buf / 100);
      return { s, m: (1 - s / band.max) * 100 };
    };
    let next = solve(bufferRate);
    let nextBuffer = bufferRate;
    if (next.m < 3) {
      next = solve(0);
      nextBuffer = 0;
    }
    if (next.m < 3) {
      // 원가 자체가 시세 상한을 넘는다 — 물량·범위가 잘못 들어온 현장이다. 가격을 억지로 낮추지 않는다.
      return { ...out, cannotFix: 'costAboveMax', note: '원가가 이미 시세 상한을 넘었어요' };
    }
    const m = Math.round(Math.min(margin, next.m) * 10) / 10;
    return {
      ...out,
      adjusted: true,
      direction: 'down',
      margin: m,
      bufferRate: nextBuffer,
      target: band.max,
      reason: `시세 상한(${band.max}만)을 넘어서 남는 비율을 ${trim1(out.fromMargin)}%에서 ${trim1(m)}%로 낮췄어요.`,
    };
  }

  // position === 'below' — 시세 하한보다 싸다. 마진을 올려 하한까지 올린다(최대 60%).
  const m = (1 - scale / band.min) * 100;
  if (!(m > margin)) return out;
  const m2 = Math.round(Math.min(60, m) * 10) / 10;
  const achieved = scale / (1 - m2 / 100);
  const capped = m2 < m - 0.2 || achieved < band.min * 0.98;
  return {
    ...out,
    adjusted: true,
    direction: 'up',
    margin: m2,
    bufferRate,
    target: band.min,
    capped,
    reason: capped
      ? `원가(${R(scale)}만)가 너무 낮아 남는 비율을 최대(60%)로 올려도 시세 하한(${band.min}만)에 못 미쳤어요. 단가표를 확인하세요.`
      : `시세 하한(${band.min}만)보다 싸서 남는 비율을 ${trim1(out.fromMargin)}%에서 ${trim1(m2)}%로 올렸어요.`,
  };
}

// ── 화면 문장 ────────────────────────────────────────────────────────
// 어머님이 그대로 읽어도 뜻이 통하는 일상어로만 쓴다. 전문용어·영어·이모지 금지.
export function marketHeadline(band) {
  if (!band) return '';
  const size = band.sizeLabel ? `${band.sizeLabel} ` : '';
  return `보통 ${size}${band.name} 시세는 ${band.low}~${band.high}만 원 선이에요.`;
}

export function marketWhy(s = {}) {
  const { band, price, cost, margin, parts = {}, position, trade, adjusted } = s;
  if (!band || !(price > 0)) return '';
  // 문장에 쓰는 금액은 화면에 보이는 견적가(현장 할증 포함)다 — 비교 범위만 할증을 뺀 값이다.
  const shown = R(s.fullPrice || price);
  const out = [];
  const p = parts || {};
  if (trade === 'waste' && p.vehicle > 0) {
    out.push(`차량 실비 ${R(p.vehicle)}만에 올바로 등록비 ${R(p.ticket)}만을 더해 ${R(cost)}만이 원가예요.`);
    out.push(`여기에 진행비 ${margin}%만 얹어 ${shown}만으로 잡았어요.`);
  } else if (trade === 'labor' && p.people > 0) {
    out.push(`${p.people}명 × ${p.days}일 × 하루 ${R(p.charge)}만으로 잡은 값이에요.`);
  } else if (trade === 'demolition' && p.crew > 0 && p.days > 0) {
    out.push(`원가 ${R(cost)}만 중 인부 ${p.crew}명 × ${p.days}일이 ${R(p.labor)}만, 폐기물이 ${R(p.waste)}만이에요.`);
    out.push(`남는 돈 ${margin}%만 붙여 ${shown}만으로 잡았어요.`);
  } else {
    const big = [
      ['인건비', p.labor],
      ['자재', p.material],
      ['폐기물', p.waste],
      ['장비', p.equip],
    ]
      .filter(([, v]) => Number(v) > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);
    if (big.length) out.push(`원가 ${R(cost)}만 중 ${big.map(([label, v]) => `${label} ${R(v)}만`).join(', ')}이 가장 커요.`);
    out.push(`여기에 남는 돈 ${margin}%만 붙여 ${shown}만으로 잡았어요.`);
  }
  if (Number(p.lifting) > 0 && Number(p.floor) >= 2) out.push(`엘베 없이 ${p.floor}층이라 양중비 ${R(p.lifting)}만이 더 붙었어요.`);
  if (adjusted) out.push(s.reason);
  else if (position === 'highish') out.push('보통보다 조금 높은 편이에요.');
  else if (position === 'lowish') out.push('보통보다 조금 낮게 잡혔어요. 남는 돈을 한 번 더 보세요.');
  else if (position === 'over') out.push('시세 상한을 넘었어요. 범위나 자재를 한 번 더 보세요.');
  else if (position === 'below') out.push('시세 하한보다 낮아요. 이대로면 남는 돈이 거의 없어요.');
  return out.slice(0, 3).join(' ');
}
