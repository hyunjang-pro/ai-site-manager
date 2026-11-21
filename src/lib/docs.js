// 고객용 문서·문자 생성 모듈 — 공종별로 정확한 자재/스펙만 출력한다.
import { TRADES, COLLECTION_LABEL } from './constants.js';
import { wonFull, won, sizeText, clientSafeText } from './pricing.js';
import { assessAsbestos } from './asbestos.js';
import { subsidyInfo, SUBSIDY_DOCS, SUBSIDY_AGENCY } from './subsidy.js';
import { cleanOcrText } from './ocr.js';
import { korDateLabel, addDaysISO, kstToday } from './date.js';
import { wasteVehicle } from './waste.js';
import { estimateWorkDays } from './schedule.js';
import { combinedScopeSpecs } from './materials.js';
import { combinedTitle } from './classify.js';
import { hasScope, hasInteriorStyle, scopeList, workTypeLabel } from './constants.js';
import { getSupplier } from './supplier.js';
import { resolveSurvey } from './site.js';

// 사진 OCR·메모에서 온 날것 글자를 발주·배차 문자에 넣지 않는다.
function shortMemo(text, max = 44) {
  const clean = cleanOcrText(String(text || '')).replace(/\n+/g, ' ').trim();
  if (!clean) return '';
  const line = clean.split(/[.。/\n]/).map((x) => x.trim()).filter((x) => x.length >= 4)[0] || clean;
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

// 직접 입력한 공종 이름은 문서 제목·문자에 그대로 쓴다.
export function tradeLabelOf(c, calcOrTrade) {
  const trade = typeof calcOrTrade === 'string' ? calcOrTrade : calcOrTrade?.trade || c?.trade;
  const custom = String(c?.tradeName || '').trim();
  if (custom && (trade === 'custom' || trade === 'unclassified')) return custom;
  // 복합은 실제 켜 둔 공종으로 부른다 — 철거+정지 견적서가 '복합 인테리어'가 되면 안 된다
  if (trade === 'combined') return combinedTitle(scopeList(c));
  return (TRADES[trade] || TRADES.unclassified).label;
}

export function tradeShortOf(c, calcOrTrade) {
  const trade = typeof calcOrTrade === 'string' ? calcOrTrade : calcOrTrade?.trade || c?.trade;
  const custom = String(c?.tradeName || '').trim();
  if (custom && (trade === 'custom' || trade === 'unclassified')) return custom;
  if (trade === 'combined') return combinedTitle(scopeList(c));
  return (TRADES[trade] || TRADES.unclassified).short;
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
  carpentry: ['도장·페인트 마감', '가구 내부 수납 설계', '전기·조명 배선', '철거 후 구조 보강'],
  electric: ['한전 인입·계량기 증설', '소방 설비', '통신·인터넷 배선', '관공서 허가'],
  plumbing: ['상수도 인입공사', '가스 배관 이설', '보일러 본체 교체', '건물 배관 전체 교체'],
  film: ['유리 교체·샷시 시공', '철거·바탕 보수', '외부 간판 필름'],
  groundwork: ['인허가·측량', '구조 설계·감리', '지하 매설물 이설', '폐기물 처리 허가'],
  combined: [
    '석면 발견 시 조사·해체·처리',
    '가전·가구 등 생활폐기물',
    '전기·수도·가스 승압 및 인입공사',
  ],
  unclassified: ['공종 확정 후 별도 협의'],
};

// 고객용 견적서 내역 — 실제 업체 견적서처럼 재료비·노무비·경비(폐기물·운반·식비·차비)를 나눠 쓴다.
// 금액은 '내가 부른 금액'(없으면 앱 계산가)을 원가 비중대로 나눈 값이라,
// 각 줄 금액의 합계는 공급가액과 1만원 단위까지 정확히 일치하고 원가·마진은 역산할 수 없다.
const CLIENT_COST_GROUPS = [
  { key: 'material', name: '자재비', desc: '마감재·부자재 (아래 사용 자재 참조)', unit: '식' },
  { key: 'labor', name: '인건비 (노무비)', desc: '기공·보조 인력 품삯', unit: '명·일' },
  { key: 'meal', name: '식비', desc: '현장 인력 식대', unit: '명·일' },
  { key: 'travel', name: '원거리 교통비', desc: '현장 거리 기준 추가 운행비', unit: '식' },
  { key: 'waste', name: '폐기물 처리·운반비', desc: '철거 폐기물 상차·운반·처리', unit: '대' },
  { key: 'equip', name: '장비·운반비', desc: '사다리차·집게차·자재 운반', unit: '식' },
  { key: 'extra', name: '현장 조건 반영', desc: '보양·신고·거주 중 관리 등', unit: '식' },
];

export function allocateClientLines(trade, calc, c) {
  const price = Math.max(0, Math.round(calc?.clientPrice || 0));
  const items = (calc?.items || []).filter((i) => !i.excluded && Number(i.amount) !== 0);
  // 공고는 설계내역서 확인 전 — 항목을 나눠 쓰면 엉뚱한 비중이 생긴다
  if (calc?.isBid) {
    const work = workTypeLabel(c?.bid?.workTypes) || '공고 공사';
    return [
      {
        id: 'total',
        name: `${work} 일체`,
        desc: '설계내역서·물량 확정 후 세부 내역 제시',
        amount: price,
        qty: 1,
        unit: '식',
        unitPrice: price,
      },
    ];
  }

  const sumBy = (pred) => items.filter(pred).reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const crew = calc?.crewCosts || {};
  const crewDays = Math.max(0, Math.round((Number(crew.days) || 0) * 10) / 10);
  const money = (i) => (Number(i.amount) || 0) > 0;
  const catOf = (i) => String(i.category || '');
  const weights = {
    material: sumBy((i) => catOf(i) === '자재' && money(i)),
    // '교통비 · 식비'는 아래 식비·교통비 줄로 따로 나눈다
    labor: sumBy((i) => catOf(i) === '노무' && i.id !== 'crew_cost'),
    meal: Math.max(0, Number(crew.mealCost) || 0),
    travel: Math.max(0, Number(crew.travelCost) || 0),
    waste: sumBy((i) => (catOf(i) === '폐기물' || catOf(i) === '추가(폐기물)') && money(i)),
    equip: sumBy((i) => (catOf(i) === '장비' || catOf(i) === '추가(운반)') && money(i)),
    extra: sumBy((i) => /^추가\((현장|디테일|규제|구조|공고)\)$/.test(catOf(i)) && money(i)),
  };
  const live = CLIENT_COST_GROUPS.filter((g) => weights[g.key] > 0);
  if (!live.length || price <= 0) {
    return [{ id: 'total', name: '공사 일체', desc: '현장 조건에 맞춘 공사', amount: price, qty: 1, unit: '식', unitPrice: price }];
  }

  const totalWeight = live.reduce((s, g) => s + weights[g.key], 0);
  const raw = live.map((g) => (weights[g.key] / totalWeight) * price);
  const amounts = raw.map((v) => Math.floor(v));
  // 단수 조정 — 내림한 나머지 만원은 소수부가 큰 줄부터 1만원씩 더해 합계를 정확히 맞춘다
  const rest = Math.max(0, price - amounts.reduce((s, v) => s + v, 0));
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < rest; k += 1) amounts[order[k % order.length].i] += 1;

  const trucks = Math.max(1, Math.round(Number(c?.waste?.trucks) || 1));
  const distanceKm = Math.max(0, Number(crew.distanceKm) || 0);
  const descOf = (key) => {
    if (key === 'labor') return crewDays ? `기공·보조 인력 품삯 (연인원 ${crewDays}명·일)` : '기공·보조 인력 품삯';
    if (key === 'meal') return crewDays ? `현장 인력 식대 (연인원 ${crewDays}명·일 기준)` : '현장 인력 식대';
    if (key === 'travel') return distanceKm ? `현장 거리 ${distanceKm}km 기준 운행비` : '현장 운행비';
    if (key === 'waste') return `폐기물 상차·운반·처리 (${trucks}대 기준)`;
    if (key === 'equip') return '사다리차·집게차·자재 운반';
    if (key === 'extra') {
      const names = [...new Set(items.filter((i) => /^추가\((현장|디테일|규제|구조|공고)\)$/.test(catOf(i)) && money(i)).map((i) => i.name))].slice(0, 3);
      return names.length ? names.join(' · ') : '답사에서 확인된 현장 조건';
    }
    return null;
  };
  // 수량·단가는 실제로 믿을 수 있는 곳(폐기물 차량 대수)만 적는다.
  // 인건비·식비는 품삯 총액이라 '일식'으로 두고, 연인원은 설명에 적는다.
  const qtyOf = (key) => (key === 'waste' ? trucks : 1);
  const unitOf = (key) => (key === 'waste' ? '대' : '식');

  return live
    .map((g, i) => ({
      id: g.key,
      name: g.name,
      desc: descOf(g.key) || g.desc,
      amount: amounts[i],
      qty: qtyOf(g.key),
      unit: unitOf(g.key),
      unitPrice: Math.round((amounts[i] / qtyOf(g.key)) * 10) / 10,
    }))
    .filter((l) => l.amount !== 0);
}

