// 견적 3자 검증 — "내가 낸 견적이 전문가·시세 입장에서 괜찮은가?"
// 1) 보수적 원가(예비비 포함) 대비 마진  2) 빠진 비용 체크  3) 권장가와의 차이
import { TRADES } from './constants.js';

const n = (v) => Math.round(Number(v) || 0).toLocaleString('ko-KR');

const MISSING_CHECKS = [
  { id: 'protect', label: '보양(엘베·복도·현관)', ids: ['protect', 'protectLevel'], survey: 'protectLevel', cost: '8만/곳', why: '공용부 파손 배상은 전액 우리 부담입니다' },
  { id: 'waste', label: '폐기물 반출', ids: ['waste', 'waste_actual', 'waste_disposal'], category: '폐기물', cost: '30만~/대', why: '철거재를 남기면 손님이 직접 처리해야 합니다' },
  { id: 'lift', label: '양중·운반(층수·엘베)', ids: ['lift', 'materialLift', 'ladderSmall'], cost: '12~35만', why: '엘베 없으면 인건비가 하루 더 듭니다' },
  { id: 'admin', label: '관리사무소 신고·동의서', ids: ['deposit'], survey: 'adminDeposit', cost: '8만', why: '신고 없이 착공하면 중단될 수 있습니다' },
  { id: 'clean', label: '준공 청소', ids: ['clean'], survey: 'afterCare', cost: '45만', why: '준공 검수에서 가장 많이 지적되는 항목입니다' },
];

export function verifyEstimate(c, calc) {
  const price = Number(calc.clientPrice) || 0;
  const cost = Number(calc.costWithBuffer) || 0;
  const bufferedProfit = price - cost;
  const margin = price > 0 ? Math.round((bufferedProfit / price) * 100) : 0;
  const suggested = Number(calc.suggestedPrice) || 0;
  const gap = price - suggested;
  const info = TRADES[calc.trade] || TRADES.unclassified;
  const ids = new Set((calc.items || []).map((i) => i.id));
  const categories = new Set((calc.items || []).map((i) => i.category));

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

  const relevant = MISSING_CHECKS.filter((chk) => {
    if (chk.id === 'clean' && calc.trade === 'waste') return false;
    if (chk.id === 'protect' && calc.trade === 'labor') return false;
    return true;
  });

  const missing = relevant.map((chk) => {
    const ok = chk.ids.some((id) => ids.has(id)) || (chk.category && categories.has(chk.category)) || (chk.survey && c?.survey?.[chk.survey]);
    return { ...chk, ok };
  });

  const missingCost = missing.filter((m) => !m.ok).length;

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
    missing,
    missingCost,
    margin,
    bufferedProfit,
    gap,
    targetMargin: calc.marginTarget,
    tradeLabel: info.short,
    advice:
      missingCost > 0
        ? `빠진 비용 ${missingCost}가지가 있습니다. 먼저 '빠진 비용 한 번에 넣기'로 채운 뒤 다시 검증하세요.`
        : '빠진 비용은 없습니다. 예비비를 포함한 보수적 원가로도 여유가 있는지 마지막으로 확인하세요.',
  };
}
