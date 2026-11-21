import { needsLadder } from './pricing.js';

// 답사에서 '왜·뭘 확인해야 하나' — AI가 있으면 이 현장에 맞춰 만들고, 없을 때만 공종별 기본값을 쓴다.
// ① 3단계 답사 카드(4줄: 확인/왜/이렇게) ② 2단계 3자 검증의 '답사 시 꼭 확인하세요' 짧은 목록이 같은 소스를 쓴다.

// 공종별 기본 가이드 — AI 미연결·생성 실패 때만 쓰는 폴백
export const LOCAL_SURVEY_GUIDE = {
  demolition: [
    { check: '사다리차 자리(주차·전선·소방통로)', why: '차를 못 세우면 인력으로 내려야 해서 양중비 15~35만이 붙습니다.', how: '건물 앞에 서서 창문까지 거리와 전선 높이를 눈으로 확인' },
    { check: '천장 위 숨은 물량(텍스·단열재)', why: '보이지 않던 철거재가 나오면 폐기물 차량이 한 대 더 필요합니다.', how: '천장 한 칸을 손으로 들춰보고 사진' },
    { check: '엘리베이터·복도 보양 필요 여부', why: '공용부 파손은 우리 배상입니다. 보양비 8만이 빠지면 그대로 손해.', how: '관리사무소에 보양 규정과 예치금 확인' },
    { check: '석면 의심 자재(텍스·슬레이트)', why: '석면이면 조사·철거·처리비 300만 이상, 일정도 2주 늘어납니다.', how: '준공연도와 천장재를 확인해 앱 석면 경보에 입력' },
  ],
  waste: [
    { check: '짐의 양과 성상(섞였는지)', why: '섞인 마대는 처리비가 3~6배가 됩니다. 1톤으로 될 일이 2.5톤이 됩니다.', how: '현장에 들어가 짐 더미 앞에서 사진, 마대별 재질 확인' },
    { check: '반입 가능 시간·처리장', why: '처리장 마감 시간을 놓치면 차량이 하루 더 붙습니다.', how: '가까운 처리장 반입 시간을 확인하고 상차 시간을 정함' },
    { check: '엘리베이터·계단 폭', why: '엘베가 없거나 좁으면 인력 양중비가 추가됩니다.', how: '엘베 유무와 문 폭을 확인, 필요하면 1톤차로 나눠 반출' },
    { check: '재활용·고철 분리 가능 여부', why: '고철·종이를 나누면 처리비가 줄고 일부는 되팔 수 있습니다.', how: '고철·가전 유무를 확인해 분리 여부 결정' },
  ],
  labor: [
    { check: '필요 인원과 숙련도', why: '결원 1명이면 일당 18만 + 공정 1일 지연입니다.', how: '작업량을 보고 몇 명·며칠인지 정해 문자로 확정' },
    { check: '작업 범위(무엇까지)', why: '범위를 말로만 하면 “그건 안 했다” 분쟁이 생깁니다.', how: '사진과 함께 범위를 문자로 남김' },
    { check: '집결 장소·주차·출입', why: '인부가 헛걸음하면 하루 일당을 그냥 잃습니다.', how: '집결 위치와 주차 가능 여부를 확인' },
    { check: '기초안전보건교육 이수증', why: '미이수 인력을 투입하면 현장 지적·과태료 대상입니다.', how: '이수증 사진을 미리 받아 둠' },
  ],
  wallpaper: [
    { check: '벽 곰팡이·누수 흔적', why: '초배·방수 보수가 추가되면 30만 이상 올라갑니다.', how: '창가·모서리·아래쪽 벽을 손으로 만져 확인' },
    { check: '기존 벽지 층수(2겹 이상)', why: '겹이 많으면 제거비·시간이 늘어 공사 기간이 하루 늘어납니다.', how: '한쪽 벽지를 살짝 들춰 층수 확인' },
    { check: '몰딩·걸레받이 교체 여부', why: '교체하면 자재·목공비가 따로 붙습니다.', how: '고객에게 “기존 것 그대로 쓸지” 확인' },
    { check: '가구 이동 범위', why: '거주 중이면 보양·가구 이동 12만이 필요합니다.', how: '가구가 남는지, 누가 옮기는지 확인' },
  ],
  bathroom: [
    { check: '아래층 누수 이력', why: '누수 흔적이 있으면 방수 보강비 30만이 붙습니다.', how: '아래층 천장 사진을 요청하거나 직접 확인' },
    { check: '담수 시험 가능 여부', why: '담수 48시간을 못 하면 하자 책임을 우리가 다 집니다.', how: '세대 출입 가능 시간과 물 사용 가능 여부 확인' },
    { check: '기존 배관 부식', why: '배관까지 교체하면 25만 이상 추가입니다.', how: '수전을 열어 물색·수압 확인' },
    { check: '바닥 단차·문턱 높이', why: '단차가 크면 미장·방수 두께가 늘어 자재비가 올라갑니다.', how: '문턱과 바닥 높이를 재어 기록' },
  ],
  kitchen: [
    { check: '급수·배수 위치 변경 여부', why: '위치를 바꾸면 배관 이설 25만 이상입니다.', how: '싱크볼·수전 위치를 사진으로 남기고 고객에게 확인' },
    { check: '가스 배관 이설·차단', why: '가스 이설은 허가·차단 비용이 따로 듭니다.', how: '가스레인지 위치와 밸브 위치 확인' },
    { check: '상판 실측(수전 홀·싱크볼)', why: '상판은 가공 후 변경이 안 됩니다. 틀리면 상판값을 우리가 냅니다.', how: '벽에서 중심까지 실측해 앱에 입력' },
    { check: '후드·가전 재사용', why: '재사용하면 자재비를 줄일 수 있습니다.', how: '후드·식세기 상태와 재사용 여부 확인' },
  ],
  tilewaterproof: [
    { check: '기존 방수층 상태', why: '방수층이 죽어 있으면 철거 후 재방수가 필수입니다.', how: '담수 흔적·들뜸을 확인' },
    { check: '담수시험 가능 여부', why: '시험을 못 하면 누수 배상 책임이 고스란히 남습니다.', how: '배수구·문턱 높이 확인' },
    { check: '배수구 구배·트렌치', why: '물이 고이면 재시공입니다.', how: '물을 부어 흐름을 확인' },
    { check: '대형 타일 로스', why: '600각 이상은 로스가 15%까지 늘어 자재비가 올라갑니다.', how: '시공 면적과 타일 규격을 함께 기록' },
  ],
  plaster: [
    { check: '바닥 단차·들뜸', why: '단차가 크면 미장 두께가 늘어 자재·인건비가 올라갑니다.', how: '수평자를 대어 단차 확인' },
    { check: '난방배관 매설 위치', why: '배관을 건드리면 보수비 35만이 붙습니다.', how: '분배기 위치와 배관 방향 확인' },
    { check: '문턱 높이(미장 두께)', why: '미장 후 문이 안 닫히면 문턱까지 손봐야 합니다.', how: '문턱과 바닥 높이 비교' },
    { check: '양생 기간·출입 통제', why: '양생 전 출입하면 바닥이 깨져 재시공입니다.', how: '며칠 출입 통제가 가능한지 확인' },
  ],
  window: [
    { check: '창틀 폭·철거 가능 여부', why: '틀 폭이 좁으면 시공 방식이 바뀌어 단가가 올라갑니다.', how: '줄자로 창틀 안쪽 폭 실측' },
    { check: '외벽 균열·누수', why: '외벽 실리콘 보수는 별도 비용입니다.', how: '창 주변 외벽을 눈으로 확인' },
    { check: '방충망·방범창 재사용', why: '재사용하면 자재비를 줄일 수 있습니다.', how: '상태 확인 후 고객과 결정' },
    { check: '층고·양중 장비', why: '고층은 사다리차나 양중 장비가 필요합니다.', how: '층수와 창 아래 주차 공간 확인' },
  ],
  carpentry: [
    { check: '문틀 규격·개수(폭·높이)', why: '규격이 다르면 맞춤 제작으로 자재비가 2~3배 붙습니다.', how: '문틀 안쪽 폭·높이를 줄자로 실측' },
    { check: '기존 문·몰딩 재사용 여부', why: '재사용하면 자재·철거비를 줄일 수 있습니다.', how: '손으로 흔들어 고정 상태 확인 후 고객과 결정' },
    { check: '도장 범위(문짝 페인트)', why: '도장은 별도 인건비·건조 일정이 붙습니다.', how: '문짝·몰딩 중 어디까지 도장할지 확인' },
    { check: '벽체 수평·바탕 상태', why: '무몰딩은 수평 오차 3mm 이내여야 해서 벽 보정비가 붙습니다.', how: '수평자를 대어 벽 기울기 확인' },
  ],
  film: [
    { check: '유리 면적·곡면 여부', why: '곡면·대형 유리는 로스가 커 자재비가 올라갑니다.', how: '가로·세로를 실측하고 곡면 여부 확인' },
    { check: '필름 종류(열차단·사생활)', why: '종류에 따라 자재가가 2배 이상 차이 납니다.', how: '채광과 사생활 중 무엇이 우선인지 고객에게 확인' },
    { check: '기존 필름 유무', why: '기존 필름 제거는 별도 인건비입니다.', how: '유리 모서리를 손톱으로 긁어 확인' },
    { check: '유리 하자(기포·긁힘)', why: '작업 전 하자를 안 남기면 우리 책임이 됩니다.', how: '시공 전 유리 전체를 사진으로 촬영' },
  ],
  groundwork: [
    { check: '지반 상태(연약·암)', why: '암이나 연약지반이면 장비·기간이 2배로 늘어납니다.', how: '삽으로 파보거나 기존 터파기 단면 확인' },
    { check: '매설 배관·전선', why: '건드리면 관공서 신고와 복구비가 발생합니다.', how: '지자체 도면 확인, 필요하면 탐지기 사용' },
    { check: '잔토 반출량·되메우기', why: '남는 흙 처리비가 견적에서 자주 빠집니다.', how: '터파기 깊이·면적으로 흙량 계산' },
    { check: '장비 진입로·폭', why: '굴삭기가 못 들어오면 소형 장비로 나눠 공사합니다.', how: '진입로 폭과 상부 전선 높이 확인' },
  ],
  electric: [
    { check: '분전함 용량·차단기', why: '증설이 필요하면 한전 승압 비용이 따로 듭니다.', how: '분전함을 열어 차단기 용량 사진 촬영' },
    { check: '배선 노후 상태', why: '재배선은 천장·벽 철거가 함께 붙습니다.', how: '콘센트 한 곳을 열어 배선 피복 확인' },
    { check: '조명 위치·개수', why: '위치를 바꾸면 배선 추가로 개소당 비용이 붙습니다.', how: '고객과 도면·사진으로 위치 확정' },
    { check: '접지·누전 여부', why: '누전이 있으면 원인 찾는 시간이 공사비에 붙습니다.', how: '누전차단기 테스트 버튼으로 확인' },
  ],
  plumbing: [
    { check: '기존 배관 재질(아연·PB)', why: '노후 배관은 부분 보수보다 동시 교체가 남는 장사입니다.', how: '수전을 열어 배관 색·재질 확인' },
    { check: '수압·온수 상태', why: '수압이 약하면 감압밸브·부스터 비용이 붙습니다.', how: '수도꼭지 두 곳을 동시에 열어 확인' },
    { check: '매립 배관 위치', why: '위치를 모르고 타공하면 누수 배상입니다.', how: '도면 확인, 필요하면 배관 탐지기 사용' },
    { check: '배수 구배·막힘', why: '구배가 없으면 역류로 재시공입니다.', how: '물을 부어 흐름과 냄새 확인' },
  ],
  repair: [
    { check: '보수 부위 규격·단종 여부', why: '단종 자재는 대체품으로 색·질감이 달라집니다.', how: '모델명과 부위 사진 확보' },
    { check: '기존 색·재질 일치', why: '색이 다르면 부분 교체가 눈에 띕니다.', how: '실내 조명 아래에서 기존 부위와 대조' },
    { check: '숨은 손상 범위', why: '벗겨보면 범위가 늘어 견적이 두 배가 됩니다.', how: '한 곳을 열어 뒤쪽 상태 확인' },
    { check: 'A/S 기간·조건', why: '보증이 없으면 재방문 비용을 우리가 냅니다.', how: '자재 보증서와 업체 A/S 조건 확인' },
  ],
  custom: [
    { check: '작업 범위 서면화', why: '말로만 정하면 나중에 “그건 빼고 했잖아”가 됩니다.', how: '범위를 문자·사진으로 남김' },
    { check: '자재 반입·양중', why: '양중비가 견적에서 가장 자주 빠집니다.', how: '엘베·계단·주차 확인' },
    { check: '폐기물 처리 주체', why: '누가 버리는지 정하지 않으면 우리가 떠안습니다.', how: '고객과 처리 주체를 확인' },
    { check: '추가 요구 가능성', why: '현장에서 늘어나는 요구가 수익을 지웁니다.', how: '애매한 부분을 미리 목록으로 확인' },
  ],
};

