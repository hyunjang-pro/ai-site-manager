// 고객용 문서·문자 생성 모듈 — 공종별로 정확한 자재/스펙만 출력한다.
import { TRADES, COLLECTION_LABEL } from './constants';
import { wonFull, won, sizeText, clientSafeText } from './pricing';
import { assessAsbestos } from './asbestos';
import { subsidyInfo, SUBSIDY_DOCS, SUBSIDY_AGENCY } from './subsidy';
import { cleanOcrText } from './ocr.js';

// 사진 OCR·메모에서 온 날것 글자를 발주·배차 문자에 넣지 않는다.
function shortMemo(text, max = 44) {
  const clean = cleanOcrText(String(text || '')).replace(/\n+/g, ' ').trim();
  if (!clean) return '';
  const line = clean.split(/[.。/\n]/).map((x) => x.trim()).filter((x) => x.length >= 4)[0] || clean;
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

const EXCLUDED = {
  demolition: [
    '가전·가구 등 생활폐기물 반출(철거 전 고객 준비)',
    '유리·간판·에어컨 실외기 철거',
    '석면 발견 시 조사·해체·처리',
    '구조 보강·구조도면 작성',
    '전기·수도·가스 관청 인입공사',
  ],
  wallpaper: [
    '곰팡이·누수 보수 및 균열 보수',
    '가구 이동·가전 분리',
    '전기 배선·조명 교체',
    '문·몰딩 교체',
  ],
  bathroom: [
    '급배수 배관 교체(노후 배관)',
    '환풍기·욕실 환기 설비',
    '구조체 균열 보수',
    '욕실 가구·거울·선반',
    '바닥 방통 두께 조정',
  ],
  kitchen: [
    '후드·가스레인지·식기세척기 등 가전',
    '급배수·가스 배관 이설',
    '벽체 철거·구조 변경',
  ],
  combined: [
    '석면 발견 시 조사·해체·처리',
    '가전·가구 등 생활폐기물',
    '전기·수도·가스 승압 및 인입공사',
  ],
  unclassified: ['공종 확정 후 별도 협의'],
};

// 손님 견적서에 찍히는 공정 줄 — 원가 항목(노무·자재·폐기물)을 그대로 쓰지 않고
// 고객이 이해하는 '공정 이름'으로 묶은 뒤, 견적가를 그 비율대로 나눠 담는다.
// → 각 줄 금액의 합계는 최종 견적가와 100% 일치하고, 원가·마진은 역산할 수 없다.
const TRADE_GROUPS = {
  demolition: [
    { key: 'demo', name: '철거·해체 공사', desc: '천장·벽체·바닥 마감재 철거 및 해체', ids: ['labor'] },
    { key: 'waste', name: '폐기물 수거·반출·처리', desc: '성상 분리 후 차량 반출, 처리장 운반', ids: ['waste', 'waste_actual', 'grapple', 'waste_disposal', 'waste_truck'] },
    { key: 'consum', name: '철거 소모품·현장 정리', desc: '마대·보양·커터날 등 소모품', ids: ['consumables', 'ticket'] },
  ],
  wallpaper: [
    { key: 'wall', name: '도배 시공(벽지·부자재)', desc: '기존 벽지 제거·초배 후 벽지 시공', ids: ['wallpaper', 'submat', 'labor'] },
    { key: 'floor', name: '장판 시공', desc: '바닥 정리 후 장판 시공', ids: ['floor'] },
  ],
  bathroom: [
    { key: 'demo', name: '철거 및 폐기', desc: '기존 타일·도기 철거', ids: ['demolition'] },
    { key: 'water', name: '방수 및 담수시험', desc: '액체방수 2회 + 48시간 담수시험', ids: ['waterproof'] },
    { key: 'tile', name: '타일 시공(벽·바닥)', desc: '타일 자재 및 시공', ids: ['tile', 'labor'] },
    { key: 'fixture', name: '도기·수전 교체', desc: '양변기·세면대·수전·장 설치', ids: ['fixture'] },
    { key: 'waste', name: '욕실 폐기물 반출', desc: '타일·도기 수거 및 반출', ids: ['waste'] },
  ],
  kitchen: [
    { key: 'cab', name: '싱크대·상판 설치', desc: '상·하부장 및 상판 제작·설치', ids: ['sink', 'top'] },
    { key: 'work', name: '철거·설비·설치 공정', desc: '기존 싱크대 철거, 단수·가스 차단 후 설치', ids: ['labor', 'waste'] },
  ],
  tilewaterproof: [
    { key: 'tile', name: '타일 시공', desc: '타일 자재 및 시공', ids: ['tile', 'tile_labor'] },
    { key: 'water', name: '방수 및 담수시험', desc: '방수 2회 + 담수시험', ids: ['waterproof'] },
    { key: 'demo', name: '기존 마감 철거', desc: '기존 타일·마감 철거', ids: ['demolition'] },
    { key: 'waste', name: '폐기물 반출', desc: '철거재 수거·반출', ids: ['waste'] },
  ],
  plaster: [
    { key: 'plaster', name: '바닥 미장', desc: '몰탈 미장 및 양생', ids: ['plaster', 'mat'] },
    { key: 'tile', name: '타일 시공', desc: '타일 자재 및 시공', ids: ['tile', 'tile_labor'] },
    { key: 'waste', name: '폐기물·잔재 반출', desc: '몰탈 잔재·포대 반출', ids: ['waste'] },
  ],
  window: [
    { key: 'win', name: '창호·발코니 교체', desc: '창호 자재 및 시공', ids: ['window'] },
    { key: 'demo', name: '기존 창호 철거', desc: '유리·프레임 분리', ids: ['removal'] },
    { key: 'waste', name: '창호·유리 폐기물', desc: '분리 반출', ids: ['waste'] },
  ],
  waste: [
    { key: 'dispose', name: '폐기물 처리', desc: '중간처리 및 처리확인서', ids: ['waste_disposal'] },
    { key: 'truck', name: '수집·운반 차량', desc: '상차 및 처리장 운반', ids: ['waste_truck'] },
    { key: 'load', name: '상차·분리 인부', desc: '성상 분리 및 상차', ids: ['labor', 'ticket'] },
  ],
  labor: [
    { key: 'supply', name: '인력 지원', desc: '요청 인원·일수만큼 인력 파견', ids: ['labor'] },
    { key: 'insurance', name: '4대보험·안전관리', desc: '법정 보험 및 안전관리', ids: ['insurance'] },
  ],
  repair: [
    { key: 'repair', name: '부분 수선 작업', desc: '해당 부위 보수·교체', ids: ['labor', 'mat'] },
    { key: 'waste', name: '자재·잔재 정리', desc: '수선 후 정리', ids: ['waste'] },
  ],
  combined: [
    { key: 'demo', name: '철거·해체', desc: '기존 마감 철거', ids: ['labor'] },
    { key: 'mat', name: '자재·마감 시공', desc: '도배·타일·바닥 등 마감', ids: ['mat', 'wallpaper', 'floor', 'tile', 'fixture', 'sink', 'top'] },
    { key: 'waste', name: '폐기물 반출·처리', desc: '철거재 반출', ids: ['waste'] },
  ],
};
TRADE_GROUPS.custom = TRADE_GROUPS.combined;
TRADE_GROUPS.unclassified = TRADE_GROUPS.combined;

const SHARED_GROUPS = [
  { key: 'carry', name: '자재·폐기물 운반 및 보양', desc: '양중·운반·보양·현장 관리 포함', ids: ['lift', 'longCarry', 'noParking', 'narrowDoor', 'materialLift', 'ladderSmall', 'protect', 'residential', 'clean', 'worktime', 'cut', 'gas', 'adminDeposit', 'deposit'] },
  { key: 'structure', name: '구조·설비 보강', desc: '누수·배관·난방 보강 등 현장 조건 반영', ids: ['heating', 'leak', 'plumbing', 'loadBearing', 'asbestos'] },
  { key: 'detail', name: '선택 마감·디테일 추가', desc: '고객 요청 마감·디테일 공사', ids: ['design_detail'] },
  { key: 'min', name: '출동·마감 최소 반영', desc: '소규모 현장 출동·자재 하차·마감', ids: ['min_floor'] },
];

export function allocateClientLines(trade, calc) {
  const items = (calc?.items || []).filter((i) => !i.excluded && Number(i.amount) !== 0);
  const groups = [...(TRADE_GROUPS[trade] || TRADE_GROUPS.combined), ...SHARED_GROUPS].map((g) => ({ ...g, weight: 0 }));
  const idTo = new Map();
  groups.forEach((g) => g.ids.forEach((id) => idTo.set(id, g)));
  let leftover = 0;
  items.forEach((it) => {
    const g = idTo.get(it.id);
    const amount = Math.abs(Number(it.amount) || 0);
    if (g) g.weight += amount;
    else leftover += amount;
  });
  if (leftover > 0) {
    const carry = groups.find((g) => g.key === 'carry') || groups[groups.length - 1];
    carry.weight += leftover;
  }
  const price = Math.max(0, Math.round(calc?.clientPrice || 0));
  const live = groups.filter((g) => g.weight > 0);
  if (!live.length || price <= 0) {
    return [{ id: 'total', name: '공사 일체', desc: '현장 조건에 맞춘 공사', amount: price }];
  }
  const totalWeight = live.reduce((s, g) => s + g.weight, 0);
  const raw = live.map((g) => (g.weight / totalWeight) * price);
  const amounts = raw.map((v) => Math.floor(v));
  const rest = price - amounts.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < rest; k += 1) amounts[order[k % order.length].i] += 1;
  return live
    .map((g, i) => ({ id: g.key, name: g.name, desc: g.desc, amount: amounts[i] }))
    .filter((l) => l.amount !== 0);
}

