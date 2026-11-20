import { hasScope } from './constants.js';

// 폐업 소상공인 점포철거비 지원금 (희망리턴패키지 원스톱폐업지원)
// 근거: 소상공인시장진흥공단 2026년 공고 — 전용면적 3.3㎡(1평)당 20만원, 최대 600만원(2025-07-11 이후 폐업), 부가세 제외.
// 이 금액은 손님이 공단에서 돌려받는 돈이며, 우리 견적에 더하는 돈이 아니다.
export const SUBSIDY_RULES = {
  perPyung: 20, // 만원 / 평
  cap: 600, // 만원
  minBusinessDays: 60,
  applyUrl: '소상공인24(sbiz24.kr)',
  phone: '1533-0100',
};

const STORE_TEXT = /상가|점포|매장|폐업|원상복구|임차|사무실/;

export function subsidyInfo(c) {
  const text = `${c?.title || ''} ${c?.notes || ''} ${c?.rawInput || ''} ${c?.location || ''}`;
  // 점포철거비는 '철거'가 들어간 상가 현장만 — 폐기물 수거·욕실·도배 현장에는 해당 없음
  const demoJob = c?.trade === 'demolition' || hasScope(c, 'demolition');
  const storeish = demoJob && (c?.trade === 'demolition' || c?.trade === 'combined' || STORE_TEXT.test(text));
  const value = parseFloat(c?.sizeValue);
  const unit = c?.sizeUnit;
  let pyung = null;
  if (Number.isFinite(value) && value > 0) {
    if (unit === '평') pyung = Math.ceil(value);
    else if (unit === '㎡') pyung = Math.ceil(value / 3.3);
  }
  const limit = pyung ? Math.min(SUBSIDY_RULES.cap, pyung * SUBSIDY_RULES.perPyung) : SUBSIDY_RULES.cap;
  return {
    applicable: storeish,
    storeish,
    pyung,
    limit,
    capped: !!pyung && pyung * SUBSIDY_RULES.perPyung > SUBSIDY_RULES.cap,
    ...SUBSIDY_RULES,
  };
}

// 대상 판별 체크리스트 — 하나라도 '아니오'면 지원이 막히거나 금액이 줄어든다.
export const SUBSIDY_CHECKS = [
  { id: 'days', label: '사업자등록 후 60일 이상 운영했나요?', hint: '개업일부터 60일이 지나야 신청됩니다' },
  { id: 'rent', label: '유상으로 빌린 상가인가요?', hint: '자가 건물·무상 임차는 지원 불가' },
  { id: 'usage', label: '건축물대장 용도가 상가·사무실인가요?', hint: '주거용(아파트·주택)은 대상 아님' },
  { id: 'company', label: '사업자등록 업체에 철거를 맡기나요?', hint: '자력 철거·현금 거래는 인정 안 됨' },
  { id: 'closed', label: '폐업(예정) 후 신청하나요?', hint: '2025-07-11 이후 폐업은 최대 600만원' },
  { id: 'once', label: '점포철거비를 받은 적이 없나요?', hint: '사업자당 1회만 가능' },
];

// 손님이 챙겨야 하는 서류 6종 — 우리가 발급·촬영해 줄 수 있는 것과 손님이 준비할 것을 구분한다.
export const SUBSIDY_DOCS = [
  { id: 'lease', label: '임대차계약서 사본', hint: '손님 준비 · 유상 임차 확인용', owner: '손님' },
  { id: 'closure', label: '사업자 폐업사실증명', hint: '손님 준비 · 홈택스 발급(무료)', owner: '손님' },
  { id: 'contract', label: '공사(철거) 계약서', hint: '우리가 발급 · 공사범위·금액 명시', owner: '우리' },
  { id: 'tax', label: '전자세금계산서', hint: '우리가 발급 · 공급가액만 지원', owner: '우리' },
  { id: 'bank', label: '계좌이체 확인증', hint: '손님 준비 · 현금 거래는 불인정', owner: '손님' },
  { id: 'photo', label: '철거 전·후 동일 각도 사진', hint: '우리가 촬영 · 같은 자리에서', owner: '우리' },
];

// 대행 수수료 — 업계 관행 안내(사실 기준). 우리 정책은 '공사 수주 시 무료'.
export const SUBSIDY_AGENCY = {
  freeNote: '공사를 저희가 수주하면 서류 준비·신청 대행은 무료로 해 드립니다.',
  paidNote: '서류 대행만 따로 맡기면 업계 관행은 10~20만원입니다.',
  caution: '대행비를 따로 받는 업체는 그 비용이 공사비에 이미 들어갔는지 먼저 확인하세요.',
  steps: [
    '현장 실측 → 철거 범위·금액 확정 (지원 한도 안에서 맞추는 게 좋습니다)',
    '계약서 작성 + 전자세금계산서 발급',
    '철거 전 사진 6곳 촬영 → 철거 → 후 사진',
    '손님이 소상공인24에서 신청 → 서류 보완 → 지급',
  ],
};

export function subsidyLimitText(info) {
  return info.pyung ? `전용면적 ${info.pyung}평 × 평당 20만원 = ${info.limit}만원 · 최대 600만원` : '전용면적 확인 후 계산 · 최대 600만원';
}