// 3자 검증 카드의 짧은 목록 — AI가 없을 때만 쓴다
export const LOCAL_SURVEY_TIPS = {
  demolition: ['사다리차 진입로·전선·주차 가능 여부', '천장 위 숨은 물량(텍스·단열재)', '석면 의심 자재(텍스·슬레이트)', '엘베 보양·관리실 예치금'],
  bathroom: ['아래층 누수 이력·담수 가능 여부', '기존 배관 부식(교체하면 추가)', '바닥 단차·문턱 높이', '환풍기·배기 통로'],
  wallpaper: ['벽 곰팡이·누수 흔적(초배 추가)', '기존 벽지 층수(2겹 이상이면 제거비)', '몰딩·걸레받이 교체 여부', '가구 이동 범위'],
  kitchen: ['급수·배수 위치 변경 여부', '가스 배관 이설·차단', '상판 실측(수전 홀·싱크볼)', '후드·가전 재사용'],
  tilewaterproof: ['기존 방수층 상태', '담수시험 가능 여부', '배수구 구배·트렌치', '대형 타일 로스 15%'],
  plaster: ['바닥 단차·들뜸', '난방배관 매설 위치', '문턱 높이(미장 두께)', '양생 기간·출입 통제'],
  window: ['창틀 폭·철거 가능 여부', '외벽 균열·누수', '방충망·방범창 재사용', '층고·양중 장비'],
  waste: ['성상 분리 상태(혼합 시 3~6배)', '반입 시간 제한', '허가 처리업체 확인', '계량증명서'],
  labor: ['기초안전보건교육 이수증', '숙련도·인원 확정(전날 18시)', '집결 장소·주차', '작업 범위 서면화'],
  repair: ['보수 부위 규격·단종 여부', '기존 색상·재질 일치', '숨은 손상 범위', 'A/S 기간'],
  carpentry: ['문틀 규격·개수', '몰딩·문 재사용 여부', '도장 범위(문짝)', '벽체 수평·바탕'],
  film: ['유리 면적·곡면', '필름 종류(열차단·사생활)', '기존 필름 제거', '유리 하자(기포·긁힘)'],
  groundwork: ['지반 상태(연약·암)', '매설 배관·전선', '잔토 반출량', '장비 진입로'],
  electric: ['분전함 용량·차단기', '배선 노후', '조명 위치·개수', '접지·누전'],
  plumbing: ['배관 재질(아연·PB)', '수압·온수', '매립 배관 위치', '배수 구배'],
  combined: ['철거 범위와 남길 부분', '창호·가전 제외 항목', '욕실 담수·아래층 확인', '일정 겹침(인력 대기)'],
  custom: ['작업 범위 서면화', '자재 반입·양중', '폐기물 처리 주체', '추가 요구 가능성'],
};

