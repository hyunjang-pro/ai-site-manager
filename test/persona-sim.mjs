// v3.13 가상 테스터 32명 시뮬레이션 — 실제 숫자·문구를 그대로 보고 크리틱한다.
// (실제 사람이 아니라, 직군별 기준을 코드에 넣어 돌린 '가상 테스터'다. 결과는 개선 후보를 찾는 용도.)
// 실행: node test/persona-sim.mjs   (결과: screenshots/persona-v313.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyRequest } from '../src/lib/classify.js';
import { composeCase } from '../src/lib/storage.js';
import { computeEstimate } from '../src/lib/pricing.js';
import { clientQuoteMessage } from '../src/lib/docs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'screenshots', 'persona-v313.json');

const CASES = [
  { id: 'field', text: '장판 제거 화장실 2개 베란다 샷시 및 부엌 선반과 씽크대 철거', range: [80, 120], kind: 'partial' },
  { id: 'bath1', text: '화장실 하나 철거', range: [60, 160], kind: 'bathDemo' },
  { id: 'bath2', text: '욕실 두칸 철거', range: [120, 300], kind: 'bathDemo' },
  { id: 'apt32', text: '32평 아파트 철거', range: [380, 640], kind: 'demolition' },
  { id: 'shop15', text: '상가 15평 원상복구', range: [220, 420], kind: 'demolition' },
  { id: 'bathRemodel', text: '안방 욕실 1칸 올수리', range: [380, 700], kind: 'bathRemodel' },
];

const built = CASES.map((cs) => {
  const r = classifyRequest(cs.text);
  const c = composeCase({ trade: r.trade, patch: r.patch });
  const calc = computeEstimate(c);
  const msg = clientQuoteMessage(c, calc);
  return { ...cs, trade: calc.trade, price: Math.round(calc.clientPrice), cost: calc.totalDirectCost, size: `${c.sizeValue || ''}${c.sizeUnit || ''}`, msg };
});

const AI_ISH = ['조치', '합의', '드립니다', '상기', '해당', '검토하', '진행하겠', '안내드', '요청사항', '별도 처리'];
const INTERNAL = ['원가', '순익', '마진', '알선료', '예비비', '남는', '일당'];
const msgIssues = (m, cs) => {
  const bad = [];
  if (m.length > 700) bad.push(`문자가 길다(${m.length}자)`);
  if (/^\s*·/m.test(m)) bad.push('목록 기호가 보고서 같다');
  if (!/만원/.test(m)) bad.push('금액이 없다');
  if (!/방문|실측|뵙/.test(m)) bad.push('현장 방문 안내가 없다');
  if (!/가견적|정도로 보고/.test(m)) bad.push('잠정 금액이라는 설명이 없다');
  if (/규모 미정/.test(m)) bad.push('고객 문자에 규모 미정이 그대로 나간다');
  AI_ISH.filter((w) => m.includes(w)).forEach((w) => bad.push(`AI 말투 ${w}`));
  INTERNAL.filter((w) => m.includes(w)).forEach((w) => bad.push(`내부 용어 ${w}`));
  // 철거만 하는 현장에 시공·방수 이야기가 나오면 손님이 오해한다
  if (cs.kind === 'bathDemo' && /방수|타일을 올|교체/.test(m)) bad.push('철거만인데 방수·타일 시공 이야기가 나온다');
  if (cs.kind === 'partial') {
    const named = ['장판', '욕실', '샷시', '선반', '싱크대'].filter((x) => m.includes(x));
    if (named.length < 4) bad.push(`부분 철거인데 품목 설명이 빠짐(${named.join(', ') || '없음'})`);
  }
  if (cs.kind === 'demolition' && /자재/.test(m) && !/자재비/.test(m)) bad.push('철거에 자재 이야기가 섞임');
  return bad;
};
const priceVerdict = (cs) => (cs.price >= cs.range[0] && cs.price <= cs.range[1] ? '적정' : cs.price < cs.range[0] ? '싸다' : '비싸다');