// 복합 현장 견적서에 '무엇이 포함됐는지' 공정 이름으로 적는다 (금액은 위 내역표에)
const SCOPE_TITLES = {
  demolition: ['철거·해체', '기존 마감 철거·폐기물 반출'],
  groundwork: ['기초·정지', '터파기·다짐·되메우기'],
  wallpaper: ['도배·장판', '기존 벽지 제거·초배·도배·장판'],
  bathroom: ['욕실 리모델링', '철거·방수·타일·도기 교체'],
  kitchen: ['주방 (싱크대·상판)', '싱크대·상판·수전·후드'],
  entrance: ['현관 (중문·신발장·타일)', '중문·신발장·현관 타일'],
  plaster: ['바닥 미장', '몰탈 미장·양생'],
  carpentry: ['문·몰딩', '문틀·몰딩·걸레받이'],
  electric: ['전기·조명', '스위치·콘센트·조명'],
  window: ['창호', '창호 교체·단열'],
};

export function buildQuote(c, calc, design, waste) {
  const trade = calc?.trade || c?.trade || 'unclassified';
  const info = TRADES[trade] || TRADES.unclassified;
  const label = tradeLabelOf(c, trade);
  const asb = assessAsbestos(c?.asbestos || {});
  const lines = allocateClientLines(trade, calc, c);
  const scopeSpecs =
    trade === 'combined' && Array.isArray(c?.subScopes) && c.subScopes.length
      ? combinedScopeSpecs(design?.presetId, c.subScopes, calc?.materialSet?.tier || '표준')
      : [];
  const materialSpecs = (scopeSpecs.length ? scopeSpecs : calc?.materialSet?.spec?.length ? calc.materialSet.spec : design?.combo || []).slice(0, 10);

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
  if (hasScope(c, 'bathroom')) {
    clauses.push('방수 시공 후 담수시험 48시간을 거쳐 아래층 누수 확인 후 타일 시공합니다. 담수 사진 3컷(수위선·24시간·배수 직전)을 보관합니다.');
    clauses.push('타일 시공 후 3일, 줄눈 시공 후 7일은 보행을 금지합니다. 보행 금지 기간 중 사용으로 발생한 파손은 하자 보수 대상이 아닙니다.');
    clauses.push('방수 하자보수 책임 기간은 3년입니다.');
  }
  // 복합·철거·토목 현장에 실제로 들어가는 공정만 특약을 넣는다
  if (trade !== 'demolition' && hasScope(c, 'demolition')) {
    clauses.push('철거 폐기물은 성상별로 분리해 반출하고, 계량증명서·처리확인서를 공사 완료 후 전달합니다.');
    clauses.push('철거 전 6부위(바닥·벽·천장·복도·승강기·인접세대)를 촬영해 보관하며, 공사 전 존재하던 파손은 배상 범위에서 제외됩니다.');
  }
  if (hasScope(c, 'groundwork')) {
    clauses.push('터파기 전 지하 매설물(배관·전선) 위치를 확인하며, 도면·지자체 확인으로 파악되지 않은 매설물 손상은 상호 협의해 처리합니다.');
    clauses.push('잔토(남는 흙)와 골재는 허가업체를 통해 반출·반입하고, 처리 확인서를 보관합니다.');
    clauses.push('되메우기 후 지반 침하는 6개월간 보수합니다(구조물 하중 부위 제외).');
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
  const scopeLines =
    trade === 'combined' && Array.isArray(c?.subScopes) && c.subScopes.length
      ? c.subScopes
          .filter((sc) => SCOPE_TITLES[sc])
          .map((sc) => ({ key: sc, name: SCOPE_TITLES[sc][0], desc: SCOPE_TITLES[sc][1] }))
      : [];

  const pay = calc?.payments || { deposit: { ratio: 30, amount: 0 }, mid: { ratio: 40, amount: 0 }, balance: { ratio: 30, amount: 0 } };
  const depositRatio = pay.deposit.ratio;
  const midRatio = pay.mid.ratio;
  const balanceRatio = pay.balance.ratio;

  // 견적서 기본정보 — 실제 업체 견적서처럼 견적번호·유효기간·공사기간을 적는다
  const issueDate = c?.createdAt || kstToday();
  const workDays = Math.max(1, parseInt(c?.workDays, 10) || estimateWorkDays(c, calc));
  const startISO = c?.startDate || c?.dispatch?.date || '';
  const periodText = startISO
    ? `${korDateLabel(startISO)}${workDays ? ` ~ ${korDateLabel(addDaysISO(startISO, workDays - 1))} (${workDays}일)` : ''}`
    : workDays
    ? `${workDays}일 (일정 협의)`
    : '일정 협의';
  const idHash = Array.from(String(c?.id || c?.title || 'ASM')).reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 1000, 7);
  const quoteNo = `Q-${String(issueDate).replace(/-/g, '').slice(2, 8)}-${String(idHash).padStart(3, '0')}`;

  return {
    title: c?.bid?.title
      ? `${String(c.bid.title).slice(0, 40)} ${(calc?.changeLogs || []).length ? '최종 견적서' : '견적서'}`
      : `${label} ${(calc?.changeLogs || []).length ? '최종 견적서' : '견적서'}`,
    client: c?.bid?.org || c?.clientName || '고객',
    site: c?.bid
      ? c.bid.site && c.bid.site !== c.bid.org
        ? c.bid.site
        : '공고 현장(발주처 확인)'
      : c?.location || c?.title || '현장',
    size: sizeText(c),
    date: c?.createdAt || new Date().toISOString().slice(0, 10),
    baseLines,
    scopeLines,
    lines,
    materialSpecs,
    summary: calc?.clientSummary || clientSafeText(calc?.targetSummary || ''),
    changeLines,
    quoteNo,
    issueDate,
    validUntil: addDaysISO(issueDate, 14),
    periodText,
    basePrice: calc?.baseClientPrice || 0,
    appPrice: calc?.appClientPrice ?? calc?.clientPrice ?? 0,
    calledPrice: calc?.calledPrice ?? null,
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
    supplier: (() => {
      const sup = getSupplier();
      return {
        name: sup.name || c?.businessName || '',
        owner: sup.owner || '',
        bizNo: sup.bizNo || '',
        phone: sup.phone || '',
        address: sup.address || '',
        account: sup.account || '',
      };
    })(),
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
  lines.push(`작성일: ${doc.date} · 견적번호 ${doc.quoteNo} · 유효기간 ${doc.validUntil}까지`);
  lines.push(`공사기간: ${doc.periodText}`);
  lines.push('');
  lines.push(`■ 공사 범위`);
  lines.push(doc.summary || doc.baseLines.map((b) => b.detail).filter(Boolean).join(' '));
  lines.push('');
  lines.push(`■ 공사 내역`);
  doc.lines.forEach((l) =>
    lines.push(
      ` · ${l.name} — ${l.amount}만원${l.desc ? ` (${l.desc})` : ''}${l.qty ? ` [${l.qty}${l.unit || ''} × ${l.unitPrice}만]` : ''}`
    )
  );
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
    lines.push('■ 현장 변동 반영 내역');
    doc.changeLines.forEach((l) => {
      lines.push(
        doc.calledPrice === null || doc.calledPrice === undefined
          ? ` · ${l.at ? `${l.at} ` : ''}${l.item} — ${l.amount > 0 ? '+' : ''}${l.amount}만원${l.reason ? ` (${l.reason})` : ''}`
          : ` · ${l.at ? `${l.at} ` : ''}${l.item}`
      );
    });
    lines.push(
      doc.calledPrice === null || doc.calledPrice === undefined
        ? ` 최초 견적 ${wonFull(doc.basePrice)} → 현재 ${wonFull(doc.subtotal)}`
        : ' 답사 후 현장 변동(추가·감소)은 위 공사 내역 금액에 반영되어 있습니다.'
    );
  }
  if (doc.notes.length) {
    lines.push('');
    lines.push('■ 현장 안내');
    doc.notes.forEach((n) => lines.push(` · ${n}`));
  }
  return lines.join('\n');
}

