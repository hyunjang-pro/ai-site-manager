// 고객용 문서·문자 생성 모듈 — 공종별로 정확한 자재/스펙만 출력한다.
import { TRADES, COLLECTION_LABEL } from './constants';
import { wonFull, sizeText } from './pricing';
import { assessAsbestos } from './asbestos';
import { subsidyInfo, SUBSIDY_CONDITIONS, SUBSIDY_DOCS } from './subsidy';

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

export function buildQuote(c, calc, design, waste) {
  const trade = calc?.trade || c?.trade || 'unclassified';
  const info = TRADES[trade] || TRADES.unclassified;
  const asb = assessAsbestos(c?.asbestos || {});
  const materialLines = (calc?.items || []).filter((it) => it.category === '자재' && !it.excluded && it.amount !== 0);
  const otherLines = (calc?.items || []).filter((it) => it.category !== '자재' && it.amount !== 0 && !it.excluded);

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
    clauses.push('폐기물 처리비는 계상된 차량 대수 기준이며, 초과 발생 시 1톤차 42만원 · 2.5톤차 75만원으로 실비 정산합니다.');
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

  const notes = [];
  if (calc?.lifting?.warnings?.length) calc.lifting.warnings.forEach((w) => notes.push(w));
  if (c?.survey?.loadBearingWall) notes.push('내력벽 철거는 구조검토 없이 착공할 수 없습니다. 착공 전 구조기술사 검토가 필요합니다.');
  if (c?.paymentPlanWarning) notes.push(c.paymentPlanWarning);
  if (design?.detailRows?.length) notes.push(`디자인 디테일(${design.detailRows.map((d) => d.label).join(', ')}) 포함 — 공사 기간 ${design.days}일 추가 반영.`);

  const baseLines = [
    { name: '공사 범위', detail: calc?.targetSummary || '', amount: null },
  ];

  const depositRatio = calc?.plan?.deposit ?? 30;
  const midRatio = calc?.plan?.mid ?? 40;
  const balanceRatio = calc?.plan?.balance ?? 30;

  return {
    title: `${info.label} ${(calc?.changeLogs || []).length ? '최종 견적서' : '견적서'}`,
    client: c?.clientName || '고객',
    site: c?.location || c?.title || '현장',
    size: sizeText(c),
    date: c?.createdAt || new Date().toISOString().slice(0, 10),
    baseLines,
    materialLines,
    otherLines,
    items: calc?.items || [],
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
    paymentText: `계약금 ${depositRatio}% · 중도금 ${midRatio}% · 잔금 ${balanceRatio}% (잔금은 준공 검수 후)`,
    wasteSummary: waste
      ? `폐기물 예상 ${waste.totalTons}톤 — ${waste.hasBoard ? '폐보드·판넬 혼합' : '혼합'} 기준 ${waste.mixedWon.toLocaleString('ko-KR')}원 / 성상 분리 시 ${waste.separatedWon.toLocaleString('ko-KR')}원`
      : '',
  };
}

export function quoteText(doc, calc) {
  const lines = [];
  lines.push(`[${doc.title}]`);
  lines.push(`${doc.client} / ${doc.site} / ${doc.size}`);
  lines.push(`작성일: ${doc.date}`);
  lines.push('');
  lines.push(`■ 공사 범위`);
  lines.push(
    doc.items
      .filter((i) => i.amount > 0 && !i.excluded)
      .map((i) => ` · ${i.name}${i.detail ? ` (${i.detail})` : ''} — ${i.amount}만원`)
      .join('\n')
  );
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
  const crew = c?.crew && c.crew.length ? c.crew : defaultCrew(calc?.trade);
  const people = crew.map((p) => `${p.role} ${p.count}명`).join(', ');
  const time = c?.dispatch?.time || '08:00';
  const date = c?.dispatch?.date || '내일';

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
    `· 작업내용: ${c?.notes ? c.notes.slice(0, 60) : workByTrade[calc?.trade] || '현장 작업'}`,
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

export function defaultCrew(trade) {
  if (trade === 'bathroom') return [{ role: '타일 기공', count: 1 }, { role: '보조', count: 1 }];
  if (trade === 'kitchen') return [{ role: '설치 기공', count: 2 }];
  if (trade === 'wallpaper') return [{ role: '도배 기공', count: 1 }, { role: '보조', count: 1 }];
  return [{ role: '철거 기공', count: 1 }, { role: '잡부', count: 2 }];
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
    `· 챙길 서류: ${SUBSIDY_DOCS.map((d) => d.label).join(' / ')}`,
    `· 신청: 소상공인24(sbiz24.kr) 또는 1533-0100`,
    ``,
    `공사내역서와 전자세금계산서는 저희가 바로 발급해 드립니다. 철거 전·후 사진은 제가 같은 자리에서 찍어 두겠습니다.`,
  ].join('\n');
}
