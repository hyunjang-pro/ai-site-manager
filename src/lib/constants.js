// 앱 전역 상수 — 공종, 단계, 수금 상태, 지역, 디자인 프리셋
export const STORAGE_KEY = 'aiSiteManager.v1';

export const TRADES = {
  demolition: {
    id: 'demolition',
    label: '상가·주택 철거',
    short: '철거',
    emoji: '🔨',
    defaultMargin: 20,
    defaultUnit: '평',
    accent: 'slate',
  },
  wallpaper: {
    id: 'wallpaper',
    label: '도배·장판',
    short: '도배',
    emoji: '🏠',
    defaultMargin: 20,
    defaultUnit: '평',
    accent: 'amber',
  },
  bathroom: {
    id: 'bathroom',
    label: '욕실 리모델링',
    short: '욕실',
    emoji: '🛁',
    defaultMargin: 30,
    defaultUnit: '칸',
    accent: 'sky',
  },
  kitchen: {
    id: 'kitchen',
    label: '주방·싱크대',
    short: '주방',
    emoji: '🍳',
    defaultMargin: 25,
    defaultUnit: 'm',
    accent: 'rose',
  },
  tilewaterproof: {
    id: 'tilewaterproof',
    label: '타일·방수',
    short: '타일·방수',
    emoji: '🧱',
    defaultMargin: 28,
    defaultUnit: '㎡',
    accent: 'cyan',
  },
  plaster: {
    id: 'plaster',
    label: '미장·바닥',
    short: '미장',
    emoji: '🪣',
    defaultMargin: 28,
    defaultUnit: '㎡',
    accent: 'orange',
  },
  window: {
    id: 'window',
    label: '발코니·창호',
    short: '창호',
    emoji: '🪟',
    defaultMargin: 25,
    defaultUnit: '㎡',
    accent: 'sky',
  },
  waste: {
    id: 'waste',
    label: '폐기물 수거·처리',
    short: '폐기물',
    emoji: '🚛',
    defaultMargin: 22,
    defaultUnit: '톤',
    accent: 'amber',
  },
  labor: {
    id: 'labor',
    label: '인력 지원(일용직)',
    short: '인력',
    emoji: '👷',
    defaultMargin: 18,
    defaultUnit: '명',
    accent: 'slate',
  },
  carpentry: {
    id: 'carpentry',
    label: '목공·문·몰딩',
    short: '목공',
    emoji: '🪚',
    defaultMargin: 25,
    defaultUnit: 'm',
    accent: 'amber',
  },
  electric: {
    id: 'electric',
    label: '전기·조명',
    short: '전기',
    emoji: '💡',
    defaultMargin: 25,
    defaultUnit: '개소',
    accent: 'yellow',
  },
  plumbing: {
    id: 'plumbing',
    label: '설비·배관',
    short: '설비',
    emoji: '🚰',
    defaultMargin: 25,
    defaultUnit: '개소',
    accent: 'sky',
  },
  film: {
    id: 'film',
    label: '필름·시트지',
    short: '필름',
    emoji: '🪞',
    defaultMargin: 25,
    defaultUnit: '㎡',
    accent: 'teal',
  },
  groundwork: {
    id: 'groundwork',
    label: '기초·토목 (맨땅)',
    short: '토목',
    emoji: '⛏️',
    defaultMargin: 22,
    defaultUnit: '㎡',
    accent: 'stone',
  },
  repair: {
    id: 'repair',
    label: '부분 수선',
    short: '수선',
    emoji: '🔧',
    defaultMargin: 25,
    defaultUnit: '개소',
    accent: 'rose',
  },
  combined: {
    id: 'combined',
    label: '복합 인테리어',
    short: '복합',
    emoji: '🧩',
    defaultMargin: 25,
    defaultUnit: '평',
    accent: 'indigo',
  },
  custom: {
    id: 'custom',
    label: '기타 직접 입력',
    short: '기타',
    emoji: '✍️',
    defaultMargin: 25,
    defaultUnit: '평',
    accent: 'zinc',
  },
  unclassified: {
    id: 'unclassified',
    label: '미분류 (내용 입력 시 자동 분류)',
    short: '미분류',
    emoji: '❓',
    defaultMargin: 25,
    defaultUnit: '평',
    accent: 'zinc',
  },
};

export const TRADE_LIST = [
  TRADES.demolition,
  TRADES.wallpaper,
  TRADES.bathroom,
  TRADES.kitchen,
  TRADES.tilewaterproof,
  TRADES.plaster,
  TRADES.window,
  TRADES.carpentry,
  TRADES.electric,
  TRADES.plumbing,
  TRADES.film,
  TRADES.groundwork,
  TRADES.waste,
  TRADES.labor,
  TRADES.repair,
  TRADES.combined,
  TRADES.custom,
];