export function buildQuote(c, calc, design, waste) {
  const trade = calc?.trade || c?.trade || 'unclassified';
  const info = TRADES[trade] || TRADES.unclassified;
  const asb = assessAsbestos(c?.asbestos || {});
  const lines = allocateClientLines(trade, calc);
  const materialSpecs = (calc?.materialSet?.spec?.length ? calc.materialSet.spec : design?.combo || []).slice(0, 6);

  const clauses = [];
  clauses.push(
    c?.stage === 'prelim'
      ? '본 금액은 가견적이며, 현장 실측 후 확정됩니다(자재 수급·현장 여건에 따라 ±5% 조정 가능).'
      : '본 금액은 실측 기준 확정 견적입니다. 자재 수급 상황 변동 시 사전 협의합니다.'
  );
  clauses.push(
    '당초 견적에 없는 추가 작업은 사진·사유·금액·일정 4가지를 서면(문자)으로 합의한 뒤 진행합니다. 구두 지시만으로는 대금 청구가 어려울 수 있습니다(대법원 95다38066).'
  );
  if (trade === 'demolition') {
    clauses.push('폐기물 처리비는 계상된 차량 대수 기준이며, 초과 발생 시 차량 규모별 실비로 정산합니다(작업 전 사전 고지).');
    clauses.push('철거 전 6부위(바닥·벽·천장·복도·승강기·인접세대)를 촬영해 보관하며, 공사 전 존재하던 파손은 배상 범위에서 제외됩니다.');
  }
  if (trade === 'bathroom' || trade === 'combined') {
    clauses.push('방수 시공 후 담수시험 48시간을 거쳐 아래층 누수 확인 후 타일 시공합니다. 담수 사진 3컷(수위선·24시간·배수 직전)을 보관합니다.');
    clauses.push('타일 시공 후 3일, 줄눈 시공 후 7일은 보행을 금지합니다. 보행 금지 기간 중 사용으로 발생한 파손은 하자 보수 대상이 아닙니다.');
    clauses.push('방수 하자보수 책임 기간은 3년입니다.');
  }
  if (trade === 'wallpaper') {
    clauses.push('기존 벽지 제거 후 벽 상태에 따라 초배를 추가할 수 있으며, 추가 시 사전 고지합니다.');
  }
  if (trade === 'kitchen') {
    clauses.push('상판 가공 후 수전 홀 위치 변경은 불가합니다. 실측 확정 후 발주합니다.');
  }
  if (asb.suspected) clauses.push(asb.clause);

  const changeLines = (calc?.changeLogs || []).map((l) => ({
    item: l.item || l.reason || '현장 변동',
    reason: l.reason || '',
    amount: (l.type === 'decrease' ? -1 : 1) * (Number(l.amount) || 0),
    days: Number(l.days) || 0,
    at: l.at || '',
  }));

  // 손님 문서에는 내부 원가·양중비 같은 우리 사정이 들어가지 않는다.
  const notes = [];
  if (c?.survey?.loadBearingWall) notes.push('내력벽 철거는 구조검토 없이 착공할 수 없습니다. 착공 전 구조기술사 검토가 필요합니다.');
  if (design?.detailRows?.length) notes.push(`선택 마감(${design.detailRows.map((d) => d.label).join(', ')}) 포함 — 공사 기간 ${design.days}일이 추가됩니다.`);

  const baseLines = [
    { name: '공사 범위', detail: calc?.targetSummary || '', amount: null },
  ];

  const pay = calc?.payments || { deposit: { ratio: 30, amount: 0 }, mid: { ratio: 40, amount: 0 }, balance: { ratio: 30, amount: 0 } };
  const depositRatio = pay.deposit.ratio;
  const midRatio = pay.mid.ratio;
  const balanceRatio = pay.balance.ratio;

  return {
    title: `${info.label} ${(calc?.changeLogs || []).length ? '최종 견적서' : '견적서'}`,
    client: c?.clientName || '고객',
    site: c?.location || c?.title || '현장',
    size: sizeText(c),
    date: c?.createdAt || new Date().toISOString().slice(0, 10),
    baseLines,
    lines,
    materialSpecs,
    summary: calc?.clientSummary || clientSafeText(calc?.targetSummary || ''),
    changeLines,
    basePrice: calc?.baseClientPrice || 0,
    adjustmentTotal: calc?.adjustmentTotal || 0,
    subtotal: calc?.clientPrice || 0,
    vat: calc?.vatAmount || 0,
    total: calc?.finalPrice || 0,
    excluded: EXCLUDED[trade] || EXCLUDED.unclassified,
    clauses,
    notes,
    asbestos: asb,
    paymentPlan: { deposit: depositRatio, mid: midRatio, balance: balanceRatio },
    payments: pay,
    paymentText:
      depositRatio === 0
        ? `선금 없음 · 완료 후 전액 ${won(pay.balance.amount)} 수금 (준공 검수 후)`
        : `계약금 ${depositRatio}%(${won(pay.deposit.amount)}) · 중도금 ${midRatio}%(${won(pay.mid.amount)}) · 잔금 ${balanceRatio}%(${won(pay.balance.amount)}) — 잔금은 준공 검수 후`,
    wasteSummary: '',
  };
}