// ---- 문자 생성 ----

// 우리 업체 정보 — 모든 손님 문자·문서 끝에 자동으로 붙는다.
export function supplierFooter(c) {
  const sup = getSupplier();
  const name = sup.name || c?.businessName || '인력사무소 직영';
  const parts = [name];
  if (sup.owner) parts.push(`대표 ${sup.owner}`);
  if (sup.phone) parts.push(sup.phone);
  if (sup.account) parts.push(`입금 ${sup.account}`);
  return parts.join(' · ');
}

export function dispatchMessage(c, calc) {
  const trade = TRADES[calc?.trade] || TRADES.unclassified;
  const label = tradeShortOf(c, calc);
  const lift = c?.lifting || {};
  const start = c?.startDate || c?.dispatch?.date || '';
  const dateText = start ? korDateLabel(start) : '날짜 미정';
  const time = c?.dispatch?.time || '08:00';
  const place = c?.location || c?.title || '현장';
  const floorText = lift.floor ? `지상 ${lift.floor}층` : '층수 확인 필요';
  const eveText =
    lift.elevator === 'yes'
      ? '엘리베이터 사용'
      : lift.elevator === 'no'
      ? '엘리베이터 없음(계단 운반)'
      : '엘리베이터 확인 필요';
  const crew = c?.crew && c.crew.length ? c.crew : defaultCrew(calc?.trade, c, calc);
  const people = crew.map((p) => (p.unit === '대' ? `${p.role} ${p.count}대` : `${p.role} ${p.count}명`)).join(', ');

  const workLine = {
    demolition: '철거·해체 후 마대 상차',
    wallpaper: '기존 벽지 제거 후 도배·장판',
    bathroom: '욕실 철거·방수·타일',
    kitchen: '기존 싱크대 철거 후 상판·수납 설치',
    tilewaterproof: '타일·방수 시공',
    plaster: '바닥 미장·양생',
    window: '창호 철거·교체',
    waste: '폐기물 수거·상차·운반',
    labor: '일용 인력 지원',
    repair: '부분 수선',
    combined: undefined,
  }[calc?.trade] || combinedWorkLine(c) || '현장 작업';

  // 현장마다 다른 핵심 디테일 — 원문(숨고 요청서)을 그대로 넣지 않고 정리된 내용만 쓴다.
  let detail = trade.label;
  if (calc?.trade === 'waste') {
    const v = wasteVehicle(c);
    detail = `${v.label} ${v.tons}톤 1대 · 성상 분리 후 상차`;
  } else if (calc?.trade === 'labor') {
    detail = `일용 인력 ${c?.sizeValue || 1}명 × ${c?.laborDays || 1}일`;
  } else if (calc?.clientSummary) {
    detail = calc.clientSummary;
  }

  const prep =
    calc?.trade === 'waste'
      ? '작업장갑·안전화·마대(성상별)·계량증명서 챙길 것'
      : calc?.trade === 'labor'
      ? '기초안전보건교육 이수증·안전화·장갑'
      : calc?.trade === 'demolition'
      ? '기초안전보건교육 이수증·안전화·장갑·마대·커터날'
      : '기초안전보건교육 이수증·안전화·장갑·보양재';

  const closing =
    calc?.trade === 'waste'
      ? '· 마치면 수거 전·후 사진과 계량증명서 사진을 남겨주세요.'
      : '· 마치면 작업 전·후 사진을 같은 자리에서 남겨주세요.';

  return [
    `[출근 안내] ${dateText} ${time} / ${place}`,
    `· 작업: ${label} — ${workLine}`,
    `· 내용: ${detail}`,
    `· 인원: ${people}`,
    `· 현장: ${floorText} · ${eveText}`,
    `· 준비물: ${prep}`,
    closing,
  ].join('\n');
}