// 장부 단계 (현황판 카운트와 동일)
export const STAGES = [
  { id: 'prelim', label: '가견적', short: '가견적', hint: '첫 통화·요청서 단계' },
  { id: 'survey', label: '실측예정', short: '실측', hint: '현장 실측 전' },
  { id: 'working', label: '시공중', short: '시공중', hint: '철거·시공 진행' },
  { id: 'balance', label: '잔금대기', short: '잔금', hint: '준공 후 정산 전' },
  { id: 'closed', label: '정산 완료', short: '완료', hint: '보관함으로 이동' },
];

export const STAGE_LABEL = STAGES.reduce((acc, s) => {
  acc[s.id] = s.label;
  return acc;
}, {});

export const COLLECTION_STAGES = [
  { id: 'deposit_wait', label: '계약금 대기', tone: 'zinc' },
  { id: 'deposit_paid', label: '계약금 입금', tone: 'sky' },
  { id: 'mid_paid', label: '중도금 완료', tone: 'indigo' },
  { id: 'balance_wait', label: '잔금 대기', tone: 'amber' },
  { id: 'settled', label: '정산 완료', tone: 'emerald' },
];

export const COLLECTION_LABEL = COLLECTION_STAGES.reduce((acc, s) => {
  acc[s.id] = s.label;
  return acc;
}, {});

export const REGIONS = [
  '안동',
  '포항',
  '구미',
  '경주',
  '김천',
  '영주',
  '영천',
  '상주',
  '문경',
  '경산',
  '칠곡',
  '성주',
  '예천',
  '봉화',
  '울진',
  '의성',
  '청송',
  '영덕',
  '청도',
  '고령',
  '기타',
];

// 평수 강제 입력 금지 — 자유 단위 + '모름'
export const SIZE_UNITS = ['평', '㎡', 'm', '칸', '개', '개소', '톤', '명', '일', '모름'];

export const STAGE_KEYS = STAGES.map((s) => s.id);

// 실측 체크리스트 4분류 (15개 이상)
export const SURVEY_GROUPS = [
  {
    id: 'access',
    title: '① 자재·폐기물 운반',
    icon: '🚚',
    items: [
      { id: 'noElevator', label: '엘리베이터 없음', hint: '층수만큼 계단으로 올리고 내리는 인력비' },
      { id: 'ladderBlocked', label: '사다리차 설치 불가', hint: '주차·소방통로·전선 문제' },
      { id: 'longCarry', label: '현관까지 30m 이상', hint: '자재·폐기물 운반 동선' },
      { id: 'materialLift', label: '자재를 층까지 올리는 인력 필요(양중)', hint: '자재 올리는 인력 15만' },
      { id: 'ladderSmall', label: '사다리차 소형 필요', hint: '4층 규모 1회 12만' },
      { id: 'noParking', label: '차량 진입·주차 곤란', hint: '차를 세우고 기다리는 시간 발생' },
      { id: 'narrowDoor', label: '출입문·복도가 좁음', hint: '대형 자재 반입 제한' },
    ],
  },
  {
    id: 'structure',
    title: '② 구조·설비',
    icon: '🧱',
    items: [
      { id: 'loadBearingWall', label: '내력벽 철거 희망', hint: '구조 심의 없이는 불법' },
      { id: 'floorHeatingPipe', label: '바닥 난방배관 매설', hint: '저속 파쇄·보수 예비비' },
      { id: 'existingLeak', label: '기존 누수·곰팡이 흔적', hint: '방수 보강 별도' },
      { id: 'oldPlumbing', label: '노후 급배수관', hint: '교체 여부 고객 확인' },
      { id: 'asbestosRisk', label: '텍스·슬레이트 의심', hint: '석면 조사 선행' },
    ],
  },
  {
    id: 'site',
    title: '③ 현장 규정',
    icon: '📋',
    items: [
      { id: 'workTimeLimit', label: '작업시간 제한(10:30~17:00 등)', hint: '공사 기간이 늘어난 인건비' },
      { id: 'noWeekend', label: '주말·공휴일 공사 불가', hint: '일정 자동 제외' },
      { id: 'adminDeposit', label: '관리사무소 신고·동의서', hint: '대행 8만 (예치금은 별도)' },
      { id: 'powerWaterCut', label: '단전·단수 조치 필요', hint: '차단·마감 비용' },
      { id: 'gasFirePermit', label: '가스·소방 작업허가', hint: '허가·보양' },
      { id: 'residential', label: '거주 중 시공', hint: '가구 이동·먼지 관리' },
    ],
  },
  {
    id: 'scope',
    title: '④ 범위·마감',
    icon: '📐',
    items: [
      { id: 'wasteIncluded', label: '폐기물 전부 내보내기 포함', hint: '생활폐기물 제외 명시' },
      { id: 'protectLevel', label: '가리기·먼지막이 필요(보양)', hint: '복도·엘베 보양' },
      { id: 'scopeCreep', label: '추가 요구 가능성 있음', hint: '범위 명시·4종 서면화' },
      { id: 'afterCare', label: '준공 청소 요구', hint: '34평 기준 45만' },
    ],
  },
];