export function quoteText(doc, calc) {
  const lines = [];
  lines.push(`[${doc.title}]`);
  lines.push(`${doc.client} / ${doc.site} / ${doc.size}`);
  lines.push(`작성일: ${doc.date}`);
  lines.push('');
  lines.push(`■ 공사 범위`);
  lines.push(doc.summary || doc.baseLines.map((b) => b.detail).filter(Boolean).join(' '));
  lines.push('');
  lines.push(`■ 공사 내역`);
  doc.lines.forEach((l) => lines.push(` · ${l.name} — ${l.amount}만원${l.desc ? ` (${l.desc})` : ''}`));
  if (doc.materialSpecs?.length) {
    lines.push('');
    lines.push(`■ 사용 자재`);
    doc.materialSpecs.forEach((s) => lines.push(` · ${s}`));
  }
  lines.push('');
  lines.push(`■ 금액`);
  lines.push(` 공급가: ${wonFull(doc.subtotal)}`);
  if (doc.vat) lines.push(` 부가세(10%): ${wonFull(doc.vat)}`);
  lines.push(` 합계: ${wonFull(doc.total)}`);
  lines.push(` 지급 조건: ${doc.paymentText}`);
  lines.push('');
  lines.push(`■ 제외 사항`);
  doc.excluded.forEach((e) => lines.push(` · ${e}`));
  lines.push('');
  lines.push(`■ 특약`);
  doc.clauses.forEach((cl, i) => lines.push(` ${i + 1}. ${cl}`));
  if (doc.changeLines.length) {
    lines.push('');
    lines.push('■ 현장 변동 내역');
    doc.changeLines.forEach((l) => {
      lines.push(` · ${l.at ? `${l.at} ` : ''}${l.item} — ${l.amount > 0 ? '+' : ''}${l.amount}만원${l.reason ? ` (${l.reason})` : ''}`);
    });
    lines.push(` 최초 견적 ${wonFull(doc.basePrice)} → 현재 ${wonFull(doc.subtotal)}`);
  }
  if (doc.notes.length) {
    lines.push('');
    lines.push('■ 현장 안내');
    doc.notes.forEach((n) => lines.push(` · ${n}`));
  }
  return lines.join('\n');
}

