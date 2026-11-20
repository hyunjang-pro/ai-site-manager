// 석면 조기경보 (P0-2)
export const ASBESTOS_CLAUSE =
  '석면 함유 자재 발견 시 공사를 중지하고, 조사·해체·처리는 별도 계약으로 정한다. (조사 결과에 따른 추가 비용·공기 지연은 본 견적에 포함되지 않는다)';

export const ASBESTOS_UNIT_PRICE = 645000; // 폐석면 원/톤
export const TEX_KG_PER_SQM = 9.5;

export function assessAsbestos(a = {}) {
  const year = parseInt(a.builtYear, 10);
  const usage = a.usage || 'unknown'; // house | nonhouse | facility | unknown
  const ceiling = a.ceiling || 'unknown'; // tex | gypsum | none | unknown
  const roof = a.roof || 'unknown'; // slate | tile | unknown
  const insulation = a.insulation === 'yes';
  const area = Math.max(0, parseFloat(a.areaSqm) || 0);

  const reasons = [];
  if (Number.isFinite(year) && year > 0 && year <= 1998) reasons.push(`${year}년 준공 — 1998년 이전 건축물`);
  if (ceiling === 'tex') reasons.push('천장 텍스(석면 함유 가능)');
  if (roof === 'slate') reasons.push('슬레이트 지붕');
  if (insulation) reasons.push('배관 보온재·단열재 사용');

  const suspected = reasons.length > 0;
  const unknown = !Number.isFinite(year) && ceiling === 'unknown' && roof === 'unknown';

  // 기관석면조사 대상 판정 (산업안전보건법 시행령 §89)
  let agencyRule = null;
  if (usage === 'house') agencyRule = '주택: 연면적 200㎡ 이상이면서 철거 부분 200㎡ 이상';
  else if (usage === 'nonhouse') agencyRule = '주택 외 건축물: 연면적 50㎡ 이상이면서 철거 부분 50㎡ 이상';
  else if (usage === 'facility') agencyRule = '설비: 면적 15㎡ 이상 또는 부피 1㎥ 이상(배관 80m)';
  const agencyRequired =
    usage === 'house' ? area >= 200 : usage === 'nonhouse' ? area >= 50 : usage === 'facility' ? area >= 15 : null;

  // 폐석면 처리비 추정: 텍스 면적 × 9.5kg/㎡ × 645,000원/톤
  const texArea = ceiling === 'tex' ? area || 0 : 0;
  const texTons = +((texArea * TEX_KG_PER_SQM) / 1000).toFixed(2);
  const disposalWon = Math.round(texTons * ASBESTOS_UNIT_PRICE);

  const timeline = [
    { day: 'D-21', title: '일반석면조사 의뢰', detail: '면적 기준 없이 철거 전 모든 건축물이 대상. 의무자는 건축물 소유주·임차인.' },
    { day: 'D-14', title: '기관석면조사(해당 시)', detail: agencyRule || '규모를 입력하면 기관조사 대상 여부를 판정합니다.' },
    { day: 'D-10', title: '석면해체·제거업 등록업체 계약', detail: '일반 철거업체는 해체 불가. 등록업체만 가능.' },
    { day: 'D-7', title: '착수 7일 전 신고', detail: '관할 지자체(고용노동부·시·군·구)에 해체·제거 신고.' },
    { day: 'D-3', title: '감리(800㎡ 이상)', detail: '800㎡ 이상 해체 시 석면감리인 배치.' },
    { day: 'D-1', title: '농도측정·비산 방지', detail: '음압·비닐 보양, 작업자 보호구.' },
    { day: 'D-DAY', title: '해체 후 지정폐기물 처리', detail: '폐석면 전용 용기·운반·처리(645,000원/톤).' },
  ];

  return {
    suspected,
    unknown,
    reasons,
    agencyRequired,
    agencyRule,
    timeline,
    texArea,
    texTons,
    disposalWon,
    inspectionWon: { min: 300, max: 750 }, // 조사+철거+운반 사례 범위(만원)
    clause: ASBESTOS_CLAUSE,
    summary: suspected
      ? '석면 의심 조건입니다. 사진만으로 확정할 수 없고, 조사 결과 전에는 천장재를 뜯지 마세요.'
      : unknown
      ? '준공연도·천장재를 모르면 석면 의심 여부를 판단할 수 없습니다. 실측 때 확인하세요.'
      : '입력값 기준 석면 의심 조건은 없습니다. 다만 1998년 이전 자재가 일부 남아 있을 수 있어 철거 중 발견되면 즉시 중지하세요.',
  };
}

export function asbestosSurchargeManwon(a) {
  const r = assessAsbestos(a);
  return r.suspected ? 30 : 0; // 사전조사 착수비(만원)
}