// 엘리베이터·현관에 붙이는 A4 공사 안내문 (인쇄·PDF용)
// 이웃 게시용 공사 안내문 — 이웃이 읽는 문서다. 금액·원가·수주 메모는 절대 넣지 않는다.
const NOTICE_SCOPE = {
  demolition: '철거·해체',
  groundwork: '기초·정지(터파기·다짐)',
  wallpaper: '도배·장판',
  bathroom: '욕실 리모델링',
  kitchen: '주방 리모델링',
  entrance: '현관 공사',
  plaster: '바닥 미장',
  carpentry: '문·몰딩 보수',
  electric: '전기·조명',
  plumbing: '설비·배관',
  film: '필름·시트지',
  window: '창호 교체',
  tilewaterproof: '타일·방수',
  repair: '부분 수선',
  waste: '폐기물 수거·반출',
  labor: '인력 지원',
};

function noticeScope(c, calc) {
  const trade = calc?.trade || c?.trade;
  // 관공서 공고는 공고의 공사 종류를 그대로 쓴다
  const bidType = c?.bid ? workTypeLabel(c.bid.workTypes) : '';
  if (bidType) return `${bidType} 작업`;
  if (trade === 'combined') {
    const names = scopeList(c)
      .map((s) => NOTICE_SCOPE[s] || (s.startsWith('x:') ? s.slice(2) : ''))
      .filter(Boolean);
    if (names.length) return `${Array.from(new Set(names)).slice(0, 4).join(' · ')} 작업`;
    return hasInteriorStyle(c) ? '실내 인테리어 공사' : '철거·정리 공사';
  }
  const word = NOTICE_SCOPE[trade] || '현장 작업';
  return /리모델링|작업$/.test(word) ? word : `${word} 작업`;
}