// ---- 문자 생성 ----

export function dispatchMessage(c, calc) {
  const trade = TRADES[calc?.trade] || TRADES.unclassified;
  const lift = c?.lifting || {};
  const floorText = lift.floor ? `${lift.floor}층` : '층수 확인 필요';
  const eveText = lift.elevator === 'yes' ? '엘리베이터 사용' : lift.elevator === 'no' ? '엘리베이터 없음' : '엘베 확인 필요';
  const ladder = c?.gates?.lift?.ladder ? '사다리차 승인 완료' : '사다리차 승인 대기';
  const crew = c?.crew && c.crew.length ? c.crew : defaultCrew(calc?.trade, c, calc);
  const people = crew.map((p) => (p.unit === '대' ? `${p.role} ${p.count}대` : `${p.role} ${p.count}명`)).join(', ');
  const time = c?.dispatch?.time || '08:00';
  const date = c?.startDate || c?.dispatch?.date || '내일';
  const memo = shortMemo(c?.notes, 44) || trade.label;

  const workByTrade = {
    demolition: '천장·벽체·바닥 철거, 마대 상차',
    wallpaper: '기존 벽지 제거·초배, 도배·장판 시공',
    bathroom: '욕실 철거·방수·타일 시공',
    kitchen: '기존 싱크대 철거, 상판·수납 설치',
    combined: '철거 후 도배·타일 복합 시공',
  };

  return [
    `[배차 요청] ${date} ${time} / ${c?.location || c?.title || '현장'}`,
    `· 공정: ${trade.short} — ${workByTrade[calc?.trade] || '현장 작업'}`,
    `· 작업내용: ${memo}`,
    `· 필요 인원: ${people}`,
    `· 숙련도: 기공은 동종 경력 3년 이상, 보조는 무경력 가능`,
    `· 현장환경: ${floorText} · ${eveText} · ${ladder}`,
    `· 준비물: 기초안전보건교육 이수증, 안전화·장갑`,
    '',
    `전날 18시까지 확정 부탁드립니다. 결원 1명 = 일당 18만원 + 공정 1일 지연 손실입니다.`,
  ].join('\n');
}

