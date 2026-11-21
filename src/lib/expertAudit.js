// 전문가 검증 리포트 — 20년 차 현장 감리·제3자 입장에서 가견적을 따로 검증한다.
// 가견적 계산(원가·마진)을 그대로 반복하지 않고,
//  1) 시장 호가 밴드 안에서 우리 견적이 어디인지(독립 벤치마크)
//  2) 이 현장 조건에서 터질 확률이 높은 숨은 추가비(리스크 감사)
//  3) 손해 안 보고 수주하기 위한 계약 방어 조항
// 세 가지를 낸다. Gemini가 연결되면 분석 내용만 AI가 다시 쓰고, 숫자 밴드는 DB 기준을 유지한다.
import { similarCases } from './reference.js';
import { TRADES, hasScope } from './constants.js';
import { korMonth, kstToday } from './date.js';

const n = (v) => Math.round(Number(v) || 0).toLocaleString('ko-KR');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function scopeSet(c, calc) {
  const out = new Set(Array.isArray(c?.subScopes) ? c.subScopes : []);
  if (calc?.trade) out.add(calc.trade);
  return out;
}

// ---- 1. 시장 호가 밴드 (독립 벤치마크) ----
// 사례 금액을 우리 현장 규모로 환산(같은 단위일 때)하고, 규모가 크게 다른 이상치(중간값의 0.45~2.2배 밖)는 뺀다.
// → "34평 115만" 같은 다른 조건 견적이 15평 시장 최저로 둔갑해 판정을 흔드는 일을 막는다.
export function marketBenchmark(c, calc, completedCases = []) {
  const sim = similarCases(c, calc, completedCases);
  const ourSize = parseFloat(String(sim.size || '').replace(/[^0-9.]/g, '')) || 0;
  const ourUnit = String(sim.size || '').replace(/[0-9.]/g, '') || '평';

  const scaled = (sim.items || [])
    .filter((x) => Number(x.low) > 0)
    .map((x) => {
      const size = Number(x.size) || 0;
      const unit = x.unit || ourUnit;
      const factor = unit === ourUnit && size > 0 && ourSize > 0 ? Math.max(0.5, Math.min(2, ourSize / size)) : 1;
      const low = Math.round(Number(x.low) * factor);
      const high = Math.round(Math.max(Number(x.high) || 0, Number(x.low) || 0) * factor);
      return { ...x, low, high, mid: (low + high) / 2, factor };
    })
    .filter((x) => x.low > 0);

  const mids = scaled.map((x) => x.mid).sort((a, b) => a - b);
  const median = mids.length ? mids[Math.floor(mids.length / 2)] : 0;
  const kept = median > 0 ? scaled.filter((x) => x.mid >= median * 0.45 && x.mid <= median * 2.2) : scaled;
  const cases = kept.length >= 2 ? kept : scaled;

  const low = Math.round(Math.min(...cases.map((x) => x.low)));
  const high = Math.round(Math.max(...cases.map((x) => x.high)));
  const avg = Math.round(cases.reduce((s, x) => s + x.mid, 0) / Math.max(1, cases.length));
  const ours = Math.round(Number(calc?.clientPrice) || 0);
  const posPct = high > low ? clamp(Math.round(((ours - low) / (high - low)) * 100), -20, 120) : 50;

  let verdict;
  if (!ours) {
    verdict = { tone: 'info', label: '비교 전', text: '견적 금액이 아직 없습니다.' };
  } else if (ours < low * 0.92) {
    verdict = {
      tone: 'bad',
      label: '저가 수주 주의',
      text: `시장 최저 ${n(low)}만보다 ${n(low - ours)}만 낮습니다. 이 가격이면 원가·하자 리스크를 우리가 떠안습니다.`,
    };
  } else if (ours > high * 1.08) {
    verdict = {
      tone: 'warn',
      label: '고가 이탈 주의',
      text: `시장 고급 ${n(high)}만보다 ${n(ours - high)}만 높습니다. 자재 등급·일정 근거를 문서로 보여주지 않으면 수주가 어렵습니다.`,
    };
  } else if (ours > avg * 1.15) {
    verdict = {
      tone: 'info',
      label: '시장 상단',
      text: `시장 평균 ${n(avg)}만보다 ${n(ours - avg)}만 높은 상단입니다. 조건·자재 근거를 문서로 붙여야 수주됩니다.`,
    };
  } else {
    verdict = {
      tone: 'ok',
      label: '적정선',
      text: `시장 ${n(low)}~${n(high)}만의 안쪽입니다. 같은 조건 견적과 비교해도 설명이 되는 가격입니다.`,
    };
  }

  return {
    low,
    avg,
    high,
    ours,
    posPct,
    verdict,
    sample: cases.length,
    ownCount: cases.filter((x) => x.own).length,
    cases: cases
      .slice()
      .sort((a, b) => Math.abs(a.mid - ours) - Math.abs(b.mid - ours))
      .slice(0, 3)
      .map((x) => ({ id: x.id, title: x.title, low: x.low, high: x.high, note: x.note, source: x.source })),
    tradeLabel: (TRADES[calc?.trade] || TRADES.unclassified).short,
  };
}