// 복합은 켜 둔 세부 공종에서 2줄씩 가져와 4줄을 만든다 (철거+정지에 '욕실 담수'가 나오지 않게)
const SCOPE_ORDER = ['demolition', 'groundwork', 'bathroom', 'wallpaper', 'kitchen', 'plaster', 'carpentry', 'elec', 'electric', 'plumbing', 'film'];

function rowsForCase(c, calc) {
  const trade = calc?.trade || c?.trade || 'custom';
  if (trade !== 'combined') return LOCAL_SURVEY_GUIDE[trade] || LOCAL_SURVEY_GUIDE.custom;
  const scopes = (Array.isArray(c?.subScopes) ? c.subScopes : []).filter((x) => typeof x === 'string');
  if (!scopes.length) return LOCAL_SURVEY_GUIDE.combined;
  const picked = [];
  SCOPE_ORDER.forEach((sc) => {
    if (!scopes.includes(sc)) return;
    const rows = LOCAL_SURVEY_GUIDE[sc] || [];
    rows.slice(0, 2).forEach((r) => {
      if (picked.length < 4 && !picked.some((x) => x.check === r.check)) picked.push(r);
    });
  });
  return picked.length ? picked : LOCAL_SURVEY_GUIDE.combined;
}

function tipsForCase(c, calc) {
  const trade = calc?.trade || c?.trade || 'custom';
  if (trade !== 'combined') return LOCAL_SURVEY_TIPS[trade] || LOCAL_SURVEY_TIPS.custom;
  const scopes = (Array.isArray(c?.subScopes) ? c.subScopes : []).filter((x) => typeof x === 'string');
  if (!scopes.length) return LOCAL_SURVEY_TIPS.combined;
  const picked = [];
  scopes.forEach((sc) => {
    const tips = LOCAL_SURVEY_TIPS[sc] || [];
    tips.slice(0, 1).forEach((t) => {
      if (picked.length < 4 && !picked.includes(t)) picked.push(t);
    });
  });
  return picked.length ? picked : LOCAL_SURVEY_TIPS.combined;
}