// 인력사무소 직영 강점 + 보관함의 유사 완료 사례 1줄 (손님 문자에 선택적으로)
export function strengthLines(c, calc, completedCases = []) {
  const lines = [];
  lines.push('저희는 인력사무소를 직접 운영해 중간 하청 없이 합리적인 금액으로 꼼꼼히 시공합니다.');
  const sameTrade = (completedCases || []).filter((x) => x.trade === calc?.trade);
  const pick = sameTrade[0];
  if (pick) {
    const where = (pick.region || '') + (pick.title ? ` ${pick.title}` : '');
    lines.push(`최근에도 ${where.trim()} 현장을 같은 방식으로 완료했습니다.`);
  } else {
    lines.push('철거부터 마감까지 같은 팀이 책임지고, 일정과 금액을 문자로 남겨 두고 진행합니다.');
  }
  return lines;
}

// 견적 안내 문자 — 손님에게 바로 보낼 수 있는 짧은 문자
export function estimateSms(c, calc, completedCases = [], useStrength = true) {
  const info = TRADES[calc?.trade] || TRADES.unclassified;
  const price = Math.round(calc?.finalPrice || 0);
  const lines = [
    `[${info.label} 견적 안내]`,
    `안녕하세요 사장님, ${c?.location || c?.title || '현장'} ${info.label} 견적 보내드립니다.`,
    `· 금액: ${wonFull(price)} (${c?.includeVat ? '부가세 포함' : '부가세 별도'})`,
    `· 범위: ${calc?.targetSummary || info.label}`,
    `· 기간: 협의 후 확정 / 계약금 ${calc?.plan?.deposit ?? 30}% · 잔금 ${calc?.plan?.balance ?? 30}%`,
  ];
  if (useStrength) lines.push('', ...strengthLines(c, calc, completedCases));
  lines.push('', '궁금하신 점은 언제든 연락 주세요. 감사합니다.');
  return lines.join('\n');
}

export function defaultCrew(trade, c, calc) {
  const size = parseFloat(c?.sizeValue) || 0;
  const unit = c?.sizeUnit || '평';
  const pyung = unit === '평' ? size : unit === '㎡' ? size / 3.3 : unit === '칸' ? size * 1.8 : size || 15;
  if (trade === 'bathroom') return [{ role: '타일 기공', count: 1 }, { role: '보조', count: 1 }];
  if (trade === 'kitchen') return [{ role: '설치 기공', count: 2 }];
  if (trade === 'wallpaper') return [{ role: '도배 기공', count: 1 }, { role: '보조', count: 1 }];
  if (trade === 'tilewaterproof') return [{ role: '타일 기공', count: 1 }, { role: '보조', count: 1 }];
  if (trade === 'plaster') return [{ role: '미장 기공', count: 1 }, { role: '보조', count: 1 }];
  if (trade === 'window') return [{ role: '창호 기공', count: 2 }];
  if (trade === 'repair') return [{ role: '수선 기공', count: 1 }];
  if (trade === 'labor') {
    const people = unit === '명' && size > 0 ? size : Math.max(1, parseInt(size, 10) || 1);
    return [{ role: '일용 인력', count: people }];
  }
  if (trade === 'waste') {
    const tons = unit === '톤' && size > 0 ? size : Math.max(0.5, +(pyung * 0.18).toFixed(1));
    const truck = tons >= 8 ? '2.5톤 차량' : '1톤 차량';
    return [{ role: '상차 인부', count: tons >= 5 ? 2 : 1 }, { role: truck, count: Math.max(1, Math.ceil(tons / 3.2)), unit: '대' }];
  }
  // 철거·복합
  const helper = pyung >= 12 ? 2 : 1;
  return [{ role: '철거 기공', count: 1 }, { role: '잡부', count: helper }];
}

