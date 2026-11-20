// 공종별 추천 자재 세트 — 실속/표준/고급 3단계.
// 탭 한 번으로 바꾸면 (1) 견적 금액 (2) 손님 견적서 사양 (3) 업체별 발주 리스트가 함께 바뀐다.
// mul: 이 세트를 골랐을 때 자재 계열 원가에 곱하는 배율(표준 = 1).
import { TRADES } from './constants.js';

const SET = (id, tier, label, brand, mul, spec, tip, pick, order = {}) => ({
  id,
  tier,
  label,
  brand,
  mul,
  spec,
  tip,
  pick,
  order,
});

export const MATERIAL_SETS = {
  bathroom: [
    SET(
      'bath-budget',
      '실속',
      '국산 실속',
      '국산 중소 브랜드 · 건재상 재고',
      0.94,
      ['300×600 무광 국산 타일(벽·바닥)', '국산 도기·수전 세트', '3000K 방습등'],
      '지역 건재상 재고 300×600을 박스(10장) 단위로 사면 대리점보다 10~15% 쌉니다.',
      '임대·원복, 예산 우선',
      { tile: '300×600 무광 국산타일', tileBox: 1.8, fixture: '국산 도기·수전 세트', waterproof: '2액형 우레탄 방수 20kg' }
    ),
    SET(
      'bath-standard',
      '표준',
      '브랜드 표준',
      '대림바스 · 이누스 · LG하우시스',
      1,
      ['600×600 포세린 무광(벽) + 300×300 논슬립(바닥)', '대림바스·이누스 도기·수전', '4000K 방습등 + 환풍기'],
      '도기·수전은 브랜드 대리점 정품이 A/S됩니다. 온라인 최저가와 대리점가를 한 번 비교하세요.',
      '거주용 표준, A/S 중요',
      { tile: '600×600 포세린 무광 + 300×300 논슬립', tileBox: 3.6, fixture: '대림바스·이누스 도기·수전', waterproof: '2액형 우레탄 방수 20kg + 프라이머' }
    ),
    SET(
      'bath-premium',
      '고급',
      '포세린 고급',
      '아메리칸스탠다드 · 수입 포세린',
      1.16,
      ['600×1200 대형 포세린(벽) + 600각 헤링본(바닥)', '아메리칸스탠다드 도기·무광 니켈 수전', '3000K 간접등 + 거울등'],
      '600×1200은 재단 로스가 커서 15% 여유분이 필요합니다. 수입 타일은 납기 2~3주를 잡으세요.',
      '호텔식, 사진 많이 찍는 매장',
      { tile: '600×1200 대형 포세린 + 600각 헤링본', tileBox: 2.88, fixture: '아메리칸스탠다드 도기·무광 니켈 수전', waterproof: '2액형 우레탄 방수 2회 + 보강테이프' }
    ),
  ],
  wallpaper: [
    SET(
      'wall-budget',
      '실속',
      '합지 실속',
      '국산 합지 · 1.8T 장판',
      0.94,
      ['소폭 합지 화이트(무지)', '1.8T 모노륨 장판 아이보리', '기존 몰딩·조명 재사용'],
      '합지는 5평/롤 기준으로 계산합니다. 롤 단가가 싼 도매상은 30롤 이상일 때 유리합니다.',
      '임대·원복',
      { wallpaper: '소폭 합지 화이트', rollPerPyung: 5, floor: '1.8T 모노륨 장판' }
    ),
    SET(
      'wall-standard',
      '표준',
      '광폭 표준',
      '광폭 합지 · 2.0T 장판',
      1,
      ['광폭 합지 화이트/아이보리', '2.0T 모노륨 장판 라이트오크', '기본 몰딩 + 3색 LED'],
      '광폭(1.06m)은 이음새가 적어 24평 이상에서 작업비가 오히려 쌉니다.',
      '일반 거주 표준',
      { wallpaper: '광폭 합지 화이트/아이보리', rollPerPyung: 5, floor: '2.0T 모노륨 장판 라이트오크' }
    ),
    SET(
      'wall-premium',
      '고급',
      '실크 고급',
      '실크 벽지 · 2.2T 장판',
      1.14,
      ['실크 벽지(무지 화이트/샴페인)', '2.2T 모노륨 장판 오크', '무몰딩 마감 + 3000K 다운라이트'],
      '실크는 롤 단가가 합지의 2배입니다. 벽 면적을 정확히 재서 롤 수를 줄이는 게 핵심입니다.',
      '실거주·호텔 분위기',
      { wallpaper: '실크 벽지(무지/샴페인)', rollPerPyung: 5, floor: '2.2T 모노륨 장판 오크' }
    ),
  ],
  kitchen: [
    SET(
      'kit-budget',
      '실속',
      'LPM 실속',
      '국산 LPM · 인조대리석',
      0.93,
      ['LPM 아이보리 상·하부장', '인조대리석 아이보리 상판', '기존 후드·가스레인지 재사용'],
      'LPM은 습기에 약합니다. 싱크볼 주변은 ABS 엣지 처리 여부를 꼭 확인하세요.',
      '원룸·임대',
      { cabinet: 'LPM 아이보리 상·하부장', top: '인조대리석 아이보리', hood: '기존 후드 재사용' }
    ),
    SET(
      'kit-standard',
      '표준',
      '표준 브랜드',
      '한샘·LX하우시스급 · 인조대리석',
      1,
      ['LX하우시스·한샘급 LPM 화이트 상·하부장', '인조대리석 화이트 상판', '언더캐비닛등 + 기본 손잡이'],
      '상판은 수전 홀·싱크볼 가공 전 실측이 필수입니다. 가공 후 변경은 새 상판 값입니다.',
      '거주용 표준',
      { cabinet: 'LX하우시스급 LPM 화이트 상·하부장', top: '인조대리석 화이트', hood: '기존 후드 재사용' }
    ),
    SET(
      'kit-premium',
      '고급',
      '무광 고급',
      '무광 도어 · 엔지니어드 스톤',
      1.18,
      ['무광 그레이/샴페인 도어 상·하부장', '엔지니어드 스톤 상판(무광)', '매립 손잡이 + 3000K 펜던트'],
      '스톤 상판은 절단·가공 업체를 따로 잡아야 합니다. 가공비 포함 견적인지 확인하세요.',
      '신축·매장',
      { cabinet: '무광 그레이/샴페인 도어 상·하부장', top: '엔지니어드 스톤 상판', hood: '후드 교체 포함' }
    ),
  ],
  tilewaterproof: [
    SET(
      'tile-budget',
      '실속',
      '국산 실속',
      '국산 300×300 · 시멘트계 방수',
      0.93,
      ['300×300 국산 무광 타일', '시멘트계 방수 2회 + 담수시험 48시간'],
      '시멘트계 방수는 건조 시간이 길어 일정이 늘어납니다. 2회 도포 간격을 지키세요.',
      '베란다·다용도실',
      { tile: '300×300 국산 무광타일', tileBox: 1.62, waterproof: '시멘트계 방수 20kg' }
    ),
    SET(
      'tile-standard',
      '표준',
      '표준 포세린',
      '국산 포세린 · 2액형 우레탄',
      1,
      ['600×600 포세린 무광', '2액형 우레탄 방수 2회 + 담수시험 48시간'],
      '2액형 우레탄은 프라이머를 먼저 발라야 들뜸이 없습니다. 세트로 구매하세요.',
      '욕실·주방 벽',
      { tile: '600×600 포세린 무광', tileBox: 3.6, waterproof: '2액형 우레탄 방수 20kg + 프라이머' }
    ),
    SET(
      'tile-premium',
      '고급',
      '대형 고급',
      '600×1200 포세린 · 우레탄 3회',
      1.15,
      ['600×1200 대형 포세린', '2액형 우레탄 방수 3회 + 보강테이프 + 담수시험 48시간'],
      '대형 타일은 15% 여유분과 전용 접착제(대형타일용)가 필요합니다.',
      '거실·상가 전면',
      { tile: '600×1200 대형 포세린', tileBox: 2.88, waterproof: '2액형 우레탄 방수 3회 + 보강테이프' }
    ),
  ],
  plaster: [
    SET(
      'plaster-budget',
      '실속',
      '몰탈 실속',
      '일반 몰탈 · 메쉬',
      0.94,
      ['일반 시멘트 몰탈 미장', '메쉬 보강(바닥 균열 부위)', '양생 3일'],
      '몰탈은 25kg 포대 기준으로 계산합니다. ㎡당 2포대면 30mm 두께입니다.',
      '창고·임대',
      { mortar: '일반 시멘트 몰탈(25kg)', mesh: '유리섬유 메쉬' }
    ),
    SET(
      'plaster-standard',
      '표준',
      '표준 고강도',
      '고강도 몰탈 · 전면 메쉬',
      1,
      ['고강도 몰탈 미장', '전면 메쉬 보강', '양생 3일 + 레벨 확인'],
      '고강도 몰탈은 물 배합비를 지켜야 갈라지지 않습니다. 현장 배합보다 제품 사용을 권합니다.',
      '거주용 바닥',
      { mortar: '고강도 몰탈(25kg)', mesh: '전면 메쉬' }
    ),
    SET(
      'plaster-premium',
      '고급',
      '자동수평 고급',
      '자동수평 몰탈 · 난방 보강',
      1.12,
      ['자동수평 몰탈(셀프레벨링)', '난방배관 보강 + 단열재', '양생 5일'],
      '자동수평은 두께 5mm 이상이어야 합니다. 난방배관 위에는 반드시 단열재를 먼저 깝니다.',
      '아파트 거실, 난방 보강',
      { mortar: '자동수평 몰탈(셀프레벨링)', mesh: '난방배관 보강 + 단열재' }
    ),
  ],
  window: [
    SET(
      'win-budget',
      '실속',
      'PVC 실속',
      '국산 PVC 이중창',
      0.94,
      ['국산 PVC 이중창(로이유리)', '기본 방충망', '기존 창틀 철거·실리콘 마감'],
      'PVC는 프레임 두께가 두꺼워 기존 창틀 폭을 먼저 재야 합니다.',
      '임대·원복',
      { frame: '국산 PVC 이중창(로이유리)', glass: '복층 로이유리 16mm', screen: '기본 방충망' }
    ),
    SET(
      'win-standard',
      '표준',
      '표준 시스템창',
      'LX하우시스 · KCC 시스템창',
      1,
      ['LX하우시스·KCC 시스템창(3중 유리)', '미세방충망', '단열 마감재 + 실리콘'],
      '시스템창은 시공 후 조정(힌지·잠금)이 필요합니다. A/S 조건을 확인하세요.',
      '거주용 표준',
      { frame: 'LX하우시스·KCC 시스템창', glass: '3중 로이유리', screen: '미세방충망' }
    ),
    SET(
      'win-premium',
      '고급',
      '알루미늄 고급',
      '독일식 알루미늄 시스템창',
      1.2,
      ['독일식 알루미늄 시스템창', '3중 로이유리 + 아르곤', '방음·단열 패킹'],
      '알루미늄은 열교 차단재가 들어간 제품인지 확인하세요. 납기 3~4주 걸립니다.',
      '대로변·방음 필요',
      { frame: '독일식 알루미늄 시스템창', glass: '3중 로이유리 + 아르곤', screen: '미세방충망' }
    ),
  ],
  demolition: [
    SET(
      'demo-budget',
      '실속',
      '혼합 실속',
      '혼합 반출 · 기본 마감',
      0.96,
      ['마감재 철거 + 혼합 폐기물 반출', '바닥 먼지 제거', '기본 보양'],
      '혼합 반출은 처리비가 2~3배입니다. 시간이 있어도 성상 분리가 남는 장사입니다.',
      '예산 우선',
      { bag: '마대(혼합)', protect: '비닐 보양' }
    ),
    SET(
      'demo-standard',
      '표준',
      '표준 원상복구',
      '성상 분리 · 원상복구 마감',
      1,
      ['철거 + 원상복구(천장·벽체·바닥 정리)', '성상 분리 반출(5종)', '엘베·복도 보양'],
      '마대를 5종(콘크리트·목재·석고·금속·비닐)으로 나누면 처리비가 최대 6배 차이 납니다.',
      '일반 상가·주택',
      { bag: '마대 5종 분리', protect: '부직포 + 비닐 보양' }
    ),
    SET(
      'demo-premium',
      '고급',
      '정밀 고급',
      '분리 반출 + 샌딩 + 확인서',
      1.1,
      ['정밀 철거(구조 손상 최소)', '성상 분리 + 처리확인서', '바닥 샌딩·먼지 제거'],
      '처리확인서(올바로)를 받아두면 나중에 폐기물 분쟁에서 이깁니다.',
      '관공서·재계약 상가',
      { bag: '마대 5종 분리 + 처리확인서', protect: '부직포 + 비닐 + 출입구 보양' }
    ),
  ],
  repair: [
    SET(
      'repair-budget',
      '실속',
      '대체 실속',
      '동일 규격 대체 자재',
      0.94,
      ['기존 규격과 같은 국산 자재', '부분 보수·실리콘 마감'],
      '단종된 자재는 같은 규격으로 대체될 수 있습니다. 손님 승인을 먼저 받으세요.',
      '부분 보수',
      { material: '동일 규격 국산 자재', silicone: '수중 실리콘' }
    ),
    SET(
      'repair-standard',
      '표준',
      '정품 표준',
      '제조사 정품 부품',
      1,
      ['제조사 정품 부품·마감재', '부분 교체 후 색 맞춤'],
      '정품 부품은 모델명을 사진으로 남겨두면 재주문이 쉽습니다.',
      '거주용 표준',
      { material: '제조사 정품 부품', silicone: '수중 실리콘' }
    ),
  ],
  combined: [
    SET(
      'comb-budget',
      '실속',
      '기본 실속',
      '국산 기본 자재 일괄',
      0.94,
      ['소폭 합지 + 1.8T 장판', '300×600 국산 타일', '기본 조명 재사용'],
      '복합 공사는 자재를 한 건재상에서 묶어야 운반비가 한 번만 나갑니다.',
      '임대·원복',
      { wallpaper: '소폭 합지 화이트', floor: '1.8T 모노륨 장판', tile: '300×600 국산타일' }
    ),
    SET(
      'comb-standard',
      '표준',
      '표준 패키지',
      '광폭 합지 · 600각 타일',
      1,
      ['광폭 합지 화이트 + 2.0T 장판', '600×600 포세린 타일', '4000K 매입등'],
      '같은 팀이 도배·타일을 연속으로 하면 인력 대기 시간이 줄어 5~8% 절약됩니다.',
      '거주용 표준',
      { wallpaper: '광폭 합지 화이트', floor: '2.0T 모노륨 장판', tile: '600×600 포세린' }
    ),
    SET(
      'comb-premium',
      '고급',
      '고급 패키지',
      '실크 · 대형 포세린',
      1.14,
      ['실크 벽지(샴페인)', '2.2T 모노륨 장판', '600×1200 포세린 욕실', '매립수전 + 간접등'],
      '실크+대형 타일 조합은 로스가 큽니다. 자재 여유분 15%와 재단비를 견적에 넣으세요.',
      '신축·호텔 분위기',
      { wallpaper: '실크 벽지(샴페인)', floor: '2.2T 모노륨 장판', tile: '600×1200 포세린' }
    ),
  ],
};