const rowsKey = (c, calc) => rowsForCase(c, calc);

/**
 * 이 현장의 답사 가이드.
 * 1순위: AI가 만든 c.surveyPlan (analyzeSurveyGuideWithGemini)
 * 2순위: 새 현장 분석 때 받은 c.aiAnalysis.surveyChecks
 * 3순위: 공종별 기본값 (AI 미연결·실패)
 */
export function surveyGuideFor(c, calc) {
  const plan = c?.surveyPlan && typeof c.surveyPlan === 'object' ? c.surveyPlan : null;
  const planRows = Array.isArray(plan?.rows) ? plan.rows : [];
  const aiChecks = Array.isArray(c?.aiAnalysis?.surveyChecks) ? c.aiAnalysis.surveyChecks : [];
  const aiRows = planRows.length
    ? planRows
    : aiChecks
        .map((x) => ({ check: x?.label || '', why: x?.why || '', how: x?.how || '' }))
        .filter((x) => x.check);
  // 사다리차는 실제로 세울 수 있는 현장(엘베 없음·2층 이상·부피 큰 반출)에서만 확인 항목으로 꺼낸다.
  const ladderOk = needsLadder(c);
  const rawRows = (aiRows.length ? aiRows : rowsKey(c, calc)).filter(
    (r) => ladderOk || !/사다리차/.test(String(r?.check || ''))
  );
  const rows = rawRows.slice(0, 4);
  const fromAi = aiRows.length > 0;

  const tips = Array.isArray(plan?.tips) && plan.tips.length
    ? plan.tips.slice(0, 4)
    : fromAi
    ? aiRows
        .map((x) => `${x.check}${x.why ? ` — ${x.why}` : ''}`)
        .slice(0, 4)
    : tipsForCase(c, calc);

  return {
    rows,
    tips,
    comment: String(plan?.comment || '').trim(),
    source: fromAi ? 'ai' : 'local',
    model: String(plan?.model || ''),
    at: String(plan?.at || ''),
  };
}