// ---- 2. 숨은 함정 리스크 감사 ----
export function hiddenRisks(c, calc) {
  const trade = calc?.trade || c?.trade;
  const scopes = scopeSet(c, calc);
  const year = parseInt(String(c?.asbestos?.builtYear || '').replace(/[^0-9]/g, '').slice(0, 4), 10) || 0;
  const floor = parseInt(c?.lifting?.floor, 10) || 0;
  const noElev = c?.lifting?.elevator === 'no';
  const notes = `${c?.notes || ''} ${c?.rawInput || ''} ${c?.siteCondition || ''}`;
  const living = c?.survey?.residential || /거주|사는|입주|영업\s*중|영업중/.test(notes);
  const nowMonth = korMonth(kstToday());
  const risks = [];
  const add = (r) => risks.push(r);

  const roughCeiling = c?.asbestos?.ceiling && c?.asbestos?.ceiling !== 'unknown';
  if (['demolition', 'bathroom', 'tilewaterproof', 'plaster', 'combined', 'custom', 'unclassified'].includes(trade) && ((year && year <= 1999) || roughCeiling || c?.asbestos?.insulation === 'yes')) {
    add({
      id: 'asbestos',
      weight: 10,
      title: `석면 의심${year ? ` (${year}년 준공)` : ''}`,
      why: '1999년 이전 건물의 텍스·보드 천장은 석면 함유가 흔합니다. 일반 철거로 뜯으면 과태료·공사 중단이 나고, 비용은 일반의 2~5배입니다.',
      cost: '조사 30~80만 · 해체·처리 200~400만',
      action: '철거 전 전문기관 조사(건축물석면조사) 여부를 계약서에 못 박으세요.',
      severity: 'high',
    });
  }
  if (['demolition', 'bathroom', 'tilewaterproof', 'kitchen', 'combined', 'waste'].includes(trade) && c?.survey?.wasteMixed) {
    add({
      id: 'wasteMixed',
      weight: 9,
      title: '폐기물 성상 혼합 반출',
      why: '폐타일·폐보드를 혼합으로 반출하면 처리단가가 1톤 7.3만 → 19.3만으로 2.6배가 됩니다. 우리가 흡수하면 남는 돈이 통째로 사라집니다.',
      cost: '1톤당 +12만 · 3톤이면 +36만',
      action: '반출 전 성상별 분리(불연·가연·재활용)를 현장 조건에 넣고, 분리 비용을 견적에 반영하세요.',
      severity: 'high',
    });
  }
  if (noElev && floor >= 3) {
    add({
      id: 'carry',
      weight: 8,
      title: `엘리베이터 없는 ${floor}층 반출·양중`,
      why: '계단 반출은 연인원이 하루 더 붙습니다. 답사 때 동선을 못 보면 견적에서 통째로 빠집니다.',
      cost: '인력 반출 1일 25~60만 · 사다리차 12~55만',
      action: '반출 동선(계단 폭·주차 위치·사다리차 설치 자리)을 사진으로 남기고 비용을 확정하세요.',
      severity: 'high',
    });
  }
  if (['bathroom', 'kitchen', 'plumbing', 'combined', 'repair'].some((t) => scopes.has(t)) && year && year <= 1995) {
    add({
      id: 'oldPipe',
      weight: 7,
      title: '노후 급배수·배관',
      why: '1995년 이전 구축은 철거 후 배관 균열이 드러납니다. 마감을 다시 뜯어야 해서 하자 처리비가 가장 크게 튀는 항목입니다.',
      cost: '배관 교체 1개소 25~45만 · 누수 시 마감 재시공 +80만',
      action: '철거 직후 배관 상태를 사진으로 남기고, 교체 여부를 손님과 문자로 합의하세요.',
      severity: 'mid',
    });
  }
  if (trade === 'kitchen' || scopes.has('kitchen')) {
    add({
      id: 'counter',
      weight: 6,
      title: '상판 실측·수전 홀 변경 불가',
      why: '상판은 가공 후 수전 홀 위치를 바꿀 수 없습니다. 실측이 틀리면 상판을 다시 사야 합니다.',
      cost: '재가공·재구매 40~80만',
      action: '실측 확정(벽→수전 중심) 후 발주하고, 가공 후 변경 불가를 계약서에 적으세요.',
      severity: 'mid',
    });
  }
  if (['bathroom', 'tilewaterproof'].some((t) => scopes.has(t))) {
    add({
      id: 'waterproof',
      weight: 8,
      title: '방수 담수 48시간 미준수',
      why: '담수 확인 없이 타일을 올리면 아래층 누수로 하자 3년 책임이 따라옵니다. 손해액이 공사비를 넘는 대표 항목입니다.',
      cost: '누수 하자 200~500만 · 마감 재시공',
      action: '담수 48시간·사진 3컷을 조건으로 넣고, 확인 후 타일 착수로 문구를 고정하세요.',
      severity: 'high',
    });
  }
  if (living) {
    add({
      id: 'living',
      weight: 6,
      title: '거주·영업 중 시공',
      why: '보양·분진·소음 민원으로 작업 시간이 줄고 일정이 밀립니다. 민원 한 건이 전체 일정을 밀 수 있습니다.',
      cost: '보양·방진 +15~40만 · 일정 1~2일 지연',
      action: '작업 시간(예: 9~18시)·엘베 사용·이웃 안내를 계약 전에 정하고 보양 범위를 명시하세요.',
      severity: 'mid',
    });
  }
  if (floor >= 5 && c?.lifting?.ladderAllowed === 'no') {
    add({
      id: 'liftBan',
      weight: 7,
      title: '사다리차 설치 불가',
      why: '5층 이상인데 사다리차를 세울 수 없으면 자재·폐기물을 전부 인력으로 올리고 내려야 합니다.',
      cost: '자재 양중 1회 15만 · 5층 이상 시간당 25만',
      action: '관리사무소·도로 점용 가능 여부를 먼저 확인하고, 불가하면 양중비를 견적에 넣으세요.',
      severity: 'mid',
    });
  }
  if (nowMonth >= 6 && nowMonth <= 8) {
    add({
      id: 'rainy',
      weight: 4,
      title: '우기(장마) 공정 지연',
      why: '방수·도장·도배 건조가 밀려 일정이 늘고, 습기로 들뜸 하자가 생깁니다.',
      cost: '건조 지연 2~3일 · 일당 25만씩',
      action: '우기에는 방수·도배 일정을 여유 있게 잡고, 환기·제습 장비를 준비하세요.',
      severity: 'low',
    });
  } else if (nowMonth === 12 || nowMonth <= 2) {
    add({
      id: 'cold',
      weight: 4,
      title: '한파 마감 지연',
      why: '5℃ 이하에서는 몰탈·방수·도배 건조가 늦고, 얼면 하자로 돌아옵니다.',
      cost: '건조 지연 1~3일 · 난방·보온 +10~30만',
      action: '난방·보온 계획과 공사기간 여유를 계약서에 함께 적으세요.',
      severity: 'low',
    });
  }
  if (calc?.isBid) {
    add({
      id: 'bidQty',
      weight: 9,
      title: '설계내역서 물량 차이',
      why: '공고는 설계내역서와 현장이 다를 때가 많습니다. 물량이 10~20% 늘면 수주금액 그대로 원가만 오릅니다.',
      cost: '물량 10% 증가 시 남는 돈 절반 소실',
      action: '설계내역서·현장설명서와 실측 물량을 대조하고, 물량 증감 정산 조항을 확인하세요.',
      severity: 'high',
    });
  }
  if (trade === 'labor' || scopes.has('labor')) {
    add({
      id: 'laborScope',
      weight: 6,
      title: '작업 범위가 문자로 안 남음',
      why: '일용 파견은 “그거까지 해달라”는 추가 요구가 붙기 쉽습니다. 범위가 없으면 반나절이 그냥 사라집니다.',
      cost: '반나절~1일 25~50만',
      action: '인원·일수·작업 범위(예: 상차·정리 제외)를 문자로 남기고 추가는 새 견적으로 받으세요.',
      severity: 'mid',
    });
  }
  if (trade === 'window' || scopes.has('window')) {
    add({
      id: 'windowLeak',
      weight: 5,
      title: '창호 하자보수 2년',
      why: '창호는 설치 후 누수·결로 하자가 2년까지 따라옵니다. 실리콘·플래싱을 빼면 그 비용을 우리가 냅니다.',
      cost: '재시공 1개소 20~60만',
      action: '실리콘·플래싱 포함 여부와 하자보수 기간(2년)을 계약서에 명시하세요.',
      severity: 'mid',
    });
  }
  if (!risks.length) {
    add({
      id: 'scope',
      weight: 5,
      title: '작업 범위 경계 모호',
      why: '철거 범위·자재 반입·정리 주체가 말로만 정해지면 준공 직전에 추가 요구가 붙습니다.',
      cost: '추가 1일 25~50만',
      action: '포함/제외 범위를 견적서 제외 사항에 한 줄씩 적고 문자로 확인받으세요.',
      severity: 'mid',
    });
  }

  return risks
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map(({ weight, ...r }) => r);
}