// 직군별 기준: 관심 케이스, 판정 가중치, 한마디
const PERSONAS = [
  { name: '철거 25년 사장', role: '현장 대표', cases: ['field', 'apt32', 'shop15'], strict: 1.15, note: '작업 범위와 차량 대수부터 본다' },
  { name: '인력사무소 운영자', role: '인력 배차', cases: ['field', 'bath2'], strict: 1.1, note: '품목마다 반나절씩 잡으면 인력이 남는다' },
  { name: '인테리어 소장', role: '시공 관리', cases: ['bathRemodel', 'bath2'], strict: 1.1, note: '자재·시공 범위가 겹치지 않는지 본다' },
  { name: '숨고 철거 고객(30대)', role: '아파트 철거 의뢰', cases: ['apt32', 'bath1'], strict: 1.0, note: '문자 답장할지부터 판단' },
  { name: '숨고 상가 폐업 사장', role: '상가 원상복구 의뢰', cases: ['shop15'], strict: 1.0, note: '지원금·폐기물 포함 여부 확인' },
  { name: '카페 창업자', role: '상가 철거 의뢰', cases: ['shop15'], strict: 1.0, note: '간판·집기 처리까지 되는지' },
  { name: '50대 주부', role: '욕실 철거 의뢰', cases: ['bath1'], strict: 1.0, note: '쉬운 말로 설명됐는지' },
  { name: '20대 원룸 세입자', role: '부분 철거 의뢰', cases: ['field'], strict: 1.0, note: '90만원대면 바로 진행' },
  { name: '기계치 어머니(60)', role: '앱 사용자', cases: ['bath1', 'field'], strict: 1.2, note: '화면 숫자가 이해되는지' },
  { name: '아버지(60, 대표)', role: '앱 사용자', cases: ['field', 'apt32'], strict: 1.1, note: '부르는 금액이 남는지' },
  { name: '형님(인테리어)', role: '앱 사용자', cases: ['bathRemodel'], strict: 1.1, note: '자재 등급·일정이 맞는지' },
  { name: '상가 임대인', role: '원상복구 요구', cases: ['shop15'], strict: 1.0, note: '범위가 문서로 남는지' },
  { name: '부동산 중개인', role: '현장 소개', cases: ['shop15', 'apt32'], strict: 1.1, note: '시세보다 튀면 소개 안 함' },
  { name: '건설 감리', role: '품질·안전', cases: ['apt32'], strict: 1.2, note: '석면·구조 검토가 빠졌는지' },
  { name: '폐기물 처리업자', role: '차량·처리', cases: ['field', 'apt32'], strict: 1.1, note: '차량 단가에 인건비 포함 여부' },
  { name: '타일공', role: '욕실 시공', cases: ['bathRemodel'], strict: 1.1, note: '타일공 일수가 맞는지' },
  { name: '도배공', role: '도배 시공', cases: ['bathRemodel'], strict: 1.2, note: '도배가 끼어들면 안 됨' },
  { name: '목수', role: '문·몰딩', cases: ['field'], strict: 1.2, note: '선반 철거가 목공 시공으로 잡히면 안 됨' },
  { name: '전기기사', role: '전기 공사', cases: ['field'], strict: 1.2, note: '전기 항목이 없는데 전기비가 붙는지' },
  { name: '설비기사', role: '설비 공사', cases: ['bath1'], strict: 1.2, note: '철거에 설비 교체가 붙는지' },
  { name: '청소업체 사장', role: '준공 청소', cases: ['bath1'], strict: 1.2, note: '철거만인데 청소비가 붙는지' },
  { name: '건물 관리소장', role: '공용부 관리', cases: ['apt32'], strict: 1.1, note: '보양·신고가 들어갔는지' },
  { name: '세무사', role: '지원금·세금계산서', cases: ['shop15'], strict: 1.2, note: '지원금 서류 안내가 맞는지' },
  { name: '소상공인 상담원', role: '지원금 상담', cases: ['shop15'], strict: 1.2, note: '지원 조건이 정확한지' },
  { name: '30대 맞벌이 부부', role: '아파트 철거 의뢰', cases: ['apt32'], strict: 1.0, note: '주말 작업 가능한지' },
  { name: '40대 자영업자', role: '매장 정리', cases: ['shop15'], strict: 1.0, note: '영업 중 공사 가능한지' },
  { name: '60대 구옥 소유자', role: '구옥 철거 의뢰', cases: ['apt32'], strict: 1.1, note: '오래된 집 폐기물 처리가 되는지' },
  { name: '30대 인테리어 관심 고객', role: '욕실 리모델링', cases: ['bathRemodel'], strict: 1.0, note: '자재 등급 설명이 되는지' },
  { name: '철거 보조 알바', role: '현장 인력', cases: ['field'], strict: 1.3, note: '하루에 끝나는 양인지' },
  { name: '철거 3년차 청년 사업자', role: '경쟁 업체', cases: ['field', 'bath1'], strict: 1.0, note: '이 가격이면 나도 한다' },
  { name: '숨고 경쟁 고수', role: '경쟁 견적', cases: ['apt32'], strict: 1.0, note: '문자 품질로 비교' },
  { name: '공인중개사 직원', role: '현장 안내', cases: ['shop15'], strict: 1.1, note: '일정이 현실적인지' },
];

const rows = [];
for (const p of PERSONAS) {
  const seen = p.cases.map((id) => built.find((b) => b.id === id)).filter(Boolean);
  const issues = [];
  seen.forEach((cs) => {
    const v = priceVerdict(cs);
    const high = cs.price > cs.range[1] * p.strict;
    if (v === '비싸다' || high) issues.push(`${cs.text} ${cs.price}만 — ${v}`);
    if (v === '싸다') issues.push(`${cs.text} ${cs.price}만 — 너무 싸서 손해 위험`);
    msgIssues(cs.msg, cs).forEach((x) => issues.push(`${cs.text}: ${x}`));
  });
  const verdict = issues.length === 0 ? '통과' : issues.length <= 2 ? '보완' : '반대';
  rows.push({
    persona: `${p.name} (${p.role})`,
    focus: p.note,
    verdict,
    issues: Array.from(new Set(issues)).slice(0, 5),
    prices: seen.map((c) => `${c.text}: ${c.price}만`),
  });
}

const pass = rows.filter((r) => r.verdict === '통과').length;
const fix = rows.filter((r) => r.verdict === '보완').length;
const fail = rows.filter((r) => r.verdict === '반대').length;

fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), cases: built.map(({ msg, ...b }) => b), personas: rows, summary: { pass, fix, fail } }, null, 2));

console.log('가상 테스터'.padEnd(28), '판정', '  걸린 것');
console.log('-'.repeat(96));
for (const r of rows) console.log(r.persona.padEnd(28), r.verdict, ' ', r.issues[0] || '-');
console.log('');
console.log(`통과 ${pass} · 보완 ${fix} · 반대 ${fail} (총 ${rows.length}명, 6개 케이스)`);
for (const b of built) console.log(`  ${b.text} → ${b.price}만 (기준 ${b.range[0]}~${b.range[1]})`);
console.log(`저장: ${path.relative(path.resolve(__dirname, '..'), OUT)}`);
if (fail) process.exitCode = 1;