export function constructionNotice(c, calc) {
  const start = c?.startDate || c?.dispatch?.date || kstToday();
  const days = Math.max(1, parseInt(c?.workDays, 10) || 1);
  const end = addDaysISO(start, days - 1);
  const place = c?.location || c?.title || '현장';
  const time = c?.dispatch?.time || '08:00';
  const trade = calc?.trade || c?.trade;
  const indoor = trade !== 'groundwork' && (trade !== 'combined' || hasInteriorStyle(c));
  // 공사 내용은 공종·세부 공종에서만 만든다 (견적 요약에는 공고 원가 메모가 섞여 있다)
  const scope = noticeScope(c, calc).replace(/\d[\d,.]*\s*만\s*원?/g, '').trim();
  const startLabel = korDateLabel(start);
  const endLabel = korDateLabel(end);
  const loud = trade === 'demolition' || trade === 'waste';
  const noisyDay = !indoor
    ? `${startLabel} 오전은 장비 소음·먼지가 가장 큰 날입니다. 작업은 ${time}부터 시작합니다.`
    : loud
    ? `${startLabel} 오전은 소음·분진이 가장 큰 날입니다. 작업은 ${time}부터 시작합니다.`
    : `${startLabel}부터 ${days}일간 작업합니다. 작업 시간은 ${time}~17:00입니다.`;

  return {
    title: '공 사 안 내',
    site: place,
    period: days > 1 ? `${startLabel} ~ ${endLabel} (${days}일)` : `${startLabel} (${days}일)`,
    hours: `${time} ~ 17:00`,
    scope,
    company: (() => {
      const sup = getSupplier();
      return sup.name ? `${sup.name}${sup.owner ? ` (대표 ${sup.owner})` : ''}` : c?.businessName || '인력사무소 직영';
    })(),
    lines: indoor
      ? [
          noisyDay,
          '엘리베이터·복도·현관은 보양한 뒤 사용하고, 작업이 끝나면 원상 복구합니다.',
          '공용부에 짐을 쌓아두지 않습니다. 통행이 불편하면 바로 치우겠습니다.',
          '주차·통행·소음 때문에 불편하시면 아래 번호로 연락 주세요. 바로 조정하겠습니다.',
        ]
      : [
          noisyDay,
          '작업 구역에는 안전 펜스를 세우고 통행로를 비워 두겠습니다.',
          '먼지가 날 때는 물을 뿌리고 덮개를 씌워 이웃에 퍼지지 않게 하겠습니다.',
          '장비·자재는 작업 구역 안에만 두고, 공사가 끝나면 바닥을 정리하겠습니다.',
          '통행·소음·먼지 때문에 불편하시면 아래 번호로 연락 주세요. 바로 조정하겠습니다.',
        ],
    contact: (() => {
      const sup = getSupplier();
      return sup.phone ? `${sup.phone} (현장 담당)` : '010-____-____ (현장 담당)';
    })(),
  };
}

