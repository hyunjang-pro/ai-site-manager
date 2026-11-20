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

export function subsidyInfo(c) {
  const applicable = c?.trade === 'demolition';
  const value = parseFloat(c?.sizeValue);
  const unit = c?.sizeUnit;
  let pyung = null;
  if (Number.isFinite(value) && value > 0) {
    if (unit === '평') pyung = Math.ceil(value);
    else if (unit === '㎡') pyung = Math.ceil(value / 3.3);
  }
  const limit = pyung
    ? Math.min(SUBSIDY_RULES.cap, pyung * SUBSIDY_RULES.perPyung)
    : SUBSIDY_RULES.cap;
  return {
    applicable,
    pyung,
    limit,
    capped: !!pyung && pyung * SUBSIDY_RULES.perPyung > SUBSIDY_RULES.cap,
    ...SUBSIDY_RULES,
  };
}

export const SUBSIDY_CONDITIONS = [
  { id: 'days', label: '사업 60일 이상', hint: '개업일부터 60일이 지나야 합니다' },
  { id: 'rent', label: '유상 임차 상가', hint: '자가 건물·무상 임차는 안 됩니다' },
  { id: 'company', label: '사업자등록 업체에 맡긴 철거', hint: '자력 철거·현금 거래는 지원 불가' },
];

export const SUBSIDY_DOCS = [
  { id: 'sheet', label: '공사내역서', hint: '철거업체가 손님에게 발급' },
  { id: 'tax', label: '전자세금계산서 (또는 카드전표)', hint: '공급가액만 지원' },
  { id: 'bank', label: '계좌이체 확인증', hint: '현금 거래는 인정 안 됨' },
  { id: 'photo', label: '철거 전·후 같은 각도 사진', hint: '위치·각도를 맞춰 촬영' },
];
