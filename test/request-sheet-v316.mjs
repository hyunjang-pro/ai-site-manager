// 요청서(숨고·카톡) → 정리본 → 공종 → 견적 → 고객 멘트 전 구간 검사.
// 2026-11-27 제보(상업공간 인테리어 / 8m 가벽 룸3개 만들기 → '상가·주택 철거 6평') 재발 방지.
//
// 검사 항목
//  ① 공종이 뒤바뀌지 않았는가 (특히 '인테리어' 요청이 철거로 가는지)
//  ② 원문에 있던 핵심 라벨·줄이 정리본에서 사라지지 않았는가 (보존 게이트)
//  ③ 철거가 아닌 현장에 철거·폐기물 멘트가 나가지 않는가
//  ④ 가견적이 현실 범위인가 (터무니없는 6평 철거·1,000만 과대 방지)
// 실행: node test/request-sheet-v316.mjs
import { classifyRequest, summarizeRequest } from '../src/lib/classify.js';
import { parseRequestSheet, preservationGate, sheetToText } from '../src/lib/request.js';
import { composeCase } from '../src/lib/storage.js';
import { computeEstimate } from '../src/lib/pricing.js';
import { clientQuoteMessage, clientScopeText } from '../src/lib/docs.js';

// 실제 tesseract(ko+eng)로 IMG_1625를 읽은 글자 그대로
export const OCR_IMG1625 = `<                                                       삭제하기
요청상세 _고객정보 AX 작4
견적 보낸 고수 0명                                            1분 전
상업공간 인테리어
협의 가능해요
? 경북 안동시
공간 유형       외식
서비스분야 、 부분 인테리어
공실상태 Hg
공급면적        800가벽 룸3개 만들기
계약 상태       현재 입주 중
예산            1000만 원 이하
문의/희망사항 고수와 상담 시 논의할게요
고객 정보                                               신고하기
…        조대현
2020년 10월 22일 가입ㆍ숨고 17회 이용
견적을 작성해 주세요`;

const sheet = (lines) => lines.join('\n');