export function constructionNoticeText(c, calc) {
  const n = constructionNotice(c, calc);
  return [
    `[${n.title}]`,
    '',
    `공사 장소: ${n.site}`,
    `공사 기간: ${n.period}`,
    `공사 시간: ${n.hours}`,
    `공사 내용: ${n.scope}`,
    `시공: ${n.company}`,
    '',
    '이웃 여러분께',
    ...n.lines.map((l) => `· ${l}`),
    '',
    `문의: ${n.contact}`,
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

// 숨고·카톡 '견적 보내기'에 그대로 붙여넣는 멘트 — 금액은 내가 부른 금액 기준, 내부 원가·순익은 절대 넣지 않는다.
export function sugoQuoteMessage(c, calc) {
  const sup = getSupplier();
  const biz = sup.name || c?.businessName || '철거·인테리어 전문';
  const label = tradeLabelOf(c, calc);
  const size = sizeText(c);
  const place = String(c?.location || c?.region || '').trim();
  const price = Math.round(Number(calc?.finalPrice) || 0);
  const items = (calc?.items || []).filter((i) => !i.excluded && Number(i.amount) !== 0);
  const has = (pred) => items.some(pred);
  const include = [
    has((i) => i.category === '폐기물') ? '폐기물 반출·처리' : '',
    has((i) => i.category === '자재') ? '자재·부자재' : '',
    has((i) => i.category === '노무') ? '기공·보조 인력' : '',
    Number(calc?.lifting?.cost) > 0 ? '자재 양중·운반' : '',
    has((i) => i.id === 'clean') || resolveSurvey(c).afterCare ? '준공 정리·청소' : '',
  ]
    .filter(Boolean)
    .join(' · ') || '자재·인력 포함';
  const trade = calc?.trade;
  // 별도(제외) 항목은 고객이 읽기 짧게 — 손님이 뺀 공종 + 이 공종에서 실제로 붙는 것만
  const excluded = [];
  if ((c?.excludedScopes || []).some((x) => x === 'window')) excluded.push('창호');
  if (['demolition', 'combined', 'bathroom', 'tilewaterproof'].includes(trade)) excluded.push('석면 발견 시 조사·처리');
  if (trade === 'demolition') excluded.push('가전·가구 등 생활폐기물');
  excluded.splice(2);
  const days = Math.max(1, parseInt(c?.workDays, 10) || estimateWorkDays(c, calc));
  const lines = [
    `안녕하세요, ${biz}입니다.`,
    `${place ? `${place} ` : ''}${size} ${label} 요청 주신 내용으로 견적 드립니다.`,
    '',
    `· 견적 금액: ${won(price)} (${c?.includeVat ? '부가세 포함' : '부가세 별도'})`,
    `· 공사 범위: ${calc?.clientSummary || calc?.targetSummary || label}`,
    `· 포함: ${include}`,
  ];
  if (excluded.length) lines.push(`· 별도: ${excluded.join(' / ')}`);
  lines.push(`· 공사 기간: ${days}일 내외 (실측 후 확정)`);
  lines.push('');
  lines.push('가견적이라 현장 상태(철거 범위·자재 수급)에 따라 조금 달라질 수 있습니다.');
  lines.push('실측 가능하신 시간 알려주시면 정확한 금액으로 다시 보내드리겠습니다.');
  lines.push('추가 작업은 사진·사유·금액·일정을 문자로 합의한 뒤 진행합니다.');
  if (trade === 'bathroom' || trade === 'tilewaterproof') lines.push('방수는 담수 48시간 확인 후 타일 시공합니다.');
  return lines.join('\n');
}

// 견적 안내 문자 — 손님에게 바로 보낼 수 있는 짧은 문자
export function estimateSms(c, calc, completedCases = [], useStrength = true) {
  const info = TRADES[calc?.trade] || TRADES.unclassified;
  const label = tradeLabelOf(c, calc);
  const price = Math.round(calc?.finalPrice || 0);
  const place = c?.location || c?.title || '현장';
  const skipLabel =
    place.includes(label) || (calc?.trade === 'demolition' && /철거/.test(place)) || (calc?.trade === 'waste' && /폐기물/.test(place));
  const lines = [
    `[${label} 견적 안내]`,
    `안녕하세요 사장님, ${place}${skipLabel ? '' : ` ${label}`} 견적 보내드립니다.`,
    `· 금액: ${wonFull(price)} (${c?.includeVat ? '부가세 포함' : '부가세 별도'})`,
    `· 범위: ${calc?.targetSummary || label}`,
    `· 기간: 협의 후 확정 / 계약금 ${calc?.plan?.deposit ?? 30}% · 잔금 ${calc?.plan?.balance ?? 30}%`,
  ];
  if (useStrength) lines.push('', ...strengthLines(c, calc, completedCases));
  lines.push('', '궁금하신 점은 언제든 연락 주세요. 감사합니다.');
  const footer = supplierFooter(c);
  if (footer) lines.push(`· ${footer}`);
  return lines.join('\n');
}

// 복합 현장의 작업 줄 — 켜 둔 세부 공종만 적는다 (철거+정지에 '도배·타일' 금지)
function combinedWorkLine(c) {
  const names = {
    demolition: '철거·해체 후 마대 상차',
    groundwork: '터파기·정지·다짐',
    wallpaper: '기존 벽지 제거 후 도배·장판',
    bathroom: '욕실 철거·방수·타일',
    kitchen: '기존 싱크대 철거 후 상판·수납 설치',
    entrance: '현관 중문·신발장·타일',
    plaster: '바닥 미장·양생',
    carpentry: '문틀·몰딩·문 교체',
    electric: '전기·조명 배선',
  };
  const list = scopeList(c).map((s) => names[s]).filter(Boolean);
  const custom = scopeList(c).filter((s) => s.startsWith('x:')).map((s) => s.slice(2));
  return [...list, ...custom].slice(0, 3).join(' → ');
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
  if (trade === 'groundwork') {
    return [{ role: '굴삭기 기사', count: 1, unit: '명' }, { role: '다짐·보조', count: pyung >= 20 ? 2 : 1, unit: '명' }];
  }
  if (trade === 'combined') {
    const scopes = scopeList(c);
    if (scopes.length && !scopes.some((x) => ['wallpaper', 'bathroom', 'kitchen', 'entrance', 'plaster', 'carpentry'].includes(x))) {
      const crew = [];
      if (scopes.includes('demolition')) crew.push({ role: '철거 기공', count: 1 }, { role: '잡부', count: pyung >= 12 ? 2 : 1 });
      if (scopes.includes('groundwork')) crew.push({ role: '굴삭기 기사', count: 1 }, { role: '다짐·보조', count: 1 });
      if (crew.length) return crew;
    }
  }
  // 철거·복합(인테리어)
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
  const wallpaperJob = hasScope(c, 'wallpaper');
  if (wallpaperJob && sizeVal > 0 && (unit === '평' || unit === '㎡')) {
    const pyung = unit === '㎡' ? sizeVal / 3.3 : sizeVal;
    lines.push(`· 벽지 로스 10% 반영: 벽 ${(pyung * 2.3).toFixed(1)}평 × 1.1 = ${(pyung * 2.3 * 1.1).toFixed(1)}평분`);
    lines.push(`· 장판 로스 10% 반영: ${Math.round(pyung * 2.3)}㎡ × 1.1 = ${Math.round(pyung * 2.3 * 1.1)}㎡`);
  } else if (wallpaperJob && parseFloat(c?.sizeValue) > 0) {
    lines.push(`· 소요량 ${c.sizeValue}${unit} × 1.1(로스 10%) = ${(parseFloat(c.sizeValue) * 1.1).toFixed(2)}${unit}`);
  }
  // 선택 사양은 인테리어·마감 현장만 — 철거·정지에 '합지·타일'이 붙으면 안 된다
  if (combo.length && hasInteriorStyle(c)) {
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
    '',
    supplierFooter(c),
  ].join('\n');
}

export function neighborMessage(c) {
  const start = c?.dispatch?.date || '착공일';
  const sup = getSupplier();
  const who = sup.phone ? `${sup.phone}` : '아래 번호';
  return `안녕하세요, ${c?.location || '○○호'} 공사를 맡은 ${sup.name || '현장 담당'}입니다. ${start}부터 공사하며, 소음이 큰 날은 철거일입니다. 불편하시면 ${who}로 연락 주세요. 최대한 조정하겠습니다.`;
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
  const lines = allocateClientLines(trade, calc, c);
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
    period: (() => {
      const start = c?.startDate || c?.dispatch?.date || '';
      if (!start) return '미정';
      const days = Math.max(1, parseInt(c?.workDays, 10) || 1);
      return `${start} ~ ${addDaysISO(start, days - 1)} (${days}일)`;
    })(),
    applicant: {
      shopName: c?.subsidyApplicant?.shopName || c?.clientName || '',
      owner: c?.subsidyApplicant?.owner || '',
      bizNo: c?.subsidyApplicant?.bizNo || '',
      closeDate: c?.subsidyApplicant?.closeDate || '',
      address: c?.subsidyApplicant?.address || c?.location || '',
      areaSqm: Number(c?.subsidyApplicant?.areaSqm) || areaSqm,
    },
    supplier: (() => {
      const saved = getSupplier();
      return {
        name: saved.name || c?.businessName || '',
        owner: saved.owner || '',
        bizNo: saved.bizNo || '',
        phone: saved.phone || '',
        address: saved.address || '',
      };
    })(),
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