export function orderMessage(c, calc, design) {
  const combo = design?.combo || [];
  const sizeVal = parseFloat(c?.sizeValue) || 0;
  const unit = c?.sizeUnit || '평';
  const lines = [`[자재 발주] ${c?.location || c?.title || '현장'} / ${sizeText(c)}`];
  const materialItems = (calc?.items || []).filter((i) => i.category === '자재' && i.amount > 0);
  materialItems.forEach((it) => {
    lines.push(`· ${it.name} — ${it.detail || ''}`);
  });
  if (sizeVal > 0 && (unit === '평' || unit === '㎡')) {
    const pyung = unit === '㎡' ? sizeVal / 3.3 : sizeVal;
    lines.push(`· 벽지 로스 10% 반영: 벽 ${(pyung * 2.3).toFixed(1)}평 × 1.1 = ${(pyung * 2.3 * 1.1).toFixed(1)}평분`);
    lines.push(`· 장판 로스 10% 반영: ${Math.round(pyung * 2.3)}㎡ × 1.1 = ${Math.round(pyung * 2.3 * 1.1)}㎡`);
  } else if (parseFloat(c?.sizeValue) > 0) {
    lines.push(`· 소요량 ${c.sizeValue}${unit} × 1.1(로스 10%) = ${(parseFloat(c.sizeValue) * 1.1).toFixed(2)}${unit}`);
  }
  if (combo.length) {
    lines.push('', '[선택 사양]');
    combo.forEach((s) => lines.push(`· ${s}`));
  }
  lines.push('', `납기: ${c?.dispatch?.date || '착공 D-2'} 오전 / 하차: ${c?.lifting?.elevator === 'no' ? '계단 양중(사다리차)' : '엘리베이터 사용'}`);
  return lines.join('\n');
}

export function changeMessage(c, log) {
  const amount = Number(log?.amount) || 0;
  return [
    `사장입니다. ${c?.location || c?.title || '현장'} 관련 안내드립니다.`,
    `${log?.item || '해당 부분'}은(는) 당초 견적 범위에 없는 추가 작업입니다.`,
    `· 작업 내용: ${log?.item || '추가 작업'}`,
    `· 사유: ${log?.reason || '현장 조건에 따른 추가'}`,
    `· 금액: ${amount.toLocaleString('ko-KR')}만원 (${(amount * 10000).toLocaleString('ko-KR')}원)`,
    `· 일정: ${Number(log?.days) || 0}일 추가`,
    '',
    `진행해도 될지 회신 부탁드립니다. 회신 주시면 바로 진행하겠습니다.`,
  ].join('\n');
}

export function neighborMessage(c) {
  const start = c?.dispatch?.date || '착공일';
  return `안녕하세요, ${c?.location || '○○호'} 공사를 맡은 현장 담당입니다. ${start}부터 공사하며, 소음이큰 날은 철거일입니다. 불편하시면 이 번호로 연락 주세요. 최대한 조정하겠습니다.`;
}

export function waterproofNotice(c) {
  return [
    `[담수시험 안내] ${c?.location || '현장'}`,
    `오늘부터 48시간 담수시험을 진행합니다.`,
    `· 아래층 천장 누수 여부 확인을 위해 방문 양해를 구합니다.`,
    `· 담수 사진 3컷(수위선 표시 · 24시간 경과 · 배수 직전)을 남깁니다.`,
    `· 시험 완료 후 타일 시공을 시작합니다.`,
  ].join('\n');
}

export function tileWalkNotice() {
  return `[보행 금지 안내] 타일 시공 후 3일, 줄눈 시공 후 7일은 보행을 금지합니다. 보행 금지 기간 중 사용으로 발생한 파손은 하자 보수 대상이 아닙니다. 방수 하자보수 책임은 3년입니다.`;
}