// 철거 범위: 순수 철거 vs 원상복구 (실견적 5-2)
export const DEMOLITION_SCOPES = [
  { value: 'partial', label: '순수 철거만', hint: '마감재는 별도 (실견적 135~237만/15평)' },
  { value: 'restore', label: '원상복구까지', hint: '천장·벽체·바닥 마감 정리 (+평당 6만)' },
];

// 욕실 공법 (실견적 5-2: 덧방은 철거·방수만 절감, 타일공 2품은 동일)
export const BATHROOM_METHODS = [
  { value: 'full', label: '전체 철거', hint: '철거 80만 + 방수 20만' },
  { value: 'overlay', label: '덧방(기존 타일 위에 붙이기)', hint: '철거·방수 생략 (들뜸·누수 이력 없을 때만)' },
  { value: 'ubr', label: 'UBR 조립식 철거', hint: '철거 +90만 추가' },
];

// 누락 1순위 5줄
export const MISSING_LINES = [
  { id: 'protectLevel', label: '보양', amount: 8, hint: '엘베·복도·현관 1곳' },
  { id: 'adminDeposit', label: '관리사무소 신고', amount: 8, hint: '동의서 대행' },
  { id: 'materialLift', label: '자재 올리기', amount: 15, hint: '자재를 층까지' },
  { id: 'ladderSmall', label: '사다리차 소형', amount: 12, hint: '4층 규모 1회' },
  { id: 'afterCare', label: '준공 청소', amount: 45, hint: '34평 기준' },
];

export const EVIDENCE_SPOTS = [
  { id: 'floor', label: '바닥', hint: '전체샷 + 근접샷' },
  { id: 'wall', label: '벽', hint: '긁힘·곰팡이 위치' },
  { id: 'ceiling', label: '천장', hint: '누수·얼룩' },
  { id: 'hallway', label: '복도', hint: '공용부 파손' },
  { id: 'elevator', label: '승강기 내부', hint: '문·패널' },
  { id: 'neighbor', label: '아래집·옆집', hint: '기존 균열·누수 흔적' },
];

export const HARD_DETAILS = [
  { id: 'jollycut', label: '졸리컷(곡면 타일 재단)', rate: 15, days: 1 },
  { id: 'nomolding', label: '무몰딩(몰딩 없는 마감)', rate: 10, days: 1 },
  { id: 'hiddendoor', label: '히든도어', rate: 25, days: 2 },
  { id: 'recessedfaucet', label: '매립수전', rate: 20, days: 1 },
  { id: 'indirectlight', label: '간접등(간접조명)', rate: 15, days: 1 },
];

export const FIRST_CALL_BASE = [
  '엘리베이터 유무와 층수를 알려주세요. (자재 올리는 비용이 견적의 10~20%를 바꿉니다)',
  '철거·시공 범위 사진 3장(바닥·욕실·주방)을 보내주세요.',
  '희망 착공일과 거주 중 여부를 알려주세요. (일정과 보양비가 달라집니다)',
];

export const WASTE_TYPE_LABEL = {
  concrete: '폐콘크리트',
  construction: '건설폐재류',
  mixed: '혼합건설폐기물',
  boardMixed: '폐보드·판넬 혼합',
  asbestos: '폐석면',
};

export const REGION_DEFAULT = '안동';

// 2026 하반기 보수적 원가 기본값 (설정에서 0·5·6·8%로 바꿀 수 있음)
export const BUFFER_OPTIONS = [0, 5, 6, 8];
export const BUFFER_DEFAULT = 6;

export const WORK_TYPES = [
  { id: 'all', label: '전체' },
  { id: 'demolition', label: '철거·해체', trades: ['demolition'] },
  { id: 'wallpaper', label: '도배·장판', trades: ['wallpaper'] },
  { id: 'tilewaterproof', label: '타일·방수', trades: ['tilewaterproof', 'plaster', 'bathroom'] },
  { id: 'window', label: '창호·발코니', trades: ['window'] },
  { id: 'interior', label: '실내건축·수선', trades: ['repair', 'kitchen', 'combined', 'custom'] },
  { id: 'waste', label: '폐기물', trades: ['waste'] },
  { id: 'labor', label: '인력', trades: ['labor'] },
];