const CASES = [
  // ── 제보 원본 ──
  {
    name: '숨고 상업공간 부분 인테리어 · 8m 가벽 룸3 (제보 원본 OCR)',
    text: OCR_IMG1625,
    trade: ['carpentry'],
    must: ['상업공간 인테리어', '외식', '부분 인테리어', '8m 가벽', '룸3', '현재 입주 중', '1000만 원 이하', '고수와 상담'],
    price: [180, 480],
    noDemoTalk: true,
  },
  {
    name: '숨고 상업공간 부분 인테리어 · 라벨/값 분리 OCR',
    text: sheet(['요청 상세', '상업공간 인테리어', '경북 안동시', '공간 유형', '외식', '서비스 분야', '부분 인테리어', '공실 상태', '짐 있음', '공급면적', '8m가벽 룸3개 만들기', '계약 상태', '현재 입주 중', '예산', '1,000만 원 이하', '문의/희망사항', '고수와 상담 시 논의할게요', '견적을 작성해 주세요']),
    trade: ['carpentry'],
    must: ['외식', '부분 인테리어', '8m 가벽', '룸3', '짐 있음'],
    price: [180, 480],
    noDemoTalk: true,
  },
  // ── 인테리어(시공) ──
  {
    name: '숨고 주거 부분 인테리어 · 24평 도배·장판',
    text: sheet(['주거 인테리어', '경북 안동시 풍산읍', '공간 유형', '아파트', '서비스 분야', '부분 인테리어', '공급면적', '24평 도배·장판', '계약 상태', '현재 입주 중', '예산', '300만 원 이하']),
    trade: ['wallpaper'],
    must: ['아파트', '부분 인테리어', '24평 도배·장판', '300만 원 이하'],
    price: [200, 500],
    noDemoTalk: true,
  },
  {
    name: '숨고 주거 인테리어 · 욕실 1칸 올수리',
    text: sheet(['주거 인테리어', '공간 유형', '아파트', '서비스 분야', '부분 인테리어', '공급면적', '욕실 1칸 올수리', '예산', '600만 원 이하']),
    trade: ['bathroom'],
    must: ['욕실 1칸 올수리', '아파트'],
    price: [350, 800],
    noDemoTalk: true,
  },
  {
    name: '숨고 상업공간 인테리어 · 카페 20평 전체',
    text: sheet(['상업공간 인테리어', '공간 유형', '카페', '서비스 분야', '전체 인테리어', '공급면적', '20평', '예산', '3,000만 원']),
    trade: ['combined'],
    must: ['카페', '전체 인테리어', '20평'],
    price: [2000, 4500],
    noDemoTalk: true,
  },
  {
    name: '숨고 인테리어 · 샷시 4짝 교체',
    text: sheet(['주거 인테리어', '서비스 분야', '부분 인테리어', '공급면적', '샷시 4짝 교체', '공간 유형', '아파트']),
    trade: ['window', 'repair', 'carpentry'],
    must: ['샷시 4짝 교체'],
    price: [80, 600],
    noDemoTalk: true,
  },
  {
    name: '숨고 인테리어 · 주방 싱크대 3m 교체',
    text: sheet(['주거 인테리어', '서비스 분야', '부분 인테리어', '공급면적', '싱크대 3m 교체']),
    trade: ['kitchen'],
    must: ['싱크대 3m 교체'],
    price: [250, 700],
    noDemoTalk: true,
  },
  {
    name: '숨고 인테리어 · 데코타일 15평 시공',
    text: sheet(['상업공간 인테리어', '서비스 분야', '부분 인테리어', '공간 유형', '사무실', '공급면적', '데코타일 15평 시공']),
    trade: ['wallpaper', 'combined'],
    must: ['데코타일 15평 시공'],
    price: [150, 700],
    noDemoTalk: true,
  },
  {
    name: '숨고 인테리어 · 마루 20평 시공',
    text: sheet(['주거 인테리어', '서비스 분야', '부분 인테리어', '공급면적', '마루 20평 시공']),
    trade: ['wallpaper'],
    must: ['마루 20평 시공'],
    price: [200, 700],
    noDemoTalk: true,
  },
  {
    name: '숨고 인테리어 · 타일 20㎡',
    text: sheet(['주거 인테리어', '서비스 분야', '부분 인테리어', '공급면적', '타일 20㎡ 시공']),
    trade: ['tilewaterproof', 'bathroom'],
    must: ['타일 20㎡ 시공'],
    price: [80, 500],
    noDemoTalk: true,
  },
  {
    name: '숨고 인테리어 · 전기 콘센트 10개 증설',
    text: sheet(['상업공간 인테리어', '서비스 분야', '부분 인테리어', '공급면적', '콘센트 10개 증설']),
    trade: ['electric'],
    must: ['콘센트 10개 증설'],
    price: [80, 250],
    noDemoTalk: true,
  },
  {
    name: '숨고 인테리어 · 문 3개 교체(목공)',
    text: sheet(['주거 인테리어', '서비스 분야', '부분 인테리어', '공급면적', '문 3개 교체']),
    trade: ['carpentry', 'repair'],
    must: ['문 3개 교체'],
    price: [50, 350],
    noDemoTalk: true,
  },
  {
    name: '숨고 인테리어 · 현관 중문+신발장',
    text: sheet(['주거 인테리어', '서비스 분야', '부분 인테리어', '공급면적', '현관 중문 교체, 신발장 제작']),
    trade: ['repair', 'carpentry', 'window'],
    must: ['현관 중문 교체', '신발장 제작'],
    price: [60, 400],
    noDemoTalk: true,
  },
  {
    name: '숨고 상업공간 · 가벽만 만들기(면적 없음)',
    text: sheet(['상업공간 인테리어', '서비스 분야', '부분 인테리어', '공간 유형', '사무실', '공급면적', '가벽으로 룸 3개 만들기']),
    trade: ['carpentry'],
    must: ['가벽으로 룸 3개 만들기'],
    price: [120, 500],
    noDemoTalk: true,
  },
  {
    name: '숨고 상업공간 · 칸막이 6m 만들기',
    text: sheet(['상업공간 인테리어', '서비스 분야', '부분 인테리어', '공급면적', '칸막이 6m 설치']),
    trade: ['carpentry'],
    must: ['칸막이 6m 설치'],
    price: [100, 400],
    noDemoTalk: true,
  },
  // ── 철거(진짜 뜯는 현장) ──
  {
    name: '숨고 철거 · 상가 15평 원상복구',
    text: sheet(['상업공간 철거', '공간 유형', '음식점', '서비스 분야', '철거', '공급면적', '15평', '예산', '400만 원 이하']),
    trade: ['demolition'],
    must: ['음식점', '철거', '15평'],
    price: [250, 600],
    noDemoTalk: false,
  },
  {
    name: '숨고 철거 · 아파트 24평 전체 철거',
    text: sheet(['주거 철거', '공간 유형', '아파트', '서비스 분야', '철거', '공급면적', '24평', '문의/희망사항', '원상복구까지 부탁드려요']),
    trade: ['demolition'],
    must: ['아파트', '24평', '원상복구까지'],
    price: [300, 700],
    noDemoTalk: false,
  },
  {
    name: '숨고 철거 · 간판 2개 철거',
    text: sheet(['상업공간 철거', '서비스 분야', '철거', '공급면적', '간판 2개 철거', '문의/희망사항', '스카이차 필요합니다']),
    trade: ['demolition'],
    must: ['간판 2개 철거', '스카이차'],
    price: [40, 200],
    noDemoTalk: false,
  },
  {
    name: '숨고 철거 · 가벽 3m 철거(뜯는 현장)',
    text: sheet(['상업공간 철거', '서비스 분야', '철거', '공급면적', '가벽 3m 철거']),
    trade: ['demolition'],
    must: ['가벽 3m 철거'],
    price: [20, 120],
    noDemoTalk: false,
  },
  {
    name: '숨고 철거 · 사무실 20평 칸막이 철거',
    text: sheet(['상업공간 철거', '공간 유형', '사무실', '서비스 분야', '철거', '공급면적', '20평 칸막이 철거']),
    trade: ['demolition'],
    must: ['20평 칸막이 철거'],
    price: [150, 600],
    noDemoTalk: false,
  },
  {
    name: '숨고 철거 · 화장실 2칸 철거',
    text: sheet(['상업공간 철거', '공간 유형', '식당', '서비스 분야', '철거', '공급면적', '화장실 2칸 철거']),
    trade: ['bathroom', 'demolition'],
    must: ['화장실 2칸 철거'],
    price: [80, 400],
    noDemoTalk: false,
  },
  {
    name: '숨고 철거 · 학원 25평 철거',
    text: sheet(['상업공간 철거', '공간 유형', '학원', '서비스 분야', '철거', '공급면적', '25평']),
    trade: ['demolition'],
    must: ['학원', '25평'],
    price: [250, 700],
    noDemoTalk: false,
  },
  // ── 폐기물·인력 ──
  {
    name: '숨고 폐기물 · 상가 폐업 집기 정리',
    text: sheet(['폐기물 처리', '서비스 분야', '폐기물 수거', '공간 유형', '상가', '공급면적', '2톤']),
    trade: ['waste'],
    must: ['상가', '2톤'],
    price: [40, 250],
  },
  {
    name: '숨고 폐기물 · 이사 후 가구 수거 한차',
    text: sheet(['폐기물 처리', '서비스 분야', '폐기물 수거', '문의/희망사항', '이사 후 남은 가구(침대·소파·장롱) 한차 수거']),
    trade: ['waste'],
    must: ['가구(침대·소파·장롱)'],
    price: [25, 90],
  },
  {
    name: '숨고 인력 · 인부 2명 1일',
    text: sheet(['인력 지원', '서비스 분야', '인력', '공급면적', '인부 2명 1일']),
    trade: ['labor'],
    must: ['인부 2명 1일'],
    price: [50, 250],
  },
  // ── 애매한 요청 ──
  {
    name: '숨고 부분 인테리어 · 내용 없음 (확인 필요)',
    text: sheet(['상업공간 인테리어', '서비스 분야', '부분 인테리어', '공간 유형', '사무실', '예산', '500만 원 이하']),
    trade: ['custom', 'carpentry', 'wallpaper', 'combined'],
    must: ['사무실', '부분 인테리어', '500만 원 이하'],
    price: [120, 500],
    needsCheck: true,
  },
  {
    name: '숨고 인테리어 · 철거는 하지 말라고 함',
    text: sheet(['주거 인테리어', '서비스 분야', '부분 인테리어', '공급면적', '24평 도배·장판', '문의/희망사항', '기존 철거는 하지 마세요']),
    trade: ['wallpaper'],
    must: ['철거는 하지 마세요', '24평 도배·장판'],
    price: [200, 600],
    noDemoTalk: true,
  },
  {
    name: '숨고 · 공실 상태와 계약 상태가 함께 적힌 요청',
    text: sheet(['상업공간 인테리어', '서비스 분야', '부분 인테리어', '공간 유형', '카페', '공실 상태', '짐 있음', '계약 상태', '현재 입주 중', '공급면적', '8m 가벽 룸3개 만들기']),
    trade: ['carpentry'],
    must: ['짐 있음', '현재 입주 중', '8m 가벽'],
    price: [180, 500],
    noDemoTalk: true,
  },
  {
    name: '자유 문장 · 24평 아파트 도배 장판',
    text: '24평 아파트 도배 장판, 엘리베이터 없는 3층, 다음 주 착공 희망',
    trade: ['wallpaper'],
    must: ['24평 아파트 도배 장판'],
    price: [180, 500],
    noDemoTalk: true,
  },
  {
    name: '자유 문장 · 15평 상가 철거',
    text: '15평 상가 철거 원상복구, 폐기물 포함',
    trade: ['demolition'],
    must: ['15평 상가 철거'],
    price: [250, 700],
    noDemoTalk: false,
  },
];