export function contentCertDraft(c, calc) {
  const total = calc?.finalPrice || 0;
  const paid = calc?.paid || 0;
  const remain = Math.max(0, total - paid);
  const today = new Date();
  const due = new Date(today.getTime() + 14 * 864e5);
  const fmt = (d) => `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
  return [
    `[내용증명 초안]`,
    `1. ${c?.createdAt || fmt(today)} 체결한 공사계약(총 ${wonFull(total)})에 따라 공사를 완료하였습니다.`,
    `2. 귀하는 ${wonFull(remain)}을 지급하지 않고 있습니다.`,
    `3. ${fmt(due)}까지 입금하여 주시기 바랍니다.`,
    `4. 미이행 시 지급명령 및 민사소송 등 법적 조치를 진행하겠습니다.`,
    ``,
    `※ 하자 핑계로 전액을 묶는 경우, 보수비 상당액만 보류하는 것이 원칙입니다. 미시공(공정 누락)은 정당하게 공제될 수 있습니다.`,
  ].join('\n');
}

export function collectionLabel(c) {
  return COLLECTION_LABEL[c?.collection] || '계약금 대기';
}

export function subsidyNotice(c) {
  const info = subsidyInfo(c);
  return [
    `[점포철거비 지원금 안내]`,
    ``,
    `사장님, 폐업하실 때 점포 철거·원상복구 비용을 나라에서 돌려받으실 수 있습니다.`,
    `· 받을 수 있는 금액: 평당 20만원, 최대 600만원 (부가세는 지원되지 않습니다)`,
    info.pyung
      ? `· 이 현장(전용면적 ${info.pyung}평) 예상 한도: 약 ${wonFull(info.limit)}`
      : `· 예상 한도: 최대 600만원`,
    `· 조건: 사업 60일 이상 · 유상 임차 상가(자가·무상 임차 불가) · 사업자등록 업체에 맡긴 철거(자력 철거·현금 거래 불가)`,
    `· 챙길 서류: 임대차계약서 · 폐업사실증명 · 공사계약서 · 세금계산서 · 이체확인증 · 전후사진`,
    `· 신청: 소상공인24(sbiz24.kr) 또는 1533-0100`,
    ``,
    `공사내역서와 전자세금계산서는 저희가 바로 발급해 드리고, 철거 전·후 사진도 같은 자리에서 찍어 두겠습니다.`,
    `${SUBSIDY_AGENCY.freeNote} (${SUBSIDY_AGENCY.paidNote})`,
  ].join('\n');
}

// 대행만 맡기는 경우의 안내 문자 (서류 대행비 10~20만원 안내 포함)
export function subsidyAgencyNotice(c) {
  return [
    `[점포철거 서류 대행 안내]`,
    `사장님, 철거지원금 서류(공사계약서·세금계산서·전후사진) 준비와 신청까지 도와드립니다.`,
    `· 공사를 저희에게 맡기시면 서류 대행은 무료입니다.`,
    `· 서류 대행만 따로 맡기시면 ${SUBSIDY_AGENCY.paidNote}`,
    `· 먼저 확인하실 것: 유상 임차 상가인지, 건축물대장 용도가 상가인지, 폐업 후 신청인지`,
    `필요하시면 지금 바로 서류 목록을 정리해 보내드리겠습니다.`,
  ].join('\n');
}

// ---- 점포철거비 지원금 제출용 공사내역서 ----
// 공단은 지정 서식을 두지 않고, 아래 항목이 문서로 확인되면 된다.
// (신청인·사업장 정보 / 시공업체 정보와 직인 / 공사 장소·기간 / 품명·규격·수량·단가·금액 /
//  공급가액·부가세·총액 / 철거 전후 사진) — 내부 원가·마진은 넣지 않는다.
export function buildSubsidySheet(c, calc) {
  const trade = calc?.trade || c?.trade || 'demolition';
  const lines = allocateClientLines(trade, calc);
  const sizeVal = parseFloat(c?.sizeValue) || 0;
  const unit = c?.sizeUnit || '평';
  const pyung = unit === '평' ? sizeVal : unit === '㎡' ? sizeVal / 3.3 : sizeVal * 1.8 || 15;
  const areaSqm = Number(c?.asbestos?.areaSqm) || Math.round(pyung * 3.3);
  const tons = unit === '톤' && sizeVal > 0 ? sizeVal : Math.max(0.5, +(pyung * 0.09).toFixed(1));

  const qtyFor = (line) => {
    if (/폐기물/.test(line.name)) return { qty: tons, unit: '톤' };
    if (trade === 'waste') return { qty: tons, unit: '톤' };
    if (/타일|방수|미장/.test(line.name)) return { qty: Math.max(1, areaSqm), unit: '㎡' };
    if (/철거|해체/.test(line.name)) return { qty: Math.max(1, areaSqm), unit: '㎡' };
    if (/창호/.test(line.name)) return { qty: Math.max(1, areaSqm), unit: '㎡' };
    if (/도배|장판/.test(line.name)) return { qty: Math.max(1, Math.round(pyung)), unit: '평' };
    return { qty: 1, unit: '식' };
  };

  const rows = lines.map((l, i) => {
    const { qty, unit: u } = qtyFor(l);
    const supply = Math.round(Number(l.amount) || 0) * 10000;
    const unitPrice = qty > 0 ? Math.round(supply / qty) : supply;
    return {
      no: i + 1,
      name: l.name,
      spec: l.desc || '',
      qty,
      unit: u,
      unitPrice,
      supply,
    };
  });

  const supplyTotal = Math.round((calc?.clientPrice || 0) * 10000);
  const vat = Math.round(supplyTotal * 0.1);

  return {
    title: '공사내역서 (점포철거비 지원금 제출용)',
    workName: `${c?.location || c?.title || '현장'} 철거·원상복구 공사`,
    site: c?.location || c?.title || '',
    period: `${c?.startDate || c?.dispatch?.date || '미정'} ~ ${c?.startDate ? `${Math.round((Number(c.workDays) || 3) - 1)}일 후` : '미정'}`,
    applicant: {
      shopName: c?.clientName || '(점포명)',
      owner: '',
      bizNo: '',
      closeDate: '',
      address: c?.location || '',
      areaSqm,
    },
    supplier: {
      name: c?.businessName || '경북 철거·인테리어',
      owner: '',
      bizNo: '',
      address: '',
      phone: '',
    },
    rows,
    totals: { supply: supplyTotal, vat, total: supplyTotal + vat },
    note: '지원금은 전자세금계산서의 공급가액 기준으로 지급되며 부가세는 지원되지 않습니다. 공사내역서·세금계산서·이체확인증의 금액이 서로 같아야 합니다.',
    photos: [
      '철거 전 6부위(바닥·벽·천장·복도·승강기·인접세대) 동일 각도 촬영',
      '철거 후 같은 자리·같은 각도 촬영',
      '자재·폐기물 반출 전후 사진',
    ],
    signNote: '위 공사내역이 사실임을 확인합니다. (시공업체 대표자 직인 또는 서명)',
  };
}

export function subsidySheetText(sheet) {
  const L = [];
  L.push(`[${sheet.title}]`);
  L.push(`공사명: ${sheet.workName}`);
  L.push(`공사장소: ${sheet.site}`);
  L.push(`공사기간: ${sheet.period}`);
  L.push('');
  L.push('■ 신청인(공급받는 자)');
  L.push(` 상호(점포명): ${sheet.applicant.shopName} / 대표자: ${sheet.applicant.owner || '(서명)'}`);
  L.push(` 사업자등록번호: ${sheet.applicant.bizNo || '(기재)'} / 폐업일: ${sheet.applicant.closeDate || '(기재)'}`);
  L.push(` 소재지: ${sheet.applicant.address}`);
  L.push(` 전용면적: ${sheet.applicant.areaSqm}㎡`);
  L.push('');
  L.push('■ 공급자(시공업체)');
  L.push(` 상호: ${sheet.supplier.name} / 대표자: ${sheet.supplier.owner || '(서명·직인)'}`);
  L.push(` 사업자등록번호: ${sheet.supplier.bizNo || '(기재)'} / 연락처: ${sheet.supplier.phone || '(기재)'}`);
  L.push('');
  L.push('■ 공사 세부 내역');
  L.push(' 연번 | 품명 | 규격 | 수량 | 단위 | 단가 | 공급가액');
  sheet.rows.forEach((r) => {
    L.push(` ${r.no} | ${r.name} | ${r.spec} | ${r.qty} | ${r.unit} | ${r.unitPrice.toLocaleString('ko-KR')} | ${r.supply.toLocaleString('ko-KR')}`);
  });
  L.push('');
  L.push(` 공급가액: ${sheet.totals.supply.toLocaleString('ko-KR')}원`);
  L.push(` 부가세(10%): ${sheet.totals.vat.toLocaleString('ko-KR')}원 (지원 대상 아님)`);
  L.push(` 총합계: ${sheet.totals.total.toLocaleString('ko-KR')}원`);
  L.push('');
  L.push(sheet.note);
  L.push('');
  L.push('■ 첨부 사진');
  sheet.photos.forEach((p) => L.push(` · ${p}`));
  L.push('');
  L.push(sheet.signNote);
  return L.join('\n');
}