const PRESET_TIER = { value: 'budget', clean: 'standard', modern: 'standard', wood: 'standard', premium: 'premium' };

export function materialSetsFor(trade) {
  return MATERIAL_SETS[trade] || null;
}

// 현장에 저장된 선택(id) → 없으면 디자인 등급에서 기본 세트를 고른다.
export function materialSetFor(c, tradeOverride) {
  const trade = TRADES[tradeOverride || c?.trade] ? tradeOverride || c.trade : 'combined';
  const sets = MATERIAL_SETS[trade];
  if (!sets || !sets.length) return null;
  const saved = c?.materialSet;
  const found = sets.find((s) => s.id === saved);
  if (found) return found;
  const preset = c?.design?.preset;
  const tier = PRESET_TIER[preset] || 'standard';
  return sets.find((s) => s.tier === tier || s.id.endsWith(tier)) || sets[Math.min(1, sets.length - 1)];
}

export function materialSetLabel(c, trade) {
  const set = materialSetFor(c, trade);
  return set ? `${set.tier} · ${set.label}` : '자재 선택 없음';
}

// 현장 다빈도 브랜드별 기준 가격 (참고용 · 2026 하반기 지역 시세, 부가세 별도)
// 인테리어 마감 공종에서만 보여준다 — 폐기물·철거·인력에는 자재 비교가 의미 없다.
export const BRAND_PRICES = {
  wallpaper: [
    { label: '개나리·신한 광폭합지', price: '약 2.8만/롤', note: '실속 · 롤당 5평' },
    { label: 'LX하우시스 지아 실크', price: '약 5만/롤', note: '실크 · 친환경' },
    { label: 'KCC 1.8T 장판', price: '약 2.8만/평', note: '실속 장판' },
    { label: 'LX 2.2T 장판', price: '약 4.2만/평', note: '두꺼운 장판' },
  ],
  bathroom: [
    { label: '국산 OEM 도기·수전', price: '약 35만/세트', note: '실속' },
    { label: '대림바스·이누스', price: '약 50만/세트', note: 'A/S 가능' },
    { label: '아메리칸스탠다드', price: '약 90만/세트', note: '고급' },
    { label: '국산 300×600 타일', price: '약 1.2만/㎡', note: '실속' },
    { label: '수입 포세린 600×1200', price: '약 2.5만/㎡', note: '고급' },
  ],
  kitchen: [
    { label: '사제 E0 상·하부장', price: '약 120만/3.2m', note: '실속' },
    { label: '한샘·리바트', price: '약 190만/3.2m', note: '브랜드' },
    { label: '인조대리석 상판', price: '약 16만/m', note: '표준' },
    { label: '엔지니어드 스톤', price: '약 28만/m', note: '고급' },
  ],
  tilewaterproof: [
    { label: '쌍곰·아덱스 액체방수', price: '약 2.5만/말', note: '실속' },
    { label: '도막방수(폴리우레탄)', price: '약 6만/말', note: '표준·고급' },
    { label: '국산 300×300 타일', price: '약 0.9만/㎡', note: '실속' },
    { label: '600×600 포세린', price: '약 1.8만/㎡', note: '표준' },
  ],
  window: [
    { label: '국산 PVC 이중창', price: '약 12만/㎡', note: '실속' },
    { label: 'LX·KCC 시스템창', price: '약 20만/㎡', note: '표준' },
    { label: '독일식 알루미늄', price: '약 30만/㎡', note: '고급·방음' },
  ],
  plaster: [
    { label: '일반 몰탈(25kg)', price: '약 6천원/포', note: '실속' },
    { label: '고강도 몰탈(25kg)', price: '약 9천원/포', note: '표준' },
    { label: '자동수평 몰탈', price: '약 1.4만/포', note: '고급' },
  ],
  repair: [
    { label: '대체 규격 자재', price: '정품의 70%', note: '실속' },
    { label: '제조사 정품 부품', price: '기준가', note: '표준' },
  ],
  combined: [
    { label: '광폭합지 + 1.8T 장판', price: '약 2.8만/롤 · 2.8만/평', note: '실속' },
    { label: '실크 + 2.2T 장판', price: '약 5만/롤 · 4.2만/평', note: '고급' },
    { label: '국산 도기 세트', price: '약 35~50만', note: '욕실 포함 시' },
  ],
};