// ---- 3. 계약 방어 팁 ----
export function contractDefense(c, calc) {
  const trade = calc?.trade || c?.trade;
  const scopes = scopeSet(c, calc);
  const tips = [];
  tips.push('당초 견적에 없는 추가 작업은 사진·사유·금액·일정 4가지를 문자로 합의한 뒤 진행하세요. 구두 지시만으로는 대금 청구가 어렵습니다(대법원 95다38066).');
  if (trade === 'demolition' || scopes.has('demolition') || scopes.has('waste')) {
    tips.push('폐기물 처리비는 계상한 차량·톤 기준으로 하고, 초과분은 실비 정산한다는 문구를 넣으세요(작업 전 고지).');
  }
  if (['bathroom', 'tilewaterproof'].some((t) => scopes.has(t))) {
    tips.push('방수는 담수 48시간 확인 후 타일 착수, 하자보수 3년을 계약서에 적으세요.');
  }
  if (trade === 'kitchen' || scopes.has('kitchen')) {
    tips.push('상판은 실측 확정 후 발주하고, 가공 후 수전 홀 변경 불가는 손님 확인을 받아 두세요.');
  }
  const year = parseInt(String(c?.asbestos?.builtYear || '').replace(/[^0-9]/g, '').slice(0, 4), 10) || 0;
  if (year && year <= 1999) {
    tips.push('석면 의심 자재가 나오면 조사·처리 비용은 별도라는 조항을 넣으세요.');
  }
  if (!calc?.isBid) {
    tips.push('잔금은 20% 이상, 준공 검수 후 지급으로 두세요. 선금 100% 요구는 역으로 우리가 위험해집니다.');
  } else {
    tips.push('공고는 설계내역서·현장설명서와 실측 물량을 대조하고, 물량 증감 정산 기준을 확인하세요.');
  }
  return tips.slice(0, 2);
}