/** AI에 넘길 이 현장 요약 — 공종·규모·건물/관공서 여부까지 */
export function surveyGuideContext(c, calc) {
  const isBid = !!c?.bid || !!c?.bidBudget;
  return [
    `공종: ${calc?.tradeLabel || ''}${c?.tradeName ? ` (${c.tradeName})` : ''}`,
    `규모: ${c?.sizeValue ?? ''}${c?.sizeUnit || ''}`,
    `지역: ${c?.location || c?.region || ''}`,
    `건물: ${c?.asbestos?.usage === 'house' ? '주거' : c?.asbestos?.usage === 'nonhouse' ? '상가·비주거' : '모름'}${c?.asbestos?.builtYear ? ` · ${c.asbestos.builtYear}년 준공` : ''}`,
    `진행: ${isBid ? '관공서 공고 일감' : '일반 고객 현장'}`,
    `층수·엘베: ${c?.lifting?.floor || '?'}층 · 엘베 ${c?.lifting?.elevator === 'yes' ? '있음' : c?.lifting?.elevator === 'no' ? '없음' : '모름'}`,
    `현장 내용: ${String(c?.rawInput || c?.notes || '').slice(0, 600)}`,
    `가견적: ${Math.round(Number(calc?.clientPrice) || 0)}만원 · 보수적 원가 ${Math.round(Number(calc?.costWithBuffer) || 0)}만원`,
  ]
    .filter((line) => line && !line.endsWith(': '))
    .join('\n');
}