export function brandPricesFor(trade) {
  return BRAND_PRICES[trade] || null;
}


// ---- 복합(집 전체) 현장: 포함 공종마다 등급별 자재 사양을 전부 나열한다 ----
const SCOPE_SPECS = {
  demolition: {
    value: ['철거 범위 정리 후 평탄 마감', '철거 폐기물 성상 분리(5종)'],
    clean: ['철거 후 바닥 평탄·먼지 제거', '폐기물 성상 분리 반출'],
    modern: ['노출 철거 마감(천장 정리)', '무지 그레이 데코타일', '배관 은폐 정리'],
    wood: ['철거 후 노출 천장 정리', '오크 패턴 데코타일'],
    premium: ['철거 후 마감재 별도 산정', '대형 타일 바닥', '매립 배관 정리'],
  },
  wallpaper: {
    value: ['소폭 합지 화이트(무지)', '1.8T 모노륨 아이보리', '기본 몰딩'],
    clean: ['광폭 합지 화이트/아이보리', '2.0T 모노륨 라이트오크', '3색 LED'],
    modern: ['합지 무지 화이트/라이트그레이', '1.8T 모노륨 라이트그레이', '무몰딩 + 4000K 간접등'],
    wood: ['광폭 합지 화이트 + 오크 걸레받이 60mm', '2.2T 모노륨 오크 패턴', '3000K 다운라이트'],
    premium: ['실크 벽지(샴페인) + 우드 몰딩', '2.5T 모노륨 샴페인', '2700K 간접등 + 스포트'],
  },
  bathroom: {
    value: ['300×600 국산타일(무광 화이트)', '국산 도기·수전 세트', '3000K 방습등', '액체방수 2회 + 담수 48시간'],
    clean: ['300×600 무광 화이트 타일', '국산 크롬 수전·도기', '4000K 방습등', '방수 2회 + 담수시험'],
    modern: ['600×1200 포세린 그레이(벽) + 300각 바닥', '무광 블랙 수전', '4000K 매입등 + 거울 간접등', '방수 2회 + 담수시험'],
    wood: ['600각 포세린 화이트 + 오크 패턴 바닥', '무광 니켈 수전·악세사리', '3000K 매입등 4인치 ×2'],
    premium: ['600×1200 대형 포세린 + 600각 헤링본 바닥', '무광 니켈 매립수전 + 우드 도어', '3000K 간접등 + 거울등'],
  },
  kitchen: {
    value: ['LPM 아이보리 상·하부장', '인조대리석 아이보리 상판', '기존 후드 재사용'],
    clean: ['LPM 화이트 상·하부장', '인조대리석 화이트', '언더캐비닛등'],
    modern: ['무광 그레이 도어 상·하부장', '인조대리석 화이트 무광 상판', '매립 손잡이 + 4000K 언더등'],
    wood: ['LPM 화이트 상부장 + 오크 하부장', '인조대리석 화이트 상판(무광)', '무광 니켈 손잡이 + 3000K 언더등'],
    premium: ['LPM 무광 샴페인 도어', '엔지니어드 스톤 상판', '3000K 펜던트 + 언더등'],
  },
  entrance: {
    value: ['현관 타일 300각 국산', '기본 신발장(도장 문)', '기본 중문(3연동)'],
    clean: ['현관 타일 300×600 무광', '신발장(무늬 필름)', '3연동 중문'],
    modern: ['현관 타일 600각 그레이', '무광 화이트 신발장', '슬라이딩 중문(무광 블랙)'],
    wood: ['현관 타일 오크 패턴', '오크 신발장', '중문(우드 프레임)'],
    premium: ['현관 포세린 대형 타일', '맞춤 신발장(무광 샴페인)', '중문 + 간접등'],
  },
  plaster: {
    value: ['바닥 몰탈 미장(평탄)', '기본 양생'],
    clean: ['몰탈 미장 + 메쉬 보강', '양생 3일'],
    modern: ['몰탈 미장 + 메쉬 보강', '자기평탄 모르타르', '양생 3일'],
    wood: ['몰탈 미장 + 메쉬 보강', '양생 3일'],
    premium: ['몰탈 미장 + 메쉬·철근 보강', '자기평탄 마감', '양생 5일'],
  },
  window: {
    value: ['국산 2중창(복층유리)'],
    clean: ['국산 2중창 + 방충망'],
    modern: ['시스템 창호(무광 블랙 프레임)'],
    wood: ['시스템 창호(우드 프레임)'],
    premium: ['시스템 창호(로이유리) + 방범창'],
  },
  carpentry: {
    value: ['기본 몰딩·문틀(MDF)', '도장 문'],
    clean: ['몰딩·걸레받이 + 도장 문'],
    modern: ['무몰딩 + 히든도어'],
    wood: ['오크 몰딩·문틀', '원목 도어'],
    premium: ['우드 몰딩 + 히든도어', '맞춤 목공'],
  },
  electric: {
    value: ['기본 스위치·콘센트', '국산 LED'],
    clean: ['국산 스위치·콘센트', '4000K LED'],
    modern: ['무광 스위치', '매입등 4000K'],
    wood: ['무광 니켈 스위치', '3000K 다운라이트'],
    premium: ['무광 스위치 + 간접등', '2700K 스포트'],
  },
};