const rows = [];
const problems = [];
for (const tc of CASES) {
  const res = classifyRequest(tc.text);
  const summary = summarizeRequest(tc.text, res);
  const c = composeCase({ trade: res.trade, patch: { ...res.patch, rawInput: summary } });
  const calc = computeEstimate(c);
  const msg = clientQuoteMessage(c, calc);
  const scope = clientScopeText(c, calc);
  const price = Math.round(Number(calc.finalPrice) || 0);
  const issues = [];

  // ① 공종
  if (!tc.trade.includes(res.trade)) issues.push(`공종 ${res.trade} (기대 ${tc.trade.join('/')})`);
  // ② 보존 게이트
  const sheetObj = parseRequestSheet(tc.text);
  const gate = preservationGate({ sheet: sheetObj, summary, trade: res.trade, tradeName: res.trade === 'custom' ? res.patch.tradeName : '' });
  gate.filter((g) => g.type === 'dropped_field' || g.type === 'dropped_line').forEach((g) => issues.push(`누락 ${g.label || ''} ${g.value}`));
  const flat = summary.replace(/\s+/g, '');
  tc.must.forEach((m) => {
    if (!flat.includes(m.replace(/\s+/g, ''))) issues.push(`정리본에 '${m}' 없음`);
  });
  // ③ 철거 멘트
  if (tc.noDemoTalk) {
    if (/철거·원상복구|뜯어내는/.test(msg) || /뜯어내는|철거·원상복구/.test(scope)) {
      issues.push(`철거 멘트: ${scope}`);
    }
    if (/공종: 상가·주택 철거/.test(summary)) issues.push('정리본 공종이 철거');
  }
  // ④ 금액
  if (tc.price) {
    if (!(price >= tc.price[0] && price <= tc.price[1])) issues.push(`가견적 ${price}만 (기대 ${tc.price[0]}~${tc.price[1]})`);
  }
  if (tc.needsCheck && !/범위|확인/.test(msg)) issues.push('확인 필요 안내가 멘트에 없음');
  if (res.guard?.length) issues.push(`guard: ${res.guard.map((g) => g.type).join(',')}`);

  // ⑤ 저장된 정리본을 다시 분류해도 같은 공종이어야 한다 (notes/rawInput로 재계산되는 경로)
  const again = classifyRequest(summary);
  if (again.trade !== res.trade && res.trade !== 'custom') issues.push(`재분류 ${again.trade} ≠ ${res.trade}`);

  rows.push({ name: tc.name, trade: res.trade, price, scope, summary });
  if (issues.length) problems.push({ name: tc.name, issues, summary, msg });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('요청', 46), pad('공종', 14), pad('가견적', 8), '현장 설명');
rows.forEach((r) => console.log(pad(r.name, 46), pad(r.trade, 14), pad(`${r.price}만`, 8), r.scope));
console.log(`\n검사 ${CASES.length}건 · 문제 ${problems.length}건`);
problems.forEach((p) => {
  console.log(`\n✗ ${p.name}`);
  p.issues.forEach((i) => console.log(`   - ${i}`));
  console.log(`   정리본: ${p.summary.split('\n').join(' | ')}`);
  console.log(`   멘트: ${p.msg.split('\n').filter((l) => l.trim())[1] || ''}`);
});
process.exit(problems.length ? 1 : 0);
