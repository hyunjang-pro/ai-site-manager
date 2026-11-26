// 답사 변동(3단계)이 4단계·5단계 수치에 일관되게 반영되는지 계산 파이프라인 검사.
// 실행: node test/linkage-v314.mjs
import { classifyRequest } from '../src/lib/classify.js';
import { composeCase } from '../src/lib/storage.js';
import { computeEstimate } from '../src/lib/pricing.js';
import { buildQuote } from '../src/lib/docs.js';
import { estimateWorkDays } from '../src/lib/schedule.js';

const errors = [];
const check = (cond, msg) => {
  if (!cond) errors.push(msg);
};

const text = '34평 아파트 장판만 제거, 화장실 2개 철거 및 안방과 거실 샷시 제거, 부엌 씽크대와 선반 철거';
const r = classifyRequest(text);
const c = composeCase({ trade: r.trade, patch: r.patch });
c.title = r.title;

const before = computeEstimate(c);
console.log('=== 답사 전 ===');
console.log('공종', before.trade, '| 규모', c.sizeValue + c.sizeUnit, '| 견적', Math.round(before.clientPrice), '| 원가', before.totalDirectCost, '| 보수적', before.costWithBuffer, '| 남는 돈', before.netProfitBuffered, '| 일수', before.workDays, '| 추천', JSON.stringify(before.crewPlan));
check(before.trade === 'demolition', `공종이 철거가 아님: ${before.trade}`);
check(before.clientPrice >= 90 && before.clientPrice <= 120, `견적이 90~120만 범위 밖: ${Math.round(before.clientPrice)}`);
check(before.workDays <= 1.5, `공사일수가 1.5일 초과: ${before.workDays}`);
check(!(before.items || []).some((i) => i.category === '자재' && i.amount > 0), '철거만인데 자재비가 붙음');

// 3단계 답사: 범위가 줄어 -40만, 일정은 그대로
const smaller = {
  ...c,
  changeLogs: [
    { id: 't1', item: '거실 샷시 철거 제외', reason: '샷시는 손님이 따로 함', amount: 40, type: 'decrease', days: 0, source: 'survey-auto', at: '2026-11-26' },
  ],
};
const after = computeEstimate(smaller);
console.log('\n=== 답사 -40만 반영 ===');
console.log('견적', Math.round(after.clientPrice), '| 앱 계산가', Math.round(after.appClientPrice), '| 원가', after.totalDirectCost, '| 보수적', after.costWithBuffer, '| 남는 돈', after.netProfitBuffered, '| 남는 비율', after.marginBuffered, '| 일수', after.workDays);
check(Math.round(after.clientPrice) === Math.round(before.clientPrice) - 40, `견적에 -40이 반영되지 않음: ${after.clientPrice} (전 ${before.clientPrice})`);
check(before.crewPlan && before.crewPlan.crew >= 2, `추천 인원이 1명으로 나옴: ${JSON.stringify(before.crewPlan)}`);
check(after.totalDirectCost === before.totalDirectCost - 40, `원가에 -40이 반영되지 않음: ${after.totalDirectCost} (전 ${before.totalDirectCost})`);
check(after.costWithBuffer < before.costWithBuffer, '보수적 원가가 그대로');
check(after.netProfitBuffered > 0, `남는 돈이 적자로 나옴: ${after.netProfitBuffered}`);

// 답사: 일정 +1일, 금액 +30만 (누수 보수)
const bigger = {
  ...c,
  changeLogs: [
    { id: 't2', item: '누수 보수 추가', reason: '욕실 배관 누수', amount: 30, type: 'increase', days: 1, source: 'survey-auto', at: '2026-11-26' },
  ],
};
const grown = computeEstimate(bigger);
console.log('\n=== 답사 +30만 · +1일 반영 ===');
console.log('견적', Math.round(grown.clientPrice), '| 원가', grown.totalDirectCost, '| 남는 돈', grown.netProfitBuffered, '| 일수', grown.workDays, '| 추천', JSON.stringify(grown.crewPlan));
check(Math.abs(Math.round(grown.clientPrice) - (Math.round(before.clientPrice) + 30)) <= 1, `견적에 +30이 반영되지 않음: ${grown.clientPrice}`);
check(grown.workDays === before.workDays + 1, `공사일수에 +1일이 반영되지 않음: ${grown.workDays}`);
check(grown.crewPlan?.days === grown.workDays, `추천 일수(${grown.crewPlan?.days})와 공사일수(${grown.workDays})가 다름`);

// 값만 깎는 협상(costFree)은 원가가 그대로여야 한다
const nego = {
  ...c,
  changeLogs: [{ id: 't3', item: '값 네고', reason: '손님이 깎아 달라고 함', amount: 15, type: 'decrease', costFree: true, days: 0, source: 'quick', at: '2026-11-26' }],
};
const cut = computeEstimate(nego);
check(cut.totalDirectCost === before.totalDirectCost, `값만 깎았는데 원가가 변함: ${cut.totalDirectCost} vs ${before.totalDirectCost}`);
check(Math.round(cut.clientPrice) === Math.round(before.clientPrice) - 15, '값 깎기가 견적에 반영 안 됨');

// 내가 부른 금액(합의가)은 남는 돈에 그대로
const called = computeEstimate({ ...c, calledPrice: 100 });
check(Math.round(called.clientPrice) === 100, '내가 부른 금액이 최종가로 안 됨');
check(called.netProfitBuffered === 100 - called.costWithBuffer, '남는 돈 계산 불일치');

// 5단계·6단계가 쓰는 값들
const quote = buildQuote(c, before);
const daysFromQuote = estimateWorkDays(c, before);
check(daysFromQuote === before.workDays, `문서 일수(${daysFromQuote})와 계산 일수(${before.workDays})가 다름`);
check(Number(quote?.totalAmount ?? quote?.total ?? 0) > 0, '견적서 총액이 비어 있음');

console.log('\n=== 결과 ===');
errors.forEach((e) => console.log('  ✗ ' + e));
console.log(errors.length ? `오류 ${errors.length}건` : '연동 검사 통과');
if (errors.length) process.exitCode = 1;