const TIER_KEYS = { 실속: 'value', 표준: 'clean', 고급: 'premium' };

export function combinedScopeSpecs(presetId, scopes = [], tier = 'clean') {
  const key = ['value', 'clean', 'modern', 'wood', 'premium'].includes(presetId) ? presetId : TIER_KEYS[tier] || 'clean';
  const order = ['demolition', 'wallpaper', 'bathroom', 'kitchen', 'entrance', 'plaster', 'carpentry', 'electric', 'window'];
  const out = [];
  order.forEach((sc) => {
    if (!scopes.includes(sc)) return;
    const name = { demolition: '철거', wallpaper: '도배·장판', bathroom: '욕실', kitchen: '주방', entrance: '현관', plaster: '바닥 미장', carpentry: '문·몰딩', electric: '전기·조명', window: '창호' }[sc];
    (SCOPE_SPECS[sc]?.[key] || []).forEach((line) => out.push(`${name} · ${line}`));
  });
  return out;
}

export function combinedBrandPrices(scopes = []) {
  const list = [];
  const push = (sc, ...rows) => {
    if (scopes.includes(sc)) rows.forEach((r) => list.push(r));
  };
  push('wallpaper',
    { label: '개나리·신한 광폭합지', price: '약 2.8만/롤', note: '도배 · 실속' },
    { label: 'LX 지아 실크', price: '약 5만/롤', note: '도배 · 고급' },
    { label: 'KCC 1.8T 장판', price: '약 2.8만/평', note: '장판 · 실속' },
    { label: 'LX 2.2T 장판', price: '약 4.2만/평', note: '장판 · 고급' });
  push('bathroom',
    { label: '국산 OEM 도기·수전', price: '약 35만/세트', note: '욕실 · 실속' },
    { label: '대림바스·이누스', price: '약 50만/세트', note: '욕실 · A/S' },
    { label: '600×1200 포세린', price: '약 4.5만/㎡', note: '욕실 · 고급' });
  push('kitchen',
    { label: 'LPM 싱크대(상·하부장)', price: '약 60만/m', note: '주방 · 실속' },
    { label: '인조대리석 상판', price: '약 16만/m', note: '주방 · 표준' },
    { label: '엔지니어드 스톤 상판', price: '약 28만/m', note: '주방 · 고급' });
  push('entrance',
    { label: '3연동 중문', price: '약 25~40만', note: '현관' },
    { label: '신발장(맞춤)', price: '약 25~60만', note: '현관' },
    { label: '현관 타일', price: '약 3만/㎡', note: '현관' });
  push('plaster',
    { label: '몰탈 미장', price: '약 2.8만/㎡', note: '바닥 미장' },
    { label: '자기평탄 모르타르', price: '약 3.5만/㎡', note: '고급' });
  push('window',
    { label: '국산 2중창', price: '약 28만/㎡', note: '창호' },
    { label: '시스템 창호(로이유리)', price: '약 40만/㎡', note: '창호 · 고급' });
  return list;
}
