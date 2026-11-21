// 견적 3자 검증 — "내가 낸 견적이 전문가·시세 입장에서 괜찮은가?"
// 1) 보수적 원가(예비비 포함) 대비 마진  2) 부대비용 포함 상태  3) 권장가와의 차이
import { TRADES } from './constants.js';
import { siteCostRows } from './site.js';

const n = (v) => Math.round(Number(v) || 0).toLocaleString('ko-KR');

export function verifyEstimate(c, calc) {
  const price = Number(calc.clientPrice) || 0;
  const cost = Number(calc.costWithBuffer) || 0;
  const bufferedProfit = price - cost;
  const margin = price > 0 ? Math.round((bufferedProfit / price) * 100) : 0;
  const suggested = Number(calc.suggestedPrice) || 0;
  const gap = price - suggested;
  const info = TRADES[calc.trade] || TRADES.unclassified;

  let verdict;
  if (calc.isBelowBreakEven || bufferedProfit <= 0) {
    verdict = {
      tone: 'bad',
      label: '주의 · 손해 위험',
      headline: '이 가격이면 남는 돈이 없습니다',
      detail: `보수적 원가 ${n(cost)}만(예비비 ${calc.bufferRate}% 포함)보다 계약가가 낮습니다. 이 상태로 착공하면 하자 한 번에 적자입니다.`,
    };
  } else if (margin < 10) {
    verdict = {
      tone: 'warn',
      label: '주의 · 너무 싸서 손해 위험',
      headline: `보수적 여유가 ${n(bufferedProfit)}만(${margin}%)뿐입니다`,
      detail: `예비비 ${calc.bufferRate}%를 넣으면 마진이 ${margin}%로 떨어집니다. 자재·인건비가 5%만 올라도 손해입니다. 권장가 ${n(suggested)}만까지 올리거나 범위를 줄이세요.`,
    };
  } else if (gap > suggested * 0.12) {
    verdict = {
      tone: 'info',
      label: '시세보다 높음 · 근거 챙기기',
      headline: `권장가보다 ${n(gap)}만 높습니다`,
      detail: `보수적 여유는 ${n(bufferedProfit)}만(${margin}%)로 충분합니다. 다만 손님에게 '왜 이 가격인지' 근거(자재 등급·고난도 마감·일정)를 함께 보내세요.`,
    };
  } else {
    verdict = {
      tone: 'ok',
      label: '안전 · 적정 마진',
      headline: `보수적 여유 ${n(bufferedProfit)}만(${margin}%)`,
      detail: `예비비 ${calc.bufferRate}%를 넣고도 마진이 남습니다. 지금 가격으로 진행해도 됩니다.`,
    };
  }

  // 현장 조건에 맞는 부대비용은 처음부터 견적에 들어간다 — 경고가 아니라 '포함/뺌' 상태로 보여준다.
  const siteCosts = siteCostRows(c);
  const offRows = siteCosts.filter((r) => !r.on);
  const includedTotal = siteCosts.filter((r) => r.on).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const rows = [
    { label: '계약가(공급가)', value: `${n(price)}만`, tone: 'plain' },
    { label: `보수적 원가 (예비비 ${calc.bufferRate}%)`, value: `${n(cost)}만`, tone: 'plain', hint: `기본 원가 ${n(calc.totalDirectCost)}만 + ${n(calc.costBuffer)}만` },
    { label: '보수적 여유', value: `${bufferedProfit >= 0 ? '+' : ''}${n(bufferedProfit)}만 (${margin}%)`, tone: margin < 10 ? 'bad' : 'good' },
    { label: '권장가(같은 마진 기준)', value: `${n(suggested)}만`, tone: 'brand' },
    { label: '시세 대비', value: gap > 0 ? `+${n(gap)}만 높음` : gap < 0 ? `${n(Math.abs(gap))}만 낮음` : '권장가와 같음', tone: gap > suggested * 0.12 ? 'warn' : 'plain' },
  ];

  return {
    verdict,
    rows,
    siteCosts,
    // 예전 화면·테스트와의 호환 — 이제 '빠짐'이 아니라 '현장에 필요해 뺀 항목'이다
    missing: siteCosts.map((r) => ({ ...r, ok: r.on, why: r.why })),
    missingCost: offRows.length,
    includedTotal,
    margin,
    bufferedProfit,
    gap,
    targetMargin: calc.marginTarget,
    tradeLabel: info.short,
    advice: offRows.length
      ? `${siteCosts.filter((r) => r.on).length}개 부대비용은 이미 견적에 포함되어 있습니다. 필요 없는 항목만 눌러 빼세요.`
      : '현장 조건에 맞는 부대비용이 모두 견적에 들어가 있습니다. 현장에서 달라진 것만 3. 답사에 적으세요.',
  };
}