// AI가 준 문장이 있으면 그 문장을 우선 쓰되, 숫자·밴드는 DB 계산을 유지한다.
export function mergeAiAudit(local, ai) {
  if (!ai || typeof ai !== 'object') return { ...local, source: 'local' };
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const risks = Array.isArray(ai.risks)
    ? ai.risks
        .map((r, i) => ({
          id: `ai-${i}`,
          title: str(r?.title) || str(r?.name),
          why: str(r?.why) || str(r?.detail),
          cost: str(r?.cost),
          action: str(r?.action) || str(r?.fix),
          severity: ['high', 'mid', 'low'].includes(r?.severity) ? r.severity : 'mid',
        }))
        .filter((r) => r.title)
        .slice(0, 3)
    : [];
  const contract = Array.isArray(ai.contract)
    ? ai.contract.map(str).filter(Boolean).slice(0, 2)
    : str(ai.contract)
    ? [str(ai.contract)]
    : [];
  return {
    ...local,
    headline: str(ai.headline) || local.headline,
    summary: str(ai.summary) || local.summary,
    market: {
      ...local.market,
      // AI는 해석만 덧붙이고, 시장 밴드 숫자는 우리 DB 기준을 그대로 쓴다
      comment: str(ai.market) || str(ai.marketComment) || '',
    },
    risks: risks.length >= 2 ? risks : local.risks,
    contract: contract.length ? contract : local.contract,
    source: 'ai',
  };
}

export function expertAudit(c, calc, completedCases = [], ai = null) {
  const market = marketBenchmark(c, calc, completedCases);
  const risks = hiddenRisks(c, calc);
  const contract = contractDefense(c, calc);
  const headline = `${market.tradeLabel} 시장 ${n(market.low)}~${n(market.high)}만 · 우리 견적 ${n(market.ours)}만은 ${market.verdict.label}입니다`;
  const summary =
    market.verdict.tone === 'bad'
      ? '감리 입장에서 이 가격은 시장 하한을 벗어났습니다. 범위를 줄이거나 가격을 올리지 않으면 하자 한 번에 적자입니다.'
      : market.verdict.tone === 'warn'
      ? '시장 상단을 넘었습니다. 가격을 유지하려면 자재 등급·공정 근거를 손님 문서로 보여주세요.'
      : market.verdict.tone === 'info'
      ? '시장 밴드의 위쪽입니다. 가격을 유지하려면 조건(층수·반출·자재) 근거를 문서로 붙이세요.'
      : '시장 밴드 안의 가격입니다. 남은 것은 이 현장에서 터질 숨은 비용을 막는 일입니다.';
  const local = { market, risks, contract, headline, summary, source: 'local' };
  return mergeAiAudit(local, ai);
}
